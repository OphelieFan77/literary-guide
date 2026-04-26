// State
let config = {};
let tracks = [];
let currentIndex = 0;
let spotifyToken = null;
let deviceId = null;
let player = null;
let trackEndTimer = null;
let pendingUri = null;
let playGeneration = 0;
let pollInterval = null;
let playlistTitle = 'My Literary Playlist';
let externalDeviceId = null;
let externalDeviceName = null;
let externalPollTimer = null;
let lastExternalTrackUri = null;
let lastExternalIsPlaying = false;
let transferInProgress = false;

// DOM
const spotifyLoginSection = document.getElementById('spotify-login-section');
const spotifyLoginBtn = document.getElementById('spotify-login-btn');
const uploadSection = document.getElementById('upload-section');
const processingSection = document.getElementById('processing-section');
const tracksSection = document.getElementById('tracks-section');
const statusText = document.getElementById('status-text');
const progressFill = document.getElementById('progress-fill');
const trackList = document.getElementById('track-list');
const spotifyBtn = document.getElementById('spotify-btn');
// spotify-connected removed from HTML; device-indicator replaces it
const playBtn = document.getElementById('play-btn');
const pauseBtn = document.getElementById('pause-btn');
const skipBtn = document.getElementById('skip-btn');
const skipPrevBtn = document.getElementById('skip-prev-btn');
const pixelChart = document.getElementById('pixel-chart');
const playerBar = document.getElementById('player-bar');
const narrationBar = document.getElementById('narration-bar');
const narrationTicker = document.getElementById('narration-ticker');
const barTitle = document.getElementById('bar-title');
const barArtist = document.getElementById('bar-artist');
const barNarration = document.getElementById('bar-narration');
const barArt = document.getElementById('bar-art');
const barArtPlaceholder = document.getElementById('bar-art-placeholder');
const seekFill = document.getElementById('seek-fill');
const timeCur = document.getElementById('time-cur');
const timeDur = document.getElementById('time-dur');
const fileInput = document.getElementById('file-input');
const dropZone = document.getElementById('drop-zone');

function updateDeviceIndicator() {
  const el = document.getElementById('device-indicator');
  if (!el) return;
  if (externalDeviceName) {
    el.textContent = '✓ ' + externalDeviceName;
    el.style.display = 'inline';
  } else {
    el.style.display = 'none';
  }
}

spotifyLoginBtn.addEventListener('click', loginSpotify);

// Tab switching
function switchTab(tab) {
  document.getElementById('tab-book-content').style.display = tab === 'book' ? 'block' : 'none';
  document.getElementById('tab-url-content').style.display = tab === 'url' ? 'block' : 'none';
  document.getElementById('tab-library-content').style.display = tab === 'library' ? 'block' : 'none';
  document.getElementById('tab-book').classList.toggle('active', tab === 'book');
  document.getElementById('tab-url').classList.toggle('active', tab === 'url');
  document.getElementById('tab-library').classList.toggle('active', tab === 'library');
  if (tab === 'library') loadLibrary();
}

async function loadLibrary() {
  const grid = document.getElementById('playlist-grid');
  grid.innerHTML = '<p style="color:#b3b3b3;font-size:0.85em">Loading...</p>';
  const { playlists } = await fetch('/api/playlists').then(r => r.json());
  grid.innerHTML = '';
  if (!playlists.length) {
    grid.innerHTML = '<p style="color:#b3b3b3;font-size:0.85em">No saved playlists yet. Run the generation script first.</p>';
    return;
  }
  for (const p of playlists) {
    const card = document.createElement('div');
    card.style.cssText = 'background:#1a1a1a;border-radius:8px;padding:16px;cursor:pointer;transition:background 0.15s';
    card.onmouseenter = () => card.style.background = '#2a2a2a';
    card.onmouseleave = () => card.style.background = '#1a1a1a';
    card.innerHTML = `
      <div style="color:#fff;font-weight:700;font-size:0.9em;margin-bottom:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.name}</div>
      <div style="color:#b3b3b3;font-size:0.75em">${p.trackCount} tracks</div>`;
    card.onclick = () => loadSavedPlaylist(p.id, p.name);
    grid.appendChild(card);
  }
}

