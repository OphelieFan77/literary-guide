import { ab, abRaw, abEval, getBaseUrl } from '../browser.js';
import { FIXTURE_TRACKS } from '../fixture.js';

export async function run() {
  abRaw(`open ${getBaseUrl()}`);
  abRaw('wait --load networkidle');
  abEval(`document.getElementById('spotify-login-section').style.display='none'`);

  const tracksJson = JSON.stringify(FIXTURE_TRACKS.slice(0, 3));
  abEval(`tracks = ${tracksJson}; renderTracks(); setState('ready_no_auth')`);
  abRaw(`wait --fn "document.querySelectorAll('#track-list li').length >= 3"`);

  // Record initial state
  const initialIndex = ab('eval "currentIndex"');
  const initialStarted = ab('eval "hasStarted"');

  // Click the second track in the list
  ab("click '#track-list li:nth-child(2)'");
  abRaw('wait 500');

  // currentIndex must not have changed — click should be silently ignored without token
  const indexAfter = ab('eval "currentIndex"');
  if (indexAfter.data?.result !== initialIndex.data?.result) {
    return { pass: false, reason: `Track click changed currentIndex from ${initialIndex.data?.result} to ${indexAfter.data?.result} without Spotify token` };
  }

  // hasStarted must remain false — no playback should have started
  const startedAfter = ab('eval "hasStarted"');
  if (startedAfter.data?.result === true && initialStarted.data?.result !== true) {
    return { pass: false, reason: 'Track click started playback without Spotify token' };
  }

  // Play button must still be disabled
  const playEnabled = ab('is enabled #play-btn');
  if (playEnabled.data?.enabled) {
    return { pass: false, reason: '#play-btn became enabled after track click in ready_no_auth state' };
  }

  return { pass: true, reason: 'Track click correctly ignored in ready_no_auth state — no playback started' };
}
