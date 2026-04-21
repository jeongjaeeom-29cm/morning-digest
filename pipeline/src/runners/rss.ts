import Parser from 'rss-parser';
import type { FetchFn } from '../stages/fetch.js';

const parser = new Parser({ timeout: 30_000 });

export const rssRunner: FetchFn = async (url) => {
  const feed = await parser.parseURL(url);
  return {
    items: feed.items.map(i => ({
      title: i.title ?? null,
      link: i.link ?? null,
      guid: i.guid ?? null,
      isoDate: i.isoDate ?? null,
      contentSnippet: i.contentSnippet ?? null,
    })),
  };
};
