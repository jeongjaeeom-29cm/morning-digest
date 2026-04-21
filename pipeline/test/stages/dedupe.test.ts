import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openSeenDb } from '../../src/lib/seen-db.js';
import { runDedupe } from '../../src/stages/dedupe.js';
import type { RawItem } from '../../src/lib/schemas.js';

const raw = (id: string): RawItem => ({
  id, url: `https://e/${id}`, title: `t-${id}`,
  sourceSlug: 's', publishedAt: '2026-04-20T00:00:00.000Z',
  guid: null, summary: null,
});

describe('runDedupe', () => {
  it('keeps only unseen ids and marks them', () => {
    const db = openSeenDb(join(mkdtempSync(join(tmpdir(), 'dd-')), 'seen.db'));
    db.markSeen(['a'], '2026-04-20');
    const out = runDedupe({ raw: [raw('a'), raw('b')], db, date: '2026-04-21' });
    expect(out.newItems.map(i => i.id)).toEqual(['b']);
    expect(db.filterNew(['b'])).toEqual([]);
    db.close();
  });
});
