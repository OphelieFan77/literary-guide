import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function visualAssert(screenshotPath, question) {
  const imageData = readFileSync(screenshotPath).toString('base64');
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: imageData } },
        {
          type: 'text',
          text: `You are a Spotify software engineer doing QA on a web app. Answer only with JSON: {"pass": true/false, "reason": "one sentence"}.\nQuestion: ${question}`,
        },
      ],
    }],
  });
  const text = response.content[0].text.trim();
  try { return JSON.parse(text.match(/\{.*\}/s)[0]); }
  catch { return { pass: false, reason: `Haiku parse error: ${text}` }; }
}
