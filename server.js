import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import { mkdirSync, existsSync } from 'fs';
import { readFile, writeFile, unlink } from 'fs/promises';
import { extractText } from './extract.js';
import { extractMusic } from './claude.js';
import { synthesize, ttsUrl } from './tts.js';
import { searchTrack } from './spotify.js';
import { scrapeRadioPage } from './scraper.js';
import { extractAndTranslate, extractTracks, translateTracks } from './translate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.join(__dirname, 'cache', 'uploads');
const BOOKS_DIR = path.join(__dirname, 'cache', 'books');
mkdirSync(UPLOAD_DIR, { recursive: true });
mkdirSync(BOOKS_DIR, { recursive: true });

function bookCachePath(hash) {
  return path.join(BOOKS_DIR, `${hash}.json`);
}

async function loadBookCache(hash) {
  const p = bookCachePath(hash);
  if (!existsSync(p)) return null;
  const data = JSON.parse(await readFile(p, 'utf-8'));
  // Support both old format (array) and new format ({ tracks, playlistTitle })
  return Array.isArray(data) ? { tracks: data, playlistTitle: null } : data;
}

async function saveBookCache(hash, tracks, playlistTitle) {
  await writeFile(bookCachePath(hash), JSON.stringify({ tracks, playlistTitle }, null, 2));
}

const app = express();
const upload = multer({ dest: UPLOAD_DIR });
const jobs = new Map();

// Persist job state to disk so it survives server restarts
const JOBS_DIR = path.join(__dirname, 'cache', 'jobs');
mkdirSync(JOBS_DIR, { recursive: true });

async function persistJob(jobId, state) {
  await writeFile(path.join(JOBS_DIR, `${jobId}.json`), JSON.stringify(state)).catch(() => {});
}

