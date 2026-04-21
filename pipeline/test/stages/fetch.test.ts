import { describe, it, expect, vi } from 'vitest';
import { runFetch } from '../../src/stages/fetch.js';
import type { Source } from '../../src/lib/schemas.js';

const sources: Source[] = [
  { slug: 's1', name: 'S1', feedUrl: 'https://s1.example.com', siteUrl: 'https://s1.example.com', category: 'ai', priority: 5, tags: [] },
  { slug: 's2', name: 'S2', feedUrl: 'https://s2.example.com', siteUrl: 'https://s2.example.com', category: 'ai', priority: 5, tags: [] },
];

describe('runFetch', () => {
  it('aggregates items across sources and isolates failures', async () => {
    const fetchFeed = vi.fn().mockImplementation(async (url: string) => {
      if (url === 'https://s2.example.com') throw new Error('boom');
      return {
        items: [{
          title: 'hello', link: 'https://s1.example.com/a', guid: 'g1',
          isoDate: '2026-04-20T00:00:00Z', contentSnippet: null,
        }],
      };
    });
    const result = await runFetch({ sources, fetchFeed, concurrency: 2 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ url: 'https://s1.example.com/a', sourceSlug: 's1' });
    expect(result.fetchErrors).toHaveLength(1);
    expect(result.fetchErrors[0]).toMatchObject({ slug: 's2' });
  });
});
