import { describe, it, expect } from 'vitest';
import { execa } from 'execa';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('CLI dry-run', () => {
  it('reports stage plan without touching fs', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'repo-'));
    writeFileSync(join(repo, 'sources.yaml'), `sources:
  - slug: s1
    name: S1
    feedUrl: https://example.com/feed
    siteUrl: https://example.com
    category: ai
    priority: 5
    tags: []
`);
    mkdirSync(join(repo, 'pipeline', 'src'), { recursive: true });
    const { stdout, exitCode } = await execa('pnpm', [
      'tsx', 'pipeline/src/index.ts', '--dry-run', '--date=2026-04-21',
    ], { cwd: process.cwd(), env: { ...process.env, REPO_ROOT: repo }, reject: false });
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/dry-run/);
    expect(stdout).toMatch(/sources: 1/);
  });
}, { timeout: 60_000 });
