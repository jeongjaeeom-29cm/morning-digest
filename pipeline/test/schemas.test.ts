import { describe, it, expect } from 'vitest';
import { ItemSchema, CuratedItemSchema, TagAllowlist } from '../src/lib/schemas.js';

describe('ItemSchema', () => {
  const base = {
    id: 'a'.repeat(40),
    url: 'https://example.com/x',
    title: 'Hello',
    source: { slug: 'example', name: 'Example', category: 'ai' },
    publishedAt: '2026-04-20T00:00:00.000Z',
    ingestedAt: '2026-04-21T05:30:00.000Z',
    tags: ['ai', 'llm'],
    summary: '요약입니다.',
    highlights: [],
    filterScore: 8,
    thumbnail: null,
    author: null,
    lang: 'ko' as const,
  };

  it('accepts a valid item', () => {
    expect(ItemSchema.parse(base)).toMatchObject({ id: base.id });
  });

  it('rejects tags outside the allowlist', () => {
    expect(() => ItemSchema.parse({ ...base, tags: ['nonsense'] })).toThrow();
  });

  it('rejects filterScore out of range', () => {
    expect(() => ItemSchema.parse({ ...base, filterScore: 11 })).toThrow();
  });

  it('rejects malformed url', () => {
    expect(() => ItemSchema.parse({ ...base, url: 'not-a-url' })).toThrow();
  });
});

describe('CuratedItemSchema', () => {
  it('requires summary non-empty', () => {
    const curated = {
      id: 'b'.repeat(40),
      url: 'https://example.com/y',
      title: 't',
      sourceSlug: 'example',
      publishedAt: '2026-04-20T00:00:00.000Z',
      tags: ['ai'],
      summary: '',
      highlights: [],
      filterScore: 7,
      thumbnail: null,
      author: null,
      lang: 'ko',
    };
    expect(() => CuratedItemSchema.parse(curated)).toThrow();
  });
});

describe('TagAllowlist', () => {
  it('contains expected tags', () => {
    expect(TagAllowlist).toContain('ai');
    expect(TagAllowlist).toContain('kotlin');
  });
});
