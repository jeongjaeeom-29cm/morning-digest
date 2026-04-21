import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJsonlLogger } from '../src/lib/log.js';

describe('createJsonlLogger', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'ml-')); });

  it('appends one json per line', () => {
    const log = createJsonlLogger(join(dir, 'run.jsonl'));
    log.write({ stage: 'fetch', ok: true, itemsIn: 0, itemsOut: 10, durationMs: 5 });
    log.write({ stage: 'dedupe', ok: true, itemsIn: 10, itemsOut: 7, durationMs: 2 });
    const content = readFileSync(join(dir, 'run.jsonl'), 'utf8');
    const lines = content.trim().split('\n').map(l => JSON.parse(l));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ stage: 'fetch', itemsOut: 10 });
  });
});
