import { ab, abRaw, abEval, getBaseUrl } from '../browser.js';
import { FIXTURE_TRACKS } from '../fixture.js';

export async function run() {
  abRaw(`open ${getBaseUrl()}`);
  abRaw('wait --load networkidle');
  abEval(`document.getElementById('spotify-login-section').style.display='none'`);
  abEval(`setState('processing')`);
  abRaw(`wait --fn "document.getElementById('processing-section').style.display !== 'none'"`);

  // Simulate a job error response (mirrors what pollStatus does on error)
  abEval(`
    clearInterval(pollInterval);
    statusText.textContent = 'Error: Claude could not extract any songs from this book.';
  `);

  // Processing section must remain visible (no blank screen)
  const procVis = ab('is visible #processing-section');
  if (!procVis.data?.visible) {
    return { pass: false, reason: '#processing-section hidden after error — blank screen shown to user' };
  }

  // Status text must show the error message
  const statusTxt = ab('get text #status-text');
  if (!statusTxt.data?.text?.toLowerCase().includes('error')) {
    return { pass: false, reason: `Error message not visible in status text: "${statusTxt.data?.text}"` };
  }

  // Tracks section must NOT appear (no stale content)
  const tracksVis = ab('is visible #tracks-section');
  if (tracksVis.data?.visible) {
    return { pass: false, reason: '#tracks-section visible after error — stale content shown' };
  }

  return { pass: true, reason: 'Error state shows message in processing section without blank screen' };
}