async function loadSavedPlaylist(id, name) {
  const { tracks: savedTracks } = await fetch(`/api/playlists/${id}`).then(r => r.json());
  tracks = savedTracks;
  playlistTitle = name;
  const titleEl = document.getElementById('playlist-title');
  if (titleEl) titleEl.textContent = name;
  renderTracks();
  if (spotifyToken) {
    await fetchSpotifyUris();
    setState('ready');
  } else {
    setState('ready_no_auth');
  }
}
window.switchTab = switchTab;

// URL submit
document.getElementById('url-submit-btn')?.addEventListener('click', () => {
  const url = document.getElementById('url-input').value.trim();
  if (url) submitUrl(url);
});
document.getElementById('url-input')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const url = e.target.value.trim();
    if (url) submitUrl(url);
  }
});

async function submitUrl(url) {
  setState('processing');
  statusText.textContent = 'Fetching Murakami Radio page...';
  const { jobId } = await fetch('/api/process-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  }).then(r => r.json());
  pollStatus(jobId);
}

// Init
(async () => {
  config = await fetch('/api/config').then(r => r.json());
  const code = new URLSearchParams(window.location.search).get('code');
  if (code) {
    history.replaceState({}, '', '/');
    await handleSpotifyCallback(code);
  }
})();

// File upload
fileInput.addEventListener('change', e => uploadFile(e.target.files[0]));
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.classList.remove('dragover'); uploadFile(e.dataTransfer.files[0]); });

async function uploadFile(file) {
  if (!file) return;
  setState('processing');
  const form = new FormData();
  form.append('book', file);
  const { jobId } = await fetch('/api/process', { method: 'POST', body: form }).then(r => r.json());
  pollStatus(jobId);
}

function pollStatus(jobId) {
  pollInterval = setInterval(async () => {
    const job = await fetch(`/api/status/${jobId}`).then(r => r.json());
    statusText.textContent = job.step.toUpperCase();
    const progress = job.total > 0 ? job.done / job.total : 0.1;
    updatePixelChart(progress);
    if (job.status === 'done') {
      clearInterval(pollInterval);
      tracks = job.tracks;
      playlistTitle = job.playlistTitle || 'My Literary Playlist';
      const titleEl = document.getElementById('playlist-title');
      if (titleEl) titleEl.textContent = playlistTitle;
      renderTracks();
      if (spotifyToken) {
        statusText.textContent = 'Searching Spotify...';
        await fetchSpotifyUris();
        setState('ready');
      } else {
        setState('ready_no_auth');
      }
    }
    if (job.status === 'error') {
      clearInterval(pollInterval);
      statusText.textContent = 'Error: ' + job.step;
    }
  }, 2000);
}

function renderTracks() {
  trackList.innerHTML = '';
  tracks.forEach((t, i) => {
    const li = document.createElement('li');
    li.style.cursor = 'pointer';
    li.innerHTML = `
      <span class="track-num">${i + 1}</span>
      <div class="track-art-placeholder track-art">♪</div>
      <div class="track-info">
        <div class="track-title">${t.title}</div>
        <div class="track-artist">${t.artist}</div>
      </div>
      `;
    li.addEventListener('click', () => {
      if (!spotifyToken) return;
      stopAll();
      isPaused = false;
      hasStarted = true;
      showPauseIcon();
      playStep(i);
    });
    trackList.appendChild(li);
  });
}

// Spotify
spotifyBtn.addEventListener('click', loginSpotify);
document.getElementById('save-playlist-btn')?.addEventListener('click', saveToSpotify);

