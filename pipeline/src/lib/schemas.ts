import { z } from 'zod';

export const TagAllowlist = [
  'ai','llm','agents','backend','frontend','infra','devops','db','security',
  'architecture','testing','kotlin','typescript','java','python','career','tooling',
] as const;

export const TagSchema = z.enum(TagAllowlist);

export const LangSchema = z.enum(['ko', 'en', 'ja', 'other']);

export const SourceRefSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1),
});

export const ItemSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{40}$/),
  url: z.string().url(),
  title: z.string().min(1),
  source: SourceRefSchema,
  publishedAt: z.string().datetime(),
  ingestedAt: z.string().datetime(),
  tags: z.array(TagSchema).max(8),
  summary: z.string().min(1).max(800),
  highlights: z.array(z.string().min(1)).max(5).default([]),
  filterScore: z.number().int().min(0).max(10),
  thumbnail: z.string().url().nullable(),
  author: z.string().nullable(),
  lang: LangSchema,
});
export type Item = z.infer<typeof ItemSchema>;

export const CuratedItemSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{40}$/),
  url: z.string().url(),
  title: z.string().min(1),
  sourceSlug: z.string().min(1),
  publishedAt: z.string().datetime(),
  tags: z.array(TagSchema).max(8),
  summary: z.string().min(1).max(800),
  highlights: z.array(z.string().min(1)).max(5).default([]),
  filterScore: z.number().int().min(0).max(10),
  thumbnail: z.string().url().nullable(),
  author: z.string().nullable(),
  lang: LangSchema,
});
export type CuratedItem = z.infer<typeof CuratedItemSchema>;

export const ExtractedItemSchema = z.object({
  id: z.string(),
  url: z.string().url(),
  title: z.string(),
  sourceSlug: z.string(),
  publishedAt: z.string().datetime(),
  content: z.string(),
  thumbnail: z.string().url().nullable(),
  author: z.string().nullable(),
  lang: LangSchema,
});
export type ExtractedItem = z.infer<typeof ExtractedItemSchema>;

export const RawItemSchema = z.object({
  id: z.string(),
  url: z.string().url(),
  title: z.string(),
  sourceSlug: z.string(),
  publishedAt: z.string().datetime(),
  guid: z.string().nullable(),
  summary: z.string().nullable(),
});
export type RawItem = z.infer<typeof RawItemSchema>;

export const SourceSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  feedUrl: z.string().url(),
  siteUrl: z.string().url(),
  category: z.string().min(1),
  priority: z.number().int().min(0).max(10).default(5),
  tags: z.array(TagSchema).default([]),
});
export type Source = z.infer<typeof SourceSchema>;
