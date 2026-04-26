import { ab, abRaw, abEval, getBaseUrl } from '../browser.js';

export async function run() {
  abRaw(`open ${getBaseUrl()}`);
  abRaw('wait --load networkidle');

  // Inject auth + tracks with spotifyUris so the Save button is live
  abEval(`
    spotifyToken = 'fake_test_token';
    playlistTitle = 'Test Playlist';
    tracks = [
      { title: 'Track A', artist: 'Artist A', spotifyUri: 'spotify:track:aaa', narration: '', narrationUrl: null, albumArt: null },
      { title: 'Track B', artist: 'Artist B', spotifyUri: 'spotify:track:bbb', narration: '', narrationUrl: null, albumArt: null },
      { title: 'Track C', artist: 'Artist C', spotifyUri: null, narration: '', narrationUrl: null, albumArt: null },
    ];
    renderTracks();
    setState('ready');
  `);
  abRaw(`wait --fn "document.getElementById('save-playlist-btn') !== null"`);

  // Mock fetch: capture what URL is used for playlist creation, fake success
  abEval(`
    window._saveTest = { calledUrl: null, calledBody: null };
    const origFetch = window.fetch;
    window.fetch = function(url, opts) {
      if (url.includes('spotify.com/v1/me/playlists') || url.includes('spotify.com/v1/users/')) {
        window._saveTest.calledUrl = url;
        window._saveTest.calledBody = JSON.parse(opts?.body || '{}');
        return Promise.resolve(new Response(JSON.stringify({
          id: 'playlist_123',
          external_urls: { spotify: 'https://open.spotify.com/playlist/playlist_123' }
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }
      if (url.includes('spotify.com/v1/playlists/') && url.includes('/items')) {
        return Promise.resolve(new Response(JSON.stringify({ snapshot_id: 'snap_1' }), {
          status: 201, headers: { 'Content-Type': 'application/json' }
        }));
      }
      return origFetch(url, opts);
    };
  `);

  abRaw('click #save-playlist-btn');
  abRaw('wait 1500');

  // Check 1: correct endpoint was used
  const calledUrl = ab('eval "window._saveTest.calledUrl"');
  const url = calledUrl.data?.result ?? '';

  if (url.includes('/v1/users/')) {
    return { pass: false, reason: `Wrong endpoint: called /users/{id}/playlists instead of /me/playlists — URL: ${url}` };
  }
  if (!url.includes('/v1/me/playlists')) {
    return { pass: false, reason: `Save button did not call Spotify — calledUrl: ${url}` };
  }

  // Check 2: request body is correct
  const calledBody = ab('eval "JSON.stringify(window._saveTest.calledBody)"');
  const body = JSON.parse(calledBody.data?.result ?? '{}');
  if (body.public !== true) {
    return { pass: false, reason: `Playlist not set to public: ${JSON.stringify(body)}` };
  }
  if (!body.name) {
    return { pass: false, reason: `Playlist name missing: ${JSON.stringify(body)}` };
  }

  // Check 3: only matched tracks (2 of 3) sent
  const descResult = ab('eval "window._saveTest.calledBody.description"');
  const desc = descResult.data?.result ?? '';
  if (!desc.includes('1 track')) {
    return { pass: false, reason: `Description should note 1 unmatched track, got: "${desc}"` };
  }

  // Check 4: button shows saved state
  const btnText = ab('get text #save-playlist-btn');
  const text = btnText.data?.text ?? '';
  if (!text.toLowerCase().includes('saved') && !text.toLowerCase().includes('open')) {
    return { pass: false, reason: `Button did not update to saved state — shows: "${text}"` };
  }

  return { pass: true, reason: `POST /v1/me/playlists called correctly, playlist "${body.name}" saved, button updated` };
}