function generateVerifier() {
  const arr = new Uint8Array(96);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function generateChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function loginSpotify() {
  const verifier = generateVerifier();
  const challenge = await generateChallenge(verifier);
  sessionStorage.setItem('pkce_verifier', verifier);
  const params = new URLSearchParams({
    client_id: config.spotifyClientId,
    response_type: 'code',
    redirect_uri: 'https://balanced-eagerness-production.up.railway.app',
    scope: 'streaming user-read-email user-read-private user-modify-playback-state user-read-playback-state playlist-modify-public',
    code_challenge_method: 'S256',
    code_challenge: challenge,
  });
  window.location = 'https://accounts.spotify.com/authorize?' + params;
}

async function handleSpotifyCallback(code) {
  const verifier = sessionStorage.getItem('pkce_verifier');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: 'https://balanced-eagerness-production.up.railway.app',
      client_id: config.spotifyClientId,
      code_verifier: verifier,
    }),
  });
  const data = await res.json();
  if (!data.access_token) {
    console.error('[auth] token exchange failed:', data.error, data.error_description);
    sessionStorage.removeItem('pkce_verifier');
    setState('login');
    return;
  }
  spotifyToken = data.access_token;
  if (data.refresh_token) sessionStorage.setItem('spotify_refresh_token', data.refresh_token);
  if (data.expires_in) sessionStorage.setItem('spotify_token_expiry', Date.now() + (data.expires_in - 60) * 1000);
  sessionStorage.removeItem('pkce_verifier');
  if (spotifyBtn) spotifyBtn.style.display = 'none';

  // Snapshot available devices BEFORE SDK connects — once SDK connects it
  // takes the active slot and the desktop app disappears from the list
  const devRes = await fetch('https://api.spotify.com/v1/me/player/devices', {
    headers: { Authorization: `Bearer ${spotifyToken}` },
  });
  if (devRes.ok) {
    const { devices } = await devRes.json();
    // Exclude our own SDK device by name (deviceId not set yet at this point)
    const nonSdk = devices.filter(d => d.name !== 'Literary Guide');
    const ext = nonSdk.find(d => d.is_active) ?? nonSdk[0] ?? null;
    if (ext) {
      externalDeviceId = ext.id;
      externalDeviceName = ext.name;
      updateDeviceIndicator();
      console.log('[init] pre-SDK external device:', ext.name, ext.id);
    }
  }

  initSpotifySDK();

  document.getElementById('main-title').style.display = 'block';
  document.getElementById('main-subtitle').style.display = 'block';

  if (tracks.length > 0) {
    await fetchSpotifyUris();
    setState('ready');
  } else {
    setState('upload');
  }
}

async function fetchSpotifyUris() {
  for (const t of tracks) {
    if (t.spotifyUri) continue;
    const result = await fetch(`/api/spotify/search?title=${encodeURIComponent(t.title)}&artist=${encodeURIComponent(t.artist)}&token=${spotifyToken}`).then(r => r.json());
    if (result.uri) {
      t.spotifyUri = result.uri;
      t.albumArt = result.albumArt;
      // Update album art in track list
      const li = trackList.querySelectorAll('li')[tracks.indexOf(t)];
      if (li && result.albumArt) {
        const placeholder = li.querySelector('.track-art-placeholder');
        if (placeholder) {
          placeholder.outerHTML = `<img class="track-art" src="${result.albumArt}" alt="">`;
        }
      }
    }
  }
}

// Spotify Web Playback SDK
window.onSpotifyWebPlaybackSDKReady = () => initSpotifySDK();

function initSpotifySDK() {
  if (!spotifyToken || !window.Spotify) return;
  player = new Spotify.Player({
    name: 'Literary Guide',
    getOAuthToken: cb => cb(spotifyToken),
    volume: 0.8,
  });
  player.addListener('ready', async ({ device_id }) => {
    deviceId = device_id;
    console.log('[spotify] SDK ready, device_id:', device_id);
    // If tracks are already loaded but URIs weren't fetched yet (e.g. OAuth completed
    // before SDK was ready, or cached job had null URIs), fetch them now.
    if (tracks.length > 0 && tracks.every(t => !t.spotifyUri)) {
      await fetchSpotifyUris();
    }
    // Retry any play call that failed due to stale deviceId (404)
    if (pendingUri) {
      const uri = pendingUri;
      pendingUri = null;
      spotifyPlay(uri);
    }
  });
  player.addListener('not_ready', ({ device_id }) => console.warn('[spotify] Device offline:', device_id));
  player.addListener('initialization_error', e => console.error('[spotify] init error:', e.message));
  player.addListener('authentication_error', e => console.error('[spotify] auth error:', e.message));
  player.addListener('account_error', e => console.error('[spotify] account error:', e.message));
  player.addListener('player_state_changed', handleStateChange);
  player.connect();

  // Poll seek bar every second (skipped when external device is active — poll handles it)
  setInterval(() => {
    if (isPaused || !player || externalDeviceId) return;
    player.getCurrentState().then(state => {
      if (!state || state.paused) return;
      const pct = (state.position / state.duration) * 100;
      seekFill.style.width = pct + '%';
      timeCur.textContent = fmtTime(state.position);
      timeDur.textContent = fmtTime(state.duration);
    });
  }, 1000);
}

