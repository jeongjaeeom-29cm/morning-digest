import { describe, it, expect } from 'vitest';
import { runLlm, type ClaudeRunner } from '../../src/stages/llm.js';
import type { ExtractedItem } from '../../src/lib/schemas.js';

const extracted: ExtractedItem = {
  id: 'a'.repeat(40), url: 'https://e/a', title: 'title', sourceSlug: 's',
  publishedAt: '2026-04-20T00:00:00.000Z',
  content: 'body', thumbnail: null, author: null, lang: 'en',
};

function makeRunner(fn: (input: string) => Promise<string>): ClaudeRunner {
  return { run: (input) => fn(input) };
}

describe('runLlm', () => {
  it('parses valid curated JSON', async () => {
    const runner = makeRunner(async () => JSON.stringify({
      items: [{
        id: 'a'.repeat(40), url: 'https://e/a', title: 'title', sourceSlug: 's',
        publishedAt: '2026-04-20T00:00:00.000Z', tags: ['ai'],
        summary: '요약.', highlights: [], filterScore: 8,
        thumbnail: null, author: null, lang: 'en',
      }],
    }));
    const out = await runLlm({ items: [extracted], runner });
    expect(out.items).toHaveLength(1);
    expect(out.items[0]!.summary).toBe('요약.');
  });

  it('retries once on schema failure, then falls back', async () => {
    let calls = 0;
    const runner = makeRunner(async () => { calls++; return 'not json'; });
    const out = await runLlm({ items: [extracted], runner });
    expect(calls).toBe(2);
    expect(out.items).toHaveLength(1);
    expect(out.items[0]!.summary).toMatch(/^title/);
    expect(out.fallbacks).toEqual([extracted.id]);
  });

  it('filters items below filterScore threshold and keeps top 30', async () => {
    const many: ExtractedItem[] = Array.from({ length: 35 }, (_, i) => ({
      ...extracted, id: String(i).padStart(40, '0'), url: `https://e/${i}`,
    }));
    const runner = makeRunner(async () => JSON.stringify({
      items: many.map((m, i) => ({
        id: m.id, url: m.url, title: 't', sourceSlug: 's',
        publishedAt: m.publishedAt, tags: ['ai'],
        summary: 's', highlights: [], filterScore: i < 30 ? 8 : 3,
        thumbnail: null, author: null, lang: 'en',
      })),
    }));
    const out = await runLlm({ items: many, runner });
    expect(out.items).toHaveLength(30);
    expect(out.items.every(i => i.filterScore >= 6)).toBe(true);
  });
});
