import { ab, abRaw, abEval, getBaseUrl } from '../browser.js';
import { visualAssert } from '../haiku.js';

export async function run() {
  abRaw(`open ${getBaseUrl()}`);
  abRaw('wait --load networkidle');
  abEval(`document.getElementById('spotify-login-section').style.display='none'`);
  abEval(`setState('processing')`);
  abRaw(`wait --fn "document.getElementById('processing-section').style.display !== 'none'"`);

  const procVis = ab('is visible #processing-section');
  if (!procVis.data?.visible) return { pass: false, reason: '#processing-section not visible after setState(processing)' };

  const chartVis = ab('is visible #pixel-chart');
  if (!chartVis.data?.visible) return { pass: false, reason: '#pixel-chart not visible' };

  const statusText = ab('get text #status-text');
  if (!statusText.data?.text || statusText.data.text.length === 0) {
    return { pass: false, reason: '#status-text is empty' };
  }

  abRaw('screenshot qa/results/screenshots/03-processing.png');

  const visual = await visualAssert(
    'qa/results/screenshots/03-processing.png',
    'Does this show a dark loading screen with a grid of small pixel blocks (some lit green or white) and a status message below it?'
  );
  return { pass: visual.pass, reason: visual.reason };
}
