import pLimit from 'p-limit';
import { stableId } from '../lib/hash.js';
import type { RawItem, Source } from '../lib/schemas.js';

export type ParsedFeedItem = {
  title?: string | null;
  link?: string | null;
  guid?: string | null;
  isoDate?: string | null;
  contentSnippet?: string | null;
};
export type ParsedFeed = { items: ParsedFeedItem[] };
export type FetchFn = (url: string) => Promise<ParsedFeed>;
export type FetchErrors = { slug: string; error: string };

export interface FetchResult {
  items: RawItem[];
  fetchErrors: FetchErrors[];
}

export async function runFetch(opts: {
  sources: Source[];
  fetchFeed: FetchFn;
  concurrency?: number;
}): Promise<FetchResult> {
  const limit = pLimit(opts.concurrency ?? 8);
  const items: RawItem[] = [];
  const errors: FetchErrors[] = [];

  await Promise.all(
    opts.sources.map(src =>
      limit(async () => {
        try {
          const feed = await opts.fetchFeed(src.feedUrl);
          for (const fi of feed.items) {
            if (!fi.link || !fi.title) continue;
            const url = fi.link;
            const published = fi.isoDate ?? new Date().toISOString();
            items.push({
              id: stableId(fi.guid ?? null, url),
              url,
              title: fi.title,
              sourceSlug: src.slug,
              publishedAt: published,
              guid: fi.guid ?? null,
              summary: fi.contentSnippet ?? null,
            });
          }
        } catch (e) {
          errors.push({ slug: src.slug, error: (e as Error).message });
        }
      }),
    ),
  );

  return { items, fetchErrors: errors };
}
