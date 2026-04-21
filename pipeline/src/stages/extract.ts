import pLimit from 'p-limit';
import type { RawItem, ExtractedItem } from '../lib/schemas.js';

export type ExtractFn = (url: string) => Promise<{
  content: string;
  thumbnail: string | null;
  author: string | null;
  lang: 'ko' | 'en' | 'ja' | 'other';
}>;

export interface ExtractResult {
  items: ExtractedItem[];
  extractErrors: { id: string; error: string }[];
}

export async function runExtract(opts: {
  items: RawItem[];
  extractFn: ExtractFn;
  concurrency?: number;
}): Promise<ExtractResult> {
  const limit = pLimit(opts.concurrency ?? 4);
  const results: ExtractedItem[] = [];
  const errors: { id: string; error: string }[] = [];
  await Promise.all(opts.items.map(it => limit(async () => {
    try {
      const r = await opts.extractFn(it.url);
      results.push({
        id: it.id, url: it.url, title: it.title, sourceSlug: it.sourceSlug,
        publishedAt: it.publishedAt,
        content: r.content, thumbnail: r.thumbnail, author: r.author, lang: r.lang,
      });
    } catch (e) {
      errors.push({ id: it.id, error: (e as Error).message });
      results.push({
        id: it.id, url: it.url, title: it.title, sourceSlug: it.sourceSlug,
        publishedAt: it.publishedAt,
        content: '', thumbnail: null, author: null, lang: 'other',
      });
    }
  })));
  return { items: results, extractErrors: errors };
}
