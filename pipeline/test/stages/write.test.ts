import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runWrite } from '../../src/stages/write.js';
import type { CuratedItem, Source } from '../../src/lib/schemas.js';

const src: Source = { slug: 's', name: 'S', feedUrl: 'https://s', siteUrl: 'https://s', category: 'ai', priority: 5, tags: [] };
const curated: CuratedItem = {
  id: 'a'.repeat(40), url: 'https://e/a', title: 't', sourceSlug: 's',
  publishedAt: '2026-04-20T00:00:00.000Z',
  tags: ['ai'], summary: '요약.', highlights: [],
  filterScore: 8, thumbnail: null, author: null, lang: 'en',
};

describe('runWrite', () => {
  it('writes one json per curated item and a search index', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wr-'));
    const contentDir = join(dir, 'content');
    const searchIndex = join(dir, 'search.json');
    runWrite({ curated: [curated], sources: [src], contentDir, searchIndexPath: searchIndex, ingestedAt: '2026-04-21T05:30:00.000Z' });
    const files = readdirSync(contentDir);
    expect(files).toEqual([`${curated.id}.json`]);
    const wrote = JSON.parse(readFileSync(join(contentDir, files[0]), 'utf8'));
    expect(wrote.source).toMatchObject({ slug: 's', name: 'S', category: 'ai' });
    const idx = JSON.parse(readFileSync(searchIndex, 'utf8'));
    expect(idx.items[0]).toMatchObject({ id: curated.id, title: 't' });
  });
});
