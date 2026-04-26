import { ab, abRaw, abEval, getBaseUrl } from '../browser.js';
import { visualAssert } from '../haiku.js';

export async function run() {
  abRaw(`open ${getBaseUrl()}`);
  abRaw('wait --load networkidle');
  abEval(`document.getElementById('spotify-login-section').style.display='none'; setState('upload')`);
  abRaw(`wait --fn "document.getElementById('upload-section').style.display !== 'none'"`);

  const clickResult = ab('click #tab-url');
  if (clickResult.success === false) return { pass: false, reason: 'Failed to click #tab-url' };

  abRaw(`wait --fn "document.getElementById('tab-url-content').style.display !== 'none'"`);

  const urlTabVis = ab('is visible #tab-url-content');
  if (!urlTabVis.data?.visible) return { pass: false, reason: '#tab-url-content not visible after tab click' };

  const bookTabVis = ab('is visible #tab-book-content');
  if (bookTabVis.data?.visible) return { pass: false, reason: '#tab-book-content still visible after switching to Murakami tab' };

  const fillResult = ab('fill #url-input "https://www.tfm.co.jp/murakamiradio/report/2024/01/001.html"');
  if (fillResult.success === false) return { pass: false, reason: 'Failed to fill #url-input' };

  const submitEnabled = ab('is enabled #url-submit-btn');
  if (!submitEnabled.data?.enabled) return { pass: false, reason: '#url-submit-btn not enabled' };

  abRaw('screenshot qa/results/screenshots/07-murakami-tab.png');

  const visual = await visualAssert(
    'qa/results/screenshots/07-murakami-tab.png',
    'Does this show a tab bar where "Murakami Radio" is the active tab, and below it a URL input field with a green Play button?'
  );
  return { pass: visual.pass, reason: visual.reason };
}
