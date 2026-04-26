import { ab, abRaw, abEval, getBaseUrl } from '../browser.js';
import { visualAssert } from '../haiku.js';
import { FIXTURE_TRACKS } from '../fixture.js';

export async function run() {
  abRaw(`open ${getBaseUrl()}`);
  abRaw('wait --load networkidle');
  abEval(`document.getElementById('spotify-login-section').style.display='none'`);

  const tracksJson = JSON.stringify(FIXTURE_TRACKS.slice(0, 3));
  abEval(`tracks = ${tracksJson}; renderTracks(); setState('ready_no_auth')`);
  abRaw(`wait --fn "document.querySelectorAll('#track-list li').length >= 3"`);

  const count = ab("get count '#track-list li'");
  if (count.data?.count !== 3) {
    return { pass: false, reason: `Expected 3 track rows, got ${count.data?.count}` };
  }

  abRaw('screenshot qa/results/screenshots/04-track-list.png');

  const visual = await visualAssert(
    'qa/results/screenshots/04-track-list.png',
    'Does this show a numbered list of music tracks on a dark background, each row with a title in white text and an artist name in grey?'
  );
  return { pass: visual.pass, reason: visual.reason };
}
