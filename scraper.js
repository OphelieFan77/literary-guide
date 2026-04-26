import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function scrapeRadioPage(url) {
  // Extract title from raw HTML before stripping tags
  function extractTitle(html) {
    const h1 = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    if (h1) return h1[1].trim();
    const h2 = html.match(/<h2[^>]*>([^<]+)<\/h2>/i);
    if (h2) return h2[1].trim();
    const t = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    return t ? t[1].split('|')[0].trim() : null;
  }

  // Fetch raw HTML
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'ja,en;q=0.9',
    },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  const html = await res.text();

  // Extract just the song content section if present (avoids nav noise confusing Claude)
  const songAreaMatch = html.match(/<div class="songArea">([\s\S]*?)<\/div>\s*<!--\/songArea/i)
    || html.match(/<div class="songArea">([\s\S]*?)<div id="foot/i);
  const htmlToStrip = songAreaMatch ? songAreaMatch[0] : html;

  // Strip HTML to plain text
  const text = htmlToStrip
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();

  const title = extractTitle(html);

  // If page has enough content (not JS-rendered), return directly
  if (text.length > 500) return { rawText: text, url, title };

  // Page seems JS-rendered — ask Claude to extract from the raw HTML
  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: `This is raw HTML from a Murakami Radio episode page. Extract all the meaningful text content: song titles, artist names, and host commentary. Return only the extracted text, nothing else.\n\nHTML:\n${html.slice(0, 50000)}`
    }],
  });

  return { rawText: msg.content[0].text, url, title };
}