let lastTrackUri = null;

function handleStateChange(state) {
  if (!state) return;
  if (inNarration) return;
  const uri = state.track_window?.current_track?.uri;

  if (!state.paused) {
    // New track started — set a single end timer
    if (uri && uri !== lastTrackUri) {
      lastTrackUri = uri;
      clearTimeout(trackEndTimer);
      if (!state.duration || state.duration <= 0) return;
      const remaining = state.duration - state.position + 1000;
      if (remaining <= 500) return;
      const timerGen = playGeneration;
      trackEndTimer = setTimeout(() => {
        trackEndTimer = null;
        lastTrackUri = null;
        if (!isPaused && timerGen === playGeneration) advanceToNext();
      }, remaining);
    }
    // Update seek bar
    const pct = (state.position / state.duration) * 100;
    seekFill.style.width = pct + '%';
    timeCur.textContent = fmtTime(state.position);
    timeDur.textContent = fmtTime(state.duration);
  }
  // No else branch — only the timer drives advancement, prevents double-firing
}

function fmtTime(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Player controls
let isPaused = false;
let currentAudio = null;
let inNarration = false; // true = narration playing, false = song playing

function showPlayIcon() { playBtn.style.display = 'flex'; pauseBtn.style.display = 'none'; }
function showPauseIcon() { playBtn.style.display = 'none'; pauseBtn.style.display = 'flex'; }

let hasStarted = false;

function resumePlayback() {
  isPaused = false;
  showPauseIcon();
  if (inNarration && currentAudio) {
    currentAudio.play();
  } else if (externalDeviceId) {
    fetch(`https://api.spotify.com/v1/me/player/play?device_id=${externalDeviceId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${spotifyToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    startExternalPoll();
  } else {
    player?.togglePlay();
    // Re-set timer based on current position
    player?.getCurrentState().then(state => {
      if (!state || state.paused) return;
      clearTimeout(trackEndTimer);
      if (!state.duration || state.duration <= 0) return;
      const remaining = state.duration - state.position + 1000;
      if (remaining <= 500) return;
      const timerGen = playGeneration;
      trackEndTimer = setTimeout(() => {
        trackEndTimer = null;
        lastTrackUri = null;
        if (!isPaused && timerGen === playGeneration) advanceToNext();
      }, remaining);
    });
  }
}

function pausePlayback() {
  isPaused = true;
  showPlayIcon();
  if (inNarration && currentAudio) {
    currentAudio.pause();
  } else if (externalDeviceId) {
    stopExternalPoll();
    fetch(`https://api.spotify.com/v1/me/player/pause?device_id=${externalDeviceId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${spotifyToken}` },
    });
  } else {
    clearTimeout(trackEndTimer);
    trackEndTimer = null;
    player?.pause();
  }
}

playBtn.addEventListener('click', () => {
  if (tracks.length === 0) return;
  if (!deviceId) {
    barTitle.textContent = 'Connecting to Spotify…';
    return;
  }
  if (!hasStarted) {
    hasStarted = true;
    isPaused = false;
    showPauseIcon();
    playStep(0);
  } else {
    resumePlayback();
  }
});

pauseBtn.addEventListener('click', () => {
  isPaused = !isPaused;
  if (isPaused) {
    pausePlayback();
  } else {
    resumePlayback();
  }
});


function stopAll() {
  playGeneration++;
  // Fully stop narration audio and remove all listeners
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = '';
    currentAudio.onended = null;
    currentAudio = null;
  }
  inNarration = false;
  clearTimeout(trackEndTimer);
  trackEndTimer = null;
  lastTrackUri = null;
  player?.pause();
  // Fade out subtitle
  narrationBar.classList.remove('visible');
  // Clear external device state so next playStep() re-detects
  stopExternalPoll();
  externalDeviceId = null;
  externalDeviceName = null;
  transferInProgress = false;
  updateDeviceIndicator();
}

