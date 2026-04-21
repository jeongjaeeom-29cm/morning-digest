import { extract } from '@extractus/article-extractor';
import { franc } from 'franc';
import type { ExtractFn } from '../stages/extract.js';

const langMap: Record<string, 'ko' | 'en' | 'ja' | 'other'> = {
  kor: 'ko', eng: 'en', jpn: 'ja',
};

export const articleExtractor: ExtractFn = async (url) => {
  const art = await extract(url);
  if (!art) return { content: '', thumbnail: null, author: null, lang: 'other' };
  const content = (art.content ?? '').replace(/<[^>]+>/g, ' ').slice(0, 20000);
  const code = content.length > 40 ? franc(content) : 'und';
  return {
    content,
    thumbnail: art.image ?? null,
    author: art.author ?? null,
    lang: langMap[code] ?? 'other',
  };
};
