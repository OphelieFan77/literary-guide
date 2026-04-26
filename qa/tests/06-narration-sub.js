import { ab, abRaw, abEval, getBaseUrl } from '../browser.js';
import { visualAssert } from '../haiku.js';

export async function run() {
  abRaw(`open ${getBaseUrl()}`);
  abRaw('wait --load networkidle');
  abEval(`document.getElementById('spotify-login-section').style.display='none'`);

  abEval(`
    const bar = document.getElementById('narration-bar');
    document.getElementById('narration-ticker').textContent = 'QA test narration subtitle.';
    bar.style.display = 'block';
    void bar.offsetHeight;
    bar.classList.add('visible');
  `);
  abRaw(`wait --fn "document.getElementById('narration-bar').classList.contains('visible')"`);

  const barVis = ab('is visible #narration-bar');
  if (!barVis.data?.visible) return { pass: false, reason: '#narration-bar not visible after inject' };

  const tickerText = ab('get text #narration-ticker');
  if (!tickerText.data?.text?.includes('QA test')) {
    return { pass: false, reason: `Narration ticker text wrong: "${tickerText.data?.text}"` };
  }

  abRaw('screenshot qa/results/screenshots/06-narration-sub.png');

  const visual = await visualAssert(
    'qa/results/screenshots/06-narration-sub.png',
    'Does this show a semi-transparent floating text bar near the bottom of the page with white italic text over a dark frosted-glass background?'
  );
  return { pass: visual.pass, reason: visual.reason };
}
