import { mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { abClose } from './browser.js';
import { FIXTURE_TRACKS } from './fixture.js';

mkdirSync('qa/results/screenshots', { recursive: true });
mkdirSync('cache/jobs', { recursive: true });

writeFileSync('cache/jobs/job_qa_fixture.json', JSON.stringify({
  status: 'done', step: 'Done (cached)',
  done: 3, total: 3,
  tracks: FIXTURE_TRACKS.slice(0, 3),
  playlistTitle: 'QA Fixture Playlist',
}));

const tests = [
  '01-login-gate', '02-upload-unauthd', '03-processing',
  '04-track-list', '05-player-bar', '06-narration-sub',
  '07-murakami-tab', '08-playback',
  '09-error-state', '10-track-click-no-auth', '11-oauth-token-validation',
  '12-save-playlist',
].map(n => `./tests/${n}.js`);

const results = [];
for (const t of tests) {
  process.stdout.write(`Running ${t}... `);
  try {
    const mod = await import(resolve('qa', t));
    const result = await mod.run();
    results.push({ test: t, ...result });
    const tag = result.skip ? '[SKIP]' : result.pass ? '[PASS]' : '[FAIL]';
    console.log(tag, result.reason ?? '');
  } catch (e) {
    results.push({ test: t, pass: false, reason: e.message });
    console.log('[ERROR]', e.message);
  }
}

abClose();

const passed = results.filter(r => r.pass && !r.skip).length;
const skipped = results.filter(r => r.skip).length;
const failed = results.filter(r => !r.pass && !r.skip).length;
console.log(`\nResults: ${passed} passed, ${failed} failed, ${skipped} skipped`);
process.exit(failed > 0 ? 1 : 0);
