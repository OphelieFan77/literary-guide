import { spawnSync } from 'child_process';
import { resolve } from 'path';

const BIN = resolve('node_modules/.bin/agent-browser');
const SESSION_NAME = 'qa-run';
const UA_VALUE = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Spotify/1.0 SpotifyEngineer/QA';

export const getBaseUrl = () => `http://127.0.0.1:${process.env.PORT || 8080}`;

function baseArgs(json = false) {
  const args = ['--session', SESSION_NAME, '--user-agent', UA_VALUE];
  if (json) args.push('--json');
  return args;
}

function run(args, opts = {}) {
  const result = spawnSync(BIN, args, {
    encoding: 'utf-8',
    timeout: opts.timeout ?? 30000,
  });
  if (result.error) throw result.error;
  return result;
}

// JSON-returning commands: is, get, click, fill, etc.
export function ab(command, opts = {}) {
  const parts = command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
  const args = [...baseArgs(true), ...parts.map(p => p.replace(/^['"]|['"]$/g, ''))];
  const result = run(args, opts);
  const raw = result.stdout;
  if (result.status !== 0) {
    try { return JSON.parse(raw); }
    catch { return { success: false, raw: raw + result.stderr }; }
  }
  try { return JSON.parse(raw); }
  catch { return { success: false, raw }; }
}

// Non-JSON commands: open, wait, screenshot
export function abRaw(command, opts = {}) {
  const parts = command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
  const args = [...baseArgs(false), ...parts.map(p => p.replace(/^['"]|['"]$/g, ''))];
  const timeout = opts.timeout ?? 60000;
  const result = run(args, { ...opts, timeout });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout;
}

// Eval JS safely via spawnSync — bypasses shell entirely
export function abEval(js, opts = {}) {
  const args = [...baseArgs(false), 'eval', js];
  const result = run(args, opts);
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout;
}

export function abClose() {
  spawnSync(BIN, ['--session', SESSION_NAME, 'close', '--all'], { encoding: 'utf-8' });
}
