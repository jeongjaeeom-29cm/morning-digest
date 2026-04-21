import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openSeenDb } from '../src/lib/seen-db.js';

describe('seen-db', () => {
  it('tracks seen ids and filters new ones', () => {
    const db = openSeenDb(join(mkdtempSync(join(tmpdir(), 'seen-')), 'seen.db'));
    expect(db.filterNew(['a', 'b'])).toEqual(['a', 'b']);
    db.markSeen(['a'], '2026-04-21');
    expect(db.filterNew(['a', 'b'])).toEqual(['b']);
    db.close();
  });

  it('records source health', () => {
    const db = openSeenDb(join(mkdtempSync(join(tmpdir(), 'seen-')), 'seen.db'));
    db.recordSourceResult('acme', false, '2026-04-21T00:00:00.000Z');
    db.recordSourceResult('acme', false, '2026-04-22T00:00:00.000Z');
    db.recordSourceResult('acme', true,  '2026-04-23T00:00:00.000Z');
    const h = db.getSourceHealth('acme');
    expect(h).toMatchObject({ slug: 'acme', consecutive_failures: 0 });
    db.close();
  });
});