skipBtn.addEventListener('click', () => {
  stopAll();
  advanceToNext();
});

skipPrevBtn.addEventListener('click', () => {
  stopAll();
  playStep(Math.max(0, currentIndex - 1));
});

function playStep(i) {
  if (i >= tracks.length) return;
  const gen = ++playGeneration;
  currentIndex = i;
  const t = tracks[i];

  // Transfer to external device if one was detected at auth time
  if (externalDeviceId && !transferInProgress) {
    transferInProgress = true;
    transferPlayback(externalDeviceId).then(ok => {
      if (!ok) {
        externalDeviceId = null;
        externalDeviceName = null;
        updateDeviceIndicator();
      }
      transferInProgress = false;
    });
  }

  // Update bottom bar
  barTitle.textContent = t.title;
  barArtist.textContent = t.artist;
  barNarration.textContent = '';

  // Subtitle: fade in narration text
  narrationTicker.textContent = t.narration;
  narrationBar.style.display = 'block';
  void narrationBar.offsetHeight; // reflow
  narrationBar.classList.add('visible');
  if (t.albumArt) { barArt.src = t.albumArt; barArt.style.display = 'block'; barArtPlaceholder.style.display = 'none'; }
  else { barArt.style.display = 'none'; barArtPlaceholder.style.display = 'flex'; }

  // Highlight active track in list
  document.querySelectorAll('#track-list li').forEach((li, idx) => {
    li.classList.toggle('active', idx === i);
    const num = li.querySelector('.track-num');
    if (num) num.classList.toggle('playing', idx === i);
  });

  console.log('[play] track', i, t.title, '— uri:', t.spotifyUri, '— narrationUrl:', t.narrationUrl);

  pauseBtn.disabled = false;
  skipBtn.disabled = false;

  if (t.narrationUrl) {
    inNarration = true;
    currentAudio = new Audio(t.narrationUrl);
    currentAudio.addEventListener('ended', async () => {
      if (gen !== playGeneration) return;
      // Fade out subtitle when narration ends
      narrationBar.classList.remove('visible');
      setTimeout(() => { narrationBar.style.display = 'none'; }, 400);
      // Wait for URI if fetchSpotifyUris() is still running
      let attempts = 0;
      while (!t.spotifyUri && attempts++ < 20) {
        if (gen !== playGeneration) return;
        await new Promise(r => setTimeout(r, 500));
      }
      if (gen !== playGeneration) return;
      console.log('[play] narration ended, calling spotifyPlay');
      inNarration = false;
      spotifyPlay(t.spotifyUri);
    });
    currentAudio.play().catch(e => {
      console.warn('[play] audio play failed:', e.message);
      inNarration = false;
      currentAudio = null;
      spotifyPlay(t.spotifyUri);
    });
  } else {
    spotifyPlay(t.spotifyUri);
  }

  // Pre-load next narration
  if (i + 1 < tracks.length && tracks[i + 1].narrationUrl) {
    const preload = new Audio(tracks[i + 1].narrationUrl);
    preload.preload = 'auto';
  }
}

async function refreshTokenIfNeeded() {
  const expiry = parseInt(sessionStorage.getItem('spotify_token_expiry') || '0');
  if (expiry && Date.now() < expiry) return;
  const refreshToken = sessionStorage.getItem('spotify_refresh_token');
  if (!refreshToken) return;
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: config.spotifyClientId }),
  });
  const data = await res.json();
  if (data.access_token) {
    spotifyToken = data.access_token;
    if (data.expires_in) sessionStorage.setItem('spotify_token_expiry', Date.now() + (data.expires_in - 60) * 1000);
    if (data.refresh_token) sessionStorage.setItem('spotify_refresh_token', data.refresh_token);
    // Reinitialise SDK so it re-establishes a fresh DRM session with the new token
    if (player) {
      player.disconnect();
      player = null;
      deviceId = null;
      setTimeout(() => initSpotifySDK(), 500);
    }
  }
}

async function getActiveExternalDevice() {
  await refreshTokenIfNeeded();
  const res = await fetch('https://api.spotify.com/v1/me/player/devices', {
    headers: { Authorization: `Bearer ${spotifyToken}` },
  });
  if (!res.ok) { console.warn('[devices] fetch failed:', res.status); return null; }
  const { devices } = await res.json();
  const others = devices.filter(d => d.id !== deviceId);
  return others.find(d => d.is_active) ?? others[0] ?? null;
}

