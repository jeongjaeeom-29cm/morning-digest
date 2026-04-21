import { createHash } from 'node:crypto';

export function stableId(guid: string | null, url: string): string {
  const key = guid ?? url;
  return createHash('sha1').update(key).digest('hex');
}
