import { z } from 'zod';
import { CuratedItemSchema, type CuratedItem, type ExtractedItem } from '../lib/schemas.js';

export interface ClaudeRunner {
  run(input: string, retryHint?: string): Promise<string>;
}

const ResponseSchema = z.object({ items: z.array(CuratedItemSchema) });

export interface LlmResult {
  items: CuratedItem[];
  fallbacks: string[];
}

function fallbackCurated(it: ExtractedItem): CuratedItem {
  return {
    id: it.id, url: it.url, title: it.title, sourceSlug: it.sourceSlug,
    publishedAt: it.publishedAt,
    tags: [],
    summary: it.title.slice(0, 200),
    highlights: [],
    filterScore: 5,
    thumbnail: it.thumbnail,
    author: it.author,
    lang: it.lang,
  };
}

function safeParse(text: string):
  | { ok: true; data: z.infer<typeof ResponseSchema> }
  | { ok: false; error: string } {
  try {
    const parsed = ResponseSchema.safeParse(JSON.parse(text));
    if (!parsed.success) return { ok: false, error: parsed.error.message };
    return { ok: true, data: parsed.data };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function runLlm(opts: { items: ExtractedItem[]; runner: ClaudeRunner }): Promise<LlmResult> {
  if (opts.items.length === 0) return { items: [], fallbacks: [] };
  const payload = JSON.stringify({ items: opts.items });

  let text = await opts.runner.run(payload);
  let parsed = safeParse(text);
  if (!parsed.ok) {
    text = await opts.runner.run(payload, `Previous output failed: ${parsed.error}. Return ONLY JSON matching the schema.`);
    parsed = safeParse(text);
  }

  if (!parsed.ok) {
    const items = opts.items.map(fallbackCurated);
    return { items, fallbacks: opts.items.map(i => i.id) };
  }

  const byId = new Map(parsed.data.items.map(i => [i.id, i]));
  const fallbacks: string[] = [];
  const enriched: CuratedItem[] = [];
  for (const it of opts.items) {
    const curated = byId.get(it.id);
    if (!curated) { enriched.push(fallbackCurated(it)); fallbacks.push(it.id); continue; }
    enriched.push(curated);
  }

  const keep = enriched
    .filter(i => i.filterScore >= 6)
    .sort((a, b) => b.filterScore - a.filterScore)
    .slice(0, 30);

  return { items: keep, fallbacks };
}
