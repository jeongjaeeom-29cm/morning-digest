import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ItemSchema, type CuratedItem, type Item, type Source } from '../lib/schemas.js';

export function runWrite(opts: {
  curated: CuratedItem[];
  sources: Source[];
  contentDir: string;
  searchIndexPath: string;
  ingestedAt: string;
}) {
  mkdirSync(opts.contentDir, { recursive: true });
  const bySlug = new Map(opts.sources.map(s => [s.slug, s]));

  const items: Item[] = opts.curated.map(c => {
    const src = bySlug.get(c.sourceSlug);
    if (!src) throw new Error(`Unknown source slug: ${c.sourceSlug}`);
    const item: Item = {
      id: c.id, url: c.url, title: c.title,
      source: { slug: src.slug, name: src.name, category: src.category },
      publishedAt: c.publishedAt,
      ingestedAt: opts.ingestedAt,
      tags: c.tags, summary: c.summary, highlights: c.highlights,
      filterScore: c.filterScore,
      thumbnail: c.thumbnail, author: c.author, lang: c.lang,
    };
    return ItemSchema.parse(item);
  });

  for (const item of items) {
    writeFileSync(join(opts.contentDir, `${item.id}.json`), JSON.stringify(item, null, 2));
  }

  mkdirSync(dirname(opts.searchIndexPath), { recursive: true });
  const index = {
    generatedAt: opts.ingestedAt,
    items: items.map(i => ({
      id: i.id, title: i.title, summary: i.summary,
      tags: i.tags, source: i.source.name, url: i.url, publishedAt: i.publishedAt,
    })),
  };
  writeFileSync(opts.searchIndexPath, JSON.stringify(index));

  return { itemsWritten: items.length };
}
