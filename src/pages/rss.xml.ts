import rss from '@astrojs/rss';
import { getCollection, type CollectionEntry } from 'astro:content';

export async function GET(context: { site?: URL }) {
  const items = (await getCollection('items'))
    .sort((a: CollectionEntry<'items'>, b: CollectionEntry<'items'>) =>
      Date.parse(b.data.publishedAt) - Date.parse(a.data.publishedAt))
    .slice(0, 30);
  return rss({
    title: 'morning-digest',
    description: 'Personal morning digest',
    site: context.site?.toString() ?? 'https://example.invalid',
    items: items.map((i: CollectionEntry<'items'>) => ({
      title: i.data.title,
      link: i.data.url,
      pubDate: new Date(i.data.publishedAt),
      description: i.data.summary,
    })),
  });
}
