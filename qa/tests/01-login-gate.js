import { ab, abRaw, getBaseUrl } from '../browser.js';
import { visualAssert } from '../haiku.js';

export async function run() {
  abRaw(`open ${getBaseUrl()}`);
  abRaw('wait --load networkidle');

  const vis = ab('is visible #spotify-login-section');
  if (!vis.data?.visible) return { pass: false, reason: '#spotify-login-section not visible on load' };

  const btn = ab('get text #spotify-login-btn');
  if (!btn.data?.text?.toLowerCase().includes('connect spotify')) {
    return { pass: false, reason: `Login button text unexpected: "${btn.data?.text}"` };
  }

  abRaw('screenshot qa/results/screenshots/01-login-gate.png');

  const visual = await visualAssert(
    'qa/results/screenshots/01-login-gate.png',
    'Does this show a full-screen dark login overlay with a green "Connect Spotify" button and no app content visible behind it?'
  );
  return { pass: visual.pass, reason: visual.reason };
}
