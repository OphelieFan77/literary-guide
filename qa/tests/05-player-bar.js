import { ab, abRaw, abEval, getBaseUrl } from '../browser.js';
import { visualAssert } from '../haiku.js';
import { FIXTURE_TRACKS } from '../fixture.js';

export async function run() {
  abRaw(`open ${getBaseUrl()}`);
  abRaw('wait --load networkidle');
  abEval(`document.getElementById('spotify-login-section').style.display='none'`);

  const tracksJson = JSON.stringify(FIXTURE_TRACKS.slice(0, 3));
  abEval(`tracks = ${tracksJson}; renderTracks(); setState('ready_no_auth')`);
  abRaw(`wait --fn "document.getElementById('player-bar') !== null"`);

  const barVis = ab('is visible #player-bar');
  if (!barVis.data?.visible) return { pass: false, reason: '#player-bar not visible in ready_no_auth state' };

  const playEnabled = ab('is enabled #play-btn');
  if (playEnabled.data?.enabled) {
    return { pass: false, reason: '#play-btn should be disabled without Spotify auth' };
  }

  abRaw('screenshot qa/results/screenshots/05-player-bar.png');

  const visual = await visualAssert(
    'qa/results/screenshots/05-player-bar.png',
    'Does this show a fixed bottom bar with prev/play/next buttons and a seek bar? The play button should appear greyed out or disabled.'
  );
  return { pass: visual.pass, reason: visual.reason };
}
