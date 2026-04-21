import { describe, it, expect } from 'vitest';
import { workspacePaths } from '../src/lib/paths.js';

describe('workspacePaths', () => {
  it('computes date-scoped file paths', () => {
    const p = workspacePaths('/repo', '2026-04-21');
    expect(p.raw).toBe('/repo/_workspace/2026-04-21/raw.json');
    expect(p.new).toBe('/repo/_workspace/2026-04-21/new.json');
    expect(p.extracted).toBe('/repo/_workspace/2026-04-21/extracted.json');
    expect(p.curated).toBe('/repo/_workspace/2026-04-21/curated.json');
    expect(p.runSummary).toBe('/repo/_workspace/2026-04-21/run_summary.json');
    expect(p.runLog).toBe('/repo/_workspace/logs/2026-04-21.jsonl');
    expect(p.contentDir).toBe('/repo/src/content/items');
    expect(p.searchIndex).toBe('/repo/public/search-index.json');
    expect(p.seenDb).toBe('/repo/state/seen.db');
  });
});
