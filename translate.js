import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const extractTool = {
  name: 'extract_tracks',
  description: 'Extract all songs from the page text',
  input_schema: {
    type: 'object',
    properties: {
      tracks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title:          { type: 'string' },
            artist:         { type: 'string' },
            commentary_ja:  { type: 'string', description: "Murakami's original Japanese commentary about this song. Empty string if none." },
          },
          required: ['title', 'artist', 'commentary_ja'],
        },
      },
    },
    required: ['tracks'],
  },
};

// Step 1: extract songs + Japanese commentary (fast)
async function extractTracks(rawText) {
  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    tools: [extractTool],
    tool_choice: { type: 'tool', name: 'extract_tracks' },
    messages: [{
      role: 'user',
      content: `Extract every song from this Murakami Radio page. For each song include the host's exact Japanese commentary if present.

TEXT:
${rawText.slice(0, 60000)}`,
    }],
  });
  const toolUse = msg.content.find(b => b.type === 'tool_use');
  return toolUse?.input?.tracks || [];
}

// Step 2: translate one track's commentary to Chinese (runs in parallel)
async function translateOne(track) {
  if (!track.commentary_ja) {
    return { ...track, narration: `${track.title}，${track.artist}的作品。`, mood: 'contemplative' };
  }
  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 8192,
    messages: [
      {
        role: 'user',
        content: `Translate this Japanese radio commentary to Chinese. Keep Murakami's warm, personal, casual tone. Return only the Chinese translation, nothing else.\n\n${track.commentary_ja}`,
      },
      { role: 'assistant', content: '' },
    ],
  });
  const narration = msg.content[0]?.text?.trim() || track.commentary_ja;
  // Simple mood from title keywords
  const mood = 'reflective';
  return { ...track, narration, mood };
}

export async function extractAndTranslate(rawText, sourceUrl) {
  const rawTracks = await extractTracks(rawText);
  if (!rawTracks.length) return { tracks: [], rawResult: 'no tracks extracted' };
  const tracks = await translateTracks(rawTracks);
  return { tracks, rawResult: JSON.stringify(tracks.slice(0, 2)) };
}

// Exported separately so server can call them with progress updates
export { extractTracks, translateTracks };

async function translateTracks(rawTracks) {
  const translated = [];
  for (let i = 0; i < rawTracks.length; i += 3) {
    const batch = rawTracks.slice(i, i + 3);
    const results = await Promise.all(batch.map(t => translateOne(t).catch(() => ({
      ...t, narration: t.commentary_ja || t.title, mood: 'reflective'
    }))));
    translated.push(...results);
  }
  return translated.map(t => ({ title: t.title, artist: t.artist, narration: t.narration, mood: t.mood }));
}