async function transferPlayback(targetDeviceId) {
  await refreshTokenIfNeeded();
  const res = await fetch('https://api.spotify.com/v1/me/player', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${spotifyToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_ids: [targetDeviceId], play: false }),
  });
  if (!res.ok && res.status !== 204) {
    console.warn('[transfer] failed:', res.status);
    return false;
  }
  return true;
}

function stopExternalPoll() {
  if (externalPollTimer) { clearInterval(externalPollTimer); externalPollTimer = null; }
  lastExternalTrackUri = null;
  lastExternalIsPlaying = false;
}

function startExternalPoll() {
  stopExternalPoll();
  const genAtStart = playGeneration;
  externalPollTimer = setInterval(async () => {
    if (inNarration || isPaused) return;
    if (genAtStart !== playGeneration) { stopExternalPoll(); return; }
    await refreshTokenIfNeeded();
    let data;
    try {
      const res = await fetch('https://api.spotify.com/v1/me/player', {
        headers: { Authorization: `Bearer ${spotifyToken}` },
      });
      if (res.status === 204) {
        console.log('[poll] no active player — advancing');
        stopExternalPoll();
        if (!isPaused) advanceToNext();
        return;
      }
      if (!res.ok) return;
      data = await res.json();
      if (genAtStart !== playGeneration) { stopExternalPoll(); return; }
    } catch (e) { console.warn('[poll] fetch error:', e.message); return; }

    const { is_playing: isPlaying, progress_ms: progress, item } = data;
    const duration = item?.duration_ms;
    const uri = item?.uri;

    if (isPlaying && duration > 0) {
      seekFill.style.width = (progress / duration * 100) + '%';
      timeCur.textContent = fmtTime(progress);
      timeDur.textContent = fmtTime(duration);
    }

    const stoppedNearEnd = lastExternalIsPlaying && !isPlaying && progress < 5000;
    const trackChanged = uri && lastExternalTrackUri && uri !== lastExternalTrackUri;
    if (stoppedNearEnd || trackChanged) {
      console.log('[poll] track ended —', stoppedNearEnd ? 'stopped+reset' : 'track changed');
      stopExternalPoll();
      if (!isPaused) advanceToNext();
      return;
    }
    lastExternalIsPlaying = isPlaying;
    if (uri) lastExternalTrackUri = uri;
  }, 2000);
}

async function spotifyPlay(uri) {
  await refreshTokenIfNeeded();
  lastTrackUri = null;
  const targetId = externalDeviceId ?? deviceId;
  console.log('[spotify] play — uri:', uri, 'target:', targetId, 'external:', !!externalDeviceId);
  if (!uri || !targetId || !spotifyToken) {
    console.warn('[spotify] play aborted — missing:', !uri ? 'uri' : !targetId ? 'deviceId' : 'token');
    return;
  }
  const res = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${targetId}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${spotifyToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ uris: [uri] }),
  });
  console.log('[spotify] play response:', res.status);
  if (res.status === 401) {
    sessionStorage.setItem('spotify_token_expiry', '0');
    await refreshTokenIfNeeded();
    spotifyPlay(uri);
    return;
  } else if (res.status === 404) {
    if (externalDeviceId) {
      console.warn('[spotify] External device gone, falling back to SDK');
      externalDeviceId = null;
      externalDeviceName = null;
      updateDeviceIndicator();
      spotifyPlay(uri);
    } else {
      console.warn('[spotify] SDK device not found — reconnecting and retrying');
      pendingUri = uri;
      player?.connect();
    }
  } else if (!res.ok) {
    console.error('[spotify] play error:', await res.text());
  } else if (externalDeviceId) {
    startExternalPoll();
  } else {
    // Watchdog: if playback doesn't start within 3s (e.g. Widevine DRM failure),
    // reconnect the SDK to force a fresh DRM session, then retry.
    const gen = playGeneration;
    setTimeout(async () => {
      if (gen !== playGeneration || externalDeviceId) return;
      const state = await player?.getCurrentState();
      if (!state || state.paused) {
        console.warn('[spotify] playback stalled after 204 — reinitialising SDK for fresh DRM session');
        pendingUri = uri;
        player?.disconnect();
        player = null;
        deviceId = null;
        setTimeout(() => initSpotifySDK(), 500);
      }
    }, 3000);
  }
}

