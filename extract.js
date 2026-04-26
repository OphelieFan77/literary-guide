import { readFile } from 'fs/promises';
import pdfParse from 'pdf-parse';

export async function extractText(filePath, mimetype) {
  if (mimetype === 'application/pdf' || filePath.endsWith('.pdf')) {
    const buf = await readFile(filePath);
    const data = await pdfParse(buf);
    return data.text.slice(0, 80000);
  }

  if (mimetype === 'application/epub+zip' || filePath.endsWith('.epub')) {
    // epub2 uses callbacks — wrap in promise
    const { default: EPub } = await import('epub2');
    return new Promise((resolve, reject) => {
      const epub = new EPub(filePath);
      epub.on('end', () => {
        const chapters = epub.flow.map(ch => ch.id);
        const texts = [];
        let pending = chapters.length;
        if (!pending) return resolve('');
        for (const id of chapters) {
          epub.getChapter(id, (err, text) => {
            if (!err) texts.push(text.replace(/<[^>]+>/g, ' '));
            if (--pending === 0) resolve(texts.join('\n').slice(0, 80000));
          });
        }
      });
      epub.on('error', reject);
      epub.parse();
    });
  }

  const text = await readFile(filePath, 'utf-8');
  return text.slice(0, 80000);
}
