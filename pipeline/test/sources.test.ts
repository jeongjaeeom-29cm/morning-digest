import { describe, it, expect } from 'vitest';
import { loadSources } from '../src/lib/sources.js';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIX = (n: string) => join(__dirname, 'fixtures', n);

describe('loadSources', () => {
  it('parses a valid yaml', async () => {
    const sources = await loadSources(FIX('sources.valid.yaml'));
    expect(sources).toHaveLength(1);
    expect(sources[0]!.slug).toBe('infoq-ai');
  });

  it('throws a descriptive error for invalid yaml', async () => {
    await expect(loadSources(FIX('sources.invalid.yaml'))).rejects.toThrow(/sources/);
  });
});
