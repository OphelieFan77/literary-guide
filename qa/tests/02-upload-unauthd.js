import { ab, abRaw, abEval, getBaseUrl } from '../browser.js';
import { visualAssert } from '../haiku.js';

export async function run() {
  abRaw(`open ${getBaseUrl()}`);
  abRaw('wait --load networkidle');
  abEval(`document.getElementById('spotify-login-section').style.display='none'; setState('upload')`);
  abRaw(`wait --fn "document.getElementById('drop-zone') !== null"`);

  const dropVis = ab('is visible #drop-zone');
  if (!dropVis.data?.visible) return { pass: false, reason: '#drop-zone not visible after login bypass' };

  abEval(`pollStatus('job_qa_fixture')`);
  abRaw(`wait --fn "document.getElementById('tracks-section').offsetParent !== null"`);

  const tracksVis = ab('is visible #tracks-section');
  if (!tracksVis.data?.visible) return { pass: false, reason: '#tracks-section never became visible after pollStatus' };

  abRaw('screenshot qa/results/screenshots/02-upload-unauthd.png');

  const visual = await visualAssert(
    'qa/results/screenshots/02-upload-unauthd.png',
    'Does this show a dark-themed page with a list of music tracks that appeared after processing completed?'
  );
  return { pass: visual.pass, reason: visual.reason };
}
