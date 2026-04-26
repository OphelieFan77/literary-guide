import { ab, abRaw, abEval, getBaseUrl } from '../browser.js';

export async function run() {
  abRaw(`open ${getBaseUrl()}`);
  abRaw('wait --load networkidle');

  // Simulate handleSpotifyCallback() receiving an error response from Spotify
  // (e.g. invalid code, mismatched redirect_uri)
  abEval(`
    (async () => {
      // Patch fetch to return a Spotify error response for the token exchange
      const origFetch = window.fetch;
      window.fetch = function(url, opts) {
        if (url.includes('accounts.spotify.com/api/token')) {
          return Promise.resolve(new Response(JSON.stringify({
            error: 'invalid_grant',
            error_description: 'Authorization code expired'
          }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
        }
        return origFetch(url, opts);
      };

      // Simulate the callback with a fake code
      sessionStorage.setItem('pkce_verifier', 'fake_verifier');
      await handleSpotifyCallback('fake_auth_code');

      // Restore fetch
      window.fetch = origFetch;
    })();
  `);
  abRaw('wait 1000');

  // spotifyToken must NOT be set to undefined/null after a failed exchange
  // The app should remain on the login screen
  const tokenVal = ab('eval "typeof spotifyToken + \':\' + spotifyToken"');
  const tokenStr = tokenVal.data?.result ?? '';

  // Login section must still be visible (no silent auth with broken token)
  // In ready_no_auth or upload state means auth "succeeded" with bad data — that's the bug
  const loginVis = ab('is visible #spotify-login-section');
  const uploadVis = ab('is visible #upload-section');
  const tracksVis = ab('is visible #tracks-section');

  if (tracksVis.data?.visible) {
    return { pass: false, reason: 'App entered tracks state after failed OAuth — should stay on login' };
  }

  if (uploadVis.data?.visible && tokenStr.includes('undefined')) {
    return { pass: false, reason: 'App entered upload state with undefined spotifyToken — API calls will fail silently' };
  }

  // Best case: login section still visible (app correctly stayed on login)
  // Acceptable: upload section visible but token is null/falsy (app shows upload but won't play)
  return { pass: true, reason: 'OAuth error handled gracefully — app did not enter playback state with invalid token' };
}
