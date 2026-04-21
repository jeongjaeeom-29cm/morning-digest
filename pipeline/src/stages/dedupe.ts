import type { RawItem } from '../lib/schemas.js';
import type { SeenDb } from '../lib/seen-db.js';

export function runDedupe(opts: { raw: RawItem[]; db: SeenDb; date: string }): { newItems: RawItem[] } {
  const newIds = new Set(opts.db.filterNew(opts.raw.map(r => r.id)));
  const newItems = opts.raw.filter(r => newIds.has(r.id));
  if (newItems.length > 0) opts.db.markSeen(newItems.map(r => r.id), opts.date);
  return { newItems };
}
