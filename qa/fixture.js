import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const FALLBACK_TRACKS = [
  { title: 'Norwegian Wood', artist: 'The Beatles', context: 'Chapter 1', narration: 'A melancholic Beatles classic.', mood: 'nostalgic', narrationHash: null, narrationUrl: null, spotifyUri: 'spotify:track:0RZPB9wMJl1UMSoJNlZQzA' },
  { title: 'Clair de Lune', artist: 'Claude Debussy', context: 'Chapter 3', narration: 'Moonlight in musical form.', mood: 'serene', narrationHash: null, narrationUrl: null, spotifyUri: null },
  { title: 'So What', artist: 'Miles Davis', context: 'Chapter 5', narration: 'Miles Davis at his coolest.', mood: 'cool', narrationHash: null, narrationUrl: null, spotifyUri: 'spotify:track:2mGwHAaBz1GEeRjFuqzBL1' },
];

const CACHE_PATH = resolve('cache/books/2487e0cd9203e6aaa5b0d59ed005aa3e027af7a5.json');
let FIXTURE_TRACKS = FALLBACK_TRACKS;

if (existsSync(CACHE_PATH)) {
  const parsed = JSON.parse(readFileSync(CACHE_PATH, 'utf-8'));
  FIXTURE_TRACKS = Array.isArray(parsed) ? parsed : parsed.tracks;
}

export { FIXTURE_TRACKS };