async function loadJob(jobId) {
  // Check memory first, then disk
  if (jobs.has(jobId)) return jobs.get(jobId);
  try {
    const data = JSON.parse(await readFile(path.join(JOBS_DIR, `${jobId}.json`), 'utf-8'));
    jobs.set(jobId, data);
    return data;
  } catch { return null; }
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/tts', express.static(path.join(__dirname, 'cache')));

app.get('/api/config', (req, res) => {
  res.json({ spotifyClientId: process.env.SPOTIFY_CLIENT_ID || '' });
});

app.post('/api/process', upload.single('book'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const jobId = `job_${Date.now()}`;
  const playlistTitle = req.file.originalname.replace(/\.[^.]+$/, '');
  jobs.set(jobId, { status: 'processing', step: 'Extracting text...', done: 0, total: 0, tracks: [], playlistTitle });
  res.json({ jobId });

  // Run pipeline async
  try {
    const job = jobs.get(jobId);
    job.step = 'Extracting text...';
    const fileBuffer = await readFile(req.file.path);
    const bookHash = createHash('sha1').update(fileBuffer).digest('hex');

    // Check cache first
    const cached = await loadBookCache(bookHash);
    if (cached) {
      console.log('[cache] hit for book', bookHash);
      job.status = 'done';
      job.step = 'Done (cached)';
      job.total = cached.tracks.length;
      job.done = cached.tracks.length;
      job.tracks = cached.tracks;
      await persistJob(jobId, job);
      await unlink(req.file.path).catch(() => {});
      return;
    }

    const text = await extractText(req.file.path, req.file.mimetype);

    job.step = 'Finding music references...';
    const tracks = await extractMusic(text);
    job.total = tracks.length;

    job.step = `Generating ${tracks.length} narrations in parallel...`;
    await persistJob(jobId, job);

    const ttsResults = [];
    for (let i = 0; i < tracks.length; i += 3) {
      const batch = tracks.slice(i, i + 3);
      const batchResults = await Promise.all(batch.map(t => synthesize(t.narration).catch(() => null)));
      ttsResults.push(...batchResults);
    }

    const results = tracks.map((t, i) => ({
      title: t.title,
      artist: t.artist,
      context: t.context,
      narration: t.narration,
      mood: t.mood,
      narrationHash: ttsResults[i]?.hash || null,
      narrationUrl: ttsResults[i] ? ttsUrl(ttsResults[i].hash) : null,
      spotifyUri: null,
    }));

    job.done = results.length;
    job.status = results.length > 0 ? 'done' : 'error';
    job.step = results.length > 0 ? 'Done' : 'No music found in this book';
    job.tracks = results;
    await persistJob(jobId, job);
    if (results.length > 0) await saveBookCache(bookHash, results, playlistTitle);
    await unlink(req.file.path).catch(() => {});
  } catch (e) {
    const job = jobs.get(jobId);
    job.status = 'error';
    job.step = e.message;
    await persistJob(jobId, job);
    console.error('[pipeline]', e);
  }
});

app.get('/api/status/:jobId', async (req, res) => {
  const job = await loadJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

app.post('/api/process-url', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'No URL provided' });

  const jobId = `job_${Date.now()}`;
  jobs.set(jobId, { status: 'processing', step: 'Fetching page...', done: 0, total: 0, tracks: [] });
  res.json({ jobId });

  try {
    const job = jobs.get(jobId);
    const urlHash = createHash('sha1').update(url).digest('hex');

    // Cache check
    const cached = await loadBookCache(urlHash);
    if (cached) {
      console.log('[cache] hit for URL', url);
      job.status = 'done'; job.step = 'Done (cached)';
      job.total = cached.tracks.length; job.done = cached.tracks.length; job.tracks = cached.tracks;
      job.playlistTitle = cached.playlistTitle || 'Murakami Radio';
      await persistJob(jobId, job);
      return;
    }

    job.step = 'Fetching Murakami Radio page...';
    await persistJob(jobId, job);
    const { rawText, title: pageTitle } = await scrapeRadioPage(url);
    job.playlistTitle = pageTitle ? `Murakami Radio - ${pageTitle}` : 'Murakami Radio';
    job.debug_scrape = `length:${rawText.length} sample:${rawText.slice(0,150)}`;
    await persistJob(jobId, job);

    job.step = 'Step 1/3: Extracting song list...';
    await persistJob(jobId, job);
    const rawTracks = await extractTracks(rawText);
    const rawResult = JSON.stringify(rawTracks.slice(0,2));

    job.step = `Step 2/3: Translating ${rawTracks.length} narrations to Chinese...`;
    job.total = rawTracks.length;
    await persistJob(jobId, job);
    const translatedTracks = await translateTracks(rawTracks);
    const tracks = Array.isArray(translatedTracks) ? translatedTracks : [];
    console.log('[translate] tracks:', tracks.length, 'raw first 300:', rawResult?.slice(0,300));
    job.debug_translate = `tracks:${tracks.length} raw:${rawResult?.slice(0,300)}`;
    await persistJob(jobId, job);
    job.total = tracks.length;

    job.step = `Step 3/3: Generating voice narrations (0/${tracks.length})...`;
    await persistJob(jobId, job);

    // Generate TTS with concurrency limit of 3
    const ttsResults = [];
    for (let i = 0; i < tracks.length; i += 3) {
      const batch = tracks.slice(i, i + 3);
      const batchResults = await Promise.all(batch.map(t => synthesize(t.narration).catch(() => null)));
      ttsResults.push(...batchResults);
      job.step = `Step 3/3: Generating voice narrations (${ttsResults.length}/${tracks.length})...`;
      job.done = ttsResults.length;
      await persistJob(jobId, job);
    }

    const results = tracks.map((t, i) => ({
      title: t.title,
      artist: t.artist,
      narration: t.narration,
      mood: t.mood,
      narrationHash: ttsResults[i]?.hash || null,
      narrationUrl: ttsResults[i] ? ttsUrl(ttsResults[i].hash) : null,
      spotifyUri: null,
    }));

    job.done = results.length;
    job.status = results.length > 0 ? 'done' : 'error';
    job.step = results.length > 0 ? 'Done' : 'No tracks found — check the URL';
    job.tracks = results;
    await persistJob(jobId, job);
    if (results.length > 0) await saveBookCache(urlHash, results, job.playlistTitle);
  } catch (e) {
    const job = jobs.get(jobId);
    job.status = 'error'; job.step = e.message;
    await persistJob(jobId, job);
    console.error('[url-pipeline]', e);
  }
});

app.get('/api/spotify/search', async (req, res) => {
  const { title, artist, token } = req.query;
  if (!title || !artist || !token) return res.status(400).json({ error: 'Missing params' });
  const result = await searchTrack(title, artist, token);
  res.json(result || {});
});

app.get('/api/playlists', async (req, res) => {
  const p = path.join(__dirname, 'cache', 'playlists-manifest.json');
  if (!existsSync(p)) return res.json({ playlists: [] });
  res.json(JSON.parse(await readFile(p, 'utf-8')));
});

app.get('/api/playlists/:id', async (req, res) => {
  const p = path.join(__dirname, 'cache', 'books', `${req.params.id}.json`);
  if (!existsSync(p)) return res.status(404).json({ error: 'Not found' });
  res.json({ tracks: JSON.parse(await readFile(p, 'utf-8')) });
});

const PORT = process.env.PORT || 8080;
app.post('/api/admin/generate', async (req, res) => {                                                                    
    const { execFile } = await import('child_process');                                                                    
    const scriptPath = path.join(__dirname, 'scripts', 'generate-all.js');                                                 
    res.json({ started: true });                                                                                           
    execFile('node', [scriptPath], { env: process.env }, (err, stdout, stderr) => {                                        
      if (err) console.error('[generate-all]', err.message);                                                               
      console.log('[generate-all]', stdout);                                                                               
      if (stderr) console.error('[generate-all stderr]', stderr);                                                          
    });                                                                                                                    
  });
app.listen(PORT, '0.0.0.0', () => console.log(`🎵 Literary Guide running at http://127.0.0.1:${PORT}`));