function advanceToNext() {
  playStep(currentIndex + 1);
}


async function saveToSpotify() {
  const btn = document.getElementById('save-playlist-btn');
  const matched = tracks.filter(t => t.spotifyUri);
  if (!matched.length || !spotifyToken) return;

  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    await refreshTokenIfNeeded();
    // Snapshot token after refresh — concurrent playback calls can mutate spotifyToken
    const token = spotifyToken;

    const skipped = tracks.length - matched.length;
    const description = `Generated by Literary Guide.${skipped > 0 ? ` ${skipped} track${skipped > 1 ? 's' : ''} couldn't be matched on Spotify.` : ''}`;

    const plRes = await fetch('https://api.spotify.com/v1/me/playlists', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: playlistTitle, public: true, description }),
    });
    const plData = await plRes.json();
    if (!plRes.ok) throw new Error(`Spotify ${plRes.status}: ${plData?.error?.message || JSON.stringify(plData)}`);
    const { id: playlistId, external_urls } = plData;

    const uris = matched.map(t => t.spotifyUri);
    for (let i = 0; i < uris.length; i += 100) {
      const addRes = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/items`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ uris: uris.slice(i, i + 100) }),
      });
      if (!addRes.ok) {
        const addData = await addRes.json().catch(() => ({}));
        throw new Error(`Adding tracks failed ${addRes.status}: ${addData?.error?.message || JSON.stringify(addData)}`);
      }
    }

    btn.innerHTML = `✓ Saved — <a href="${external_urls.spotify}" target="_blank" style="color:inherit;text-decoration:underline">Open in Spotify</a>`;
  } catch (e) {
    console.error('[save-playlist]', e);
    btn.textContent = 'Save failed';
    btn.disabled = false;
  }
}

// Pixel chart — 12 columns, up to 5 blocks each
const COLS = 12;
const ROWS = 5;
let pixelIntervalId = null;

function initPixelChart() {
  pixelChart.innerHTML = '';
  for (let c = 0; c < COLS; c++) {
    const col = document.createElement('div');
    col.className = 'pixel-col';
    col.id = `pcol-${c}`;
    for (let r = 0; r < ROWS; r++) {
      const block = document.createElement('div');
      block.className = 'pixel-block';
      block.id = `pb-${c}-${r}`;
      col.appendChild(block);
    }
    pixelChart.appendChild(col);
  }
}

function updatePixelChart(progress) {
  // progress 0-1: fill columns left to right
  const filledCols = Math.floor(progress * COLS);
  for (let c = 0; c < COLS; c++) {
    // Random height per column based on column index (fixed seed)
    const height = 1 + ((c * 3 + 2) % ROWS);
    for (let r = 0; r < ROWS; r++) {
      const block = document.getElementById(`pb-${c}-${r}`);
      if (!block) continue;
      if (c < filledCols && r < height) {
        block.className = 'pixel-block active';
      } else if (c === filledCols && r < height) {
        block.className = 'pixel-block pulse';
      } else {
        block.className = 'pixel-block';
      }
    }
  }
}

// UI state
function setState(state) {
  spotifyLoginSection.style.display = 'none';
  uploadSection.style.display = 'none';
  processingSection.style.display = 'none';
  tracksSection.style.display = 'none';

  if (state === 'processing') {
    processingSection.style.display = 'block';
    initPixelChart();
    updatePixelChart(0);
  } else if (state === 'ready_no_auth') {
    tracksSection.style.display = 'block';
    playerBar.style.display = 'block';
    playBtn.disabled = true;
  } else if (state === 'ready') {
    tracksSection.style.display = 'block';
    playerBar.style.display = 'block';
    playBtn.disabled = false;
    pauseBtn.disabled = false;
    skipBtn.disabled = false;
    skipPrevBtn.disabled = false;
  } else if (state === 'upload') {
    uploadSection.style.display = 'block';
  } else if (state === 'login') {
    spotifyLoginSection.style.display = 'flex';
  }
}
