import { defineCollection, z } from 'astro:content';

const itemSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{40}$/),
  url: z.string().url(),
  title: z.string().min(1),
  source: z.object({
    slug: z.string(),
    name: z.string(),
    category: z.string(),
  }),
  publishedAt: z.string(),
  ingestedAt: z.string(),
  tags: z.array(z.string()).max(8),
  summary: z.string().min(1).max(800),
  highlights: z.array(z.string()).max(5),
  filterScore: z.number().min(0).max(10),
  thumbnail: z.string().url().nullable(),
  author: z.string().nullable(),
  lang: z.enum(['ko', 'en', 'ja', 'other']),
});

export const collections = {
  items: defineCollection({ type: 'data', schema: itemSchema }),
};
