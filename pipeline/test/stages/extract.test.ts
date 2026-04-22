import { describe, it, expect, vi } from 'vitest';
import { runExtract } from '../../src/stages/extract.js';
import type { RawItem } from '../../src/lib/schemas.js';

const raw: RawItem = {
  id: 'x'.repeat(40), url: 'https://e/a', title: 't',
  sourceSlug: 's', publishedAt: '2026-04-20T00:00:00.000Z',
  guid: null, summary: null,
};

describe('runExtract', () => {
  it('enriches items with content, thumbnail, lang', async () => {
    const extractFn = vi.fn().mockResolvedValue({
      content: 'Hello world '.repeat(20),
      thumbnail: 'https://e/img.png',
      author: 'Jane',
      lang: 'en',
    });
    const out = await runExtract({ items: [raw], extractFn, concurrency: 2 });
    expect(out.items).toHaveLength(1);
    expect(out.items[0]).toMatchObject({ thumbnail: 'https://e/img.png', lang: 'en' });
  });

  it('falls back when extract throws', async () => {
    const extractFn = vi.fn().mockRejectedValue(new Error('nope'));
    const out = await runExtract({ items: [raw], extractFn, concurrency: 2 });
    expect(out.items).toHaveLength(1);
    expect(out.items[0]!.content).toBe('');
    expect(out.extractErrors).toHaveLength(1);
  });
});
