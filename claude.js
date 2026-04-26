import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const extractTool = {
  name: 'extract_music',
  description: 'Extract all specifically named music from a book text',
  input_schema: {
    type: 'object',
    properties: {
      tracks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title:     { type: 'string', description: 'Exact song or album title' },
            artist:    { type: 'string', description: 'Specific artist or composer name' },
            context:   { type: 'string', description: 'One sentence from the book describing when this music appears' },
            narration: { type: 'string', description: '2-3 warm educational sentences about this music' },
            mood:      { type: 'string', description: 'One word describing the mood' },
          },
          required: ['title', 'artist', 'context', 'narration', 'mood'],
        },
      },
    },
    required: ['tracks'],
  },
};

export async function extractMusic(text) {
  // Pass 1: extract music passages
  const pass1 = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    messages: [{
      role: 'user',
      content: `Extract every sentence that mentions a specific named song, album, artist, or musical piece. Return only those excerpts, nothing else.\n\nTEXT:\n${text}`,
    }],
  });
  const excerpts = pass1.content[0].text;

  // Pass 2: structured extraction with tool_use
  const pass2 = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    tools: [extractTool],
    tool_choice: { type: 'tool', name: 'extract_music' },
    messages: [{
      role: 'user',
      content: `Extract specifically named music from these book excerpts. Skip vague genre references like "jazz music" or "classical music". Only include songs/albums with specific titles and artists.\n\nEXCERPTS:\n${excerpts}`,
    }],
  });

  const toolUse = pass2.content.find(b => b.type === 'tool_use');
  return toolUse?.input?.tracks || [];
}
