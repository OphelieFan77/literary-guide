import 'dotenv/config';
import { scrapeRadioPage } from '../scraper.js';
import { extractTracks, translateTracks } from '../translate.js';
import { synthesize } from '../tts.js';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { createHash } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_ROOT = path.join(__dirname, '..', 'cache');
const BOOKS_DIR = path.join(CACHE_ROOT, 'books');
const MANIFEST = path.join(CACHE_ROOT, 'playlists-manifest.json');
const ARCHIVE_URL = 'https://www.tfm.co.jp/murakamiradio/report/';

async function discoverUrls() {
  const res = await fetch(ARCHIVE_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'ja,en;q=0.9' },
    signal: AbortSignal.timeout(30000),
  });
  const html = await res.text();
  const base = 'https://www.tfm.co.jp';
  const urls = new Set();
  for (const m of html.matchAll(/href="(\/murakamiradio\/(?:report\/\d+|index_\d{8}\.html))"/g)) {
    urls.add(base + m[1]);
  }
  return [...urls];
}

async function run() {
  await mkdir(BOOKS_DIR, { recursive: true });
  const manifest = existsSync(MANIFEST)
    ? JSON.parse(await readFile(MANIFEST, 'utf-8'))
    : { playlists: [] };

  const limit = process.argv.includes('--limit')
    ? parseInt(process.argv[process.argv.indexOf('--limit') + 1], 10)
    : Infinity;

  const urls = await discoverUrls();
  console.log(`Found ${urls.length} episodes (limit: ${limit})`);

  let processed = 0;
  for (const url of urls) {
    if (processed >= limit) break;

    const urlHash = createHash('sha1').update(url).digest('hex');
    const cachePath = path.join(BOOKS_DIR, `${urlHash}.json`);

    if (manifest.playlists.find(p => p.id === urlHash)) {
      console.log(`[skip] ${url}`);
      continue;
    }

    console.log(`[generate] ${url}`);
    try {
      const { rawText, title } = await scrapeRadioPage(url);
      const rawTracks = await extractTracks(rawText);
      const translated = await translateTracks(rawTracks);
      for (const t of translated) {
        if (t.narration) {
          const r = await synthesize(t.narration);
          t.narrationHash = r.hash;
          t.narrationUrl = r.url;
        }
        t.spotifyUri = null;
      }
      await writeFile(cachePath, JSON.stringify(translated));
      manifest.playlists.push({
        id: urlHash,
        name: title || `Episode ${manifest.playlists.length + 1}`,
        url,
        trackCount: translated.length,
        generatedAt: new Date().toISOString(),
      });
      await writeFile(MANIFEST, JSON.stringify(manifest, null, 2));
      console.log(`[done] "${title}" — ${translated.length} tracks`);
      processed++;
    } catch (e) {
      console.error(`[error] ${url}: ${e.message}`);
    }
  }
  console.log(`\nFinished. ${processed} new episodes generated.`);
}

run();
