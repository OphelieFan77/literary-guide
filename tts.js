import { createHash } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { writeFile } from 'fs/promises';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const CACHE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'cache');
mkdirSync(CACHE_DIR, { recursive: true });

export async function synthesize(text) {
  const hash = createHash('sha1').update(text).digest('hex');
  const filePath = path.join(CACHE_DIR, `${hash}.mp3`);

  if (existsSync(filePath)) return { hash, path: filePath };

  const apiKey = process.env.FISH_AUDIO_API_KEY;
  const voiceId = process.env.FISH_AUDIO_VOICE_ID;

  if (apiKey && voiceId) {
    const res = await fetch('https://api.fish.audio/v1/tts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'model': 's2-pro' },
      body: JSON.stringify({ text, reference_id: voiceId, format: 'mp3' }),
      signal: AbortSignal.timeout(60000),
    });
    if (res.ok) {
      await writeFile(filePath, Buffer.from(await res.arrayBuffer()));
      return { hash, path: filePath };
    }
    console.warn('[tts] Fish Audio failed:', res.status, '— falling back to say');
  }

  // macOS say fallback — speaks immediately, no file
  await new Promise(resolve => {
    const proc = spawn('say', ['-v', 'Samantha', text.slice(0, 500)]);
    proc.on('close', resolve);
    proc.on('error', resolve);
  });
  return null;
}

export function ttsUrl(hash) {
  return `/tts/${hash}.mp3`;
}
