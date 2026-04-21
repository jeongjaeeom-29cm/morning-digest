import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { z } from 'zod';
import { SourceSchema, type Source } from './schemas.js';

const FileSchema = z.object({ sources: z.array(SourceSchema).min(1) });

export async function loadSources(path: string): Promise<Source[]> {
  const raw = await readFile(path, 'utf8');
  const parsed = parse(raw);
  const result = FileSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Invalid sources file at ${path}: ${result.error.message}`);
  }
  return result.data.sources;
}
