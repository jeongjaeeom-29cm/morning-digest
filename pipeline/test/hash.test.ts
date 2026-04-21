import { describe, it, expect } from 'vitest';
import { stableId } from '../src/lib/hash.js';

describe('stableId', () => {
  it('is deterministic for same input', () => {
    expect(stableId('g-1', 'https://e/a')).toBe(stableId('g-1', 'https://e/a'));
  });
  it('differs when url differs', () => {
    expect(stableId(null, 'https://e/a')).not.toBe(stableId(null, 'https://e/b'));
  });
  it('falls back to url when guid is null', () => {
    expect(stableId(null, 'https://e/a')).toMatch(/^[a-f0-9]{40}$/);
  });
});
