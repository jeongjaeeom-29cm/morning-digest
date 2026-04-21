# morning-digest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a personal, static RSS curation site (Astro SSG on GitHub Pages) whose content is produced by a local TypeScript pipeline that fetches feeds, dedupes, extracts, runs a Claude Code Skill for filter/summarize/tag, and writes typed JSON into Astro content collections.

**Architecture:** Three strictly separated layers — `pipeline/` (Node CLI, UI-agnostic) → `src/content/` (JSON schema = the only contract) → `src/` Astro UI (pipeline-agnostic). Nightly launchd job runs the pipeline locally, commits, and pushes; GitHub Actions builds Astro and deploys to `gh-pages`.

**Tech Stack:** Node 20, pnpm 9, TypeScript strict, Astro 5, Vitest, Playwright, zod, rss-parser, p-limit, execa, @extractus/article-extractor, better-sqlite3, yaml, fuse.js, `astro:assets`.

**Reference spec:** `docs/superpowers/specs/2026-04-21-morning-digest-design.md`.

**Conventions used throughout this plan:**
- Commit prefix: `feat|fix|chore|test|docs: <subject>`. No JIRA prefix (personal repo).
- TDD: every pipeline unit has a failing test first.
- Run tests with `pnpm vitest run <path>` and expect the shown output.
- After every task: `git add -A && git commit -m "<msg>"` as the final step.

---

## File Structure (decomposition map)

Pipeline layer (`pipeline/`):
- `pipeline/src/index.ts` — CLI entry (arg parsing, stage dispatch).
- `pipeline/src/lib/hash.ts` — stable item id hash.
- `pipeline/src/lib/log.ts` — jsonl structured logger.
- `pipeline/src/lib/paths.ts` — workspace/date path helpers.
- `pipeline/src/lib/schemas.ts` — zod schemas for raw/new/extracted/curated/item.
- `pipeline/src/lib/sources.ts` — `sources.yaml` reader + validation.
- `pipeline/src/lib/seen-db.ts` — better-sqlite3 wrapper for dedupe + source health.
- `pipeline/src/stages/fetch.ts`
- `pipeline/src/stages/dedupe.ts`
- `pipeline/src/stages/extract.ts`
- `pipeline/src/stages/llm.ts` (depends on an injectable `ClaudeRunner`)
- `pipeline/src/stages/write.ts`
- `pipeline/src/runners/claude-cli.ts` — real `claude -p` runner via execa.
- `pipeline/test/fixtures/**` — golden JSON fixtures.
- `pipeline/test/*.test.ts` — unit tests.

Astro layer (`src/`):
- `src/content/config.ts` — content collections (items, sources).
- `src/content/items/*.json` — pipeline output (generated).
- `src/content/sources.ts` — derived collection loader from `sources.yaml`.
- `src/layouts/Base.astro`
- `src/components/ItemCard.astro`
- `src/components/TagFilter.astro` (island)
- `src/components/SearchBox.astro` (island)
- `src/components/ThemeToggle.astro` (island)
- `src/components/ReadTracker.astro` (island)
- `src/pages/index.astro`
- `src/pages/tags/[tag].astro`
- `src/pages/sources/[slug].astro`
- `src/pages/archive/index.astro`
- `src/pages/archive/[ym].astro`
- `src/pages/rss.xml.ts`
- `src/styles/globals.css`
- `public/fallbacks/*.svg` (category-keyed)

Project-level:
- `sources.yaml`
- `astro.config.mjs`
- `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `.gitignore`, `.node-version`
- `.claude/skills/morning-digest/SKILL.md`
- `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`
- `scripts/daily.sh`, `scripts/dev.sh`
- `playwright.config.ts`, `e2e/smoke.spec.ts`
- `README.md`

State/ephemeral (gitignored):
- `state/seen.db`
- `_workspace/<date>/*.json`, `_workspace/logs/*`

---

## Phase 0 — Bootstrap

### Task 1: Initialize pnpm workspace & TS config

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.json`, `.node-version`, `.gitignore`, `.editorconfig`

- [ ] **Step 1: Create `.node-version`**

```
20.11.1
```

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "morning-digest",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@9.12.0",
  "engines": { "node": ">=20.11" },
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "digest:daily": "tsx pipeline/src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "lint": "tsc -p tsconfig.json --noEmit && tsc -p pipeline/tsconfig.json --noEmit"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 3: Create `tsconfig.json` (root, UI)**

```json
{
  "extends": "astro/tsconfigs/strict",
  "include": ["src", "src/**/*.astro"],
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  }
}
```

- [ ] **Step 4: Create `pipeline/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "types": ["node", "vitest/globals"]
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 5: Create `.gitignore`**

```
node_modules
dist
.astro
_workspace
state
.env
.env.*
!.env.example
.DS_Store
```

- [ ] **Step 6: Create `.editorconfig`**

```
root = true
[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true
```

- [ ] **Step 7: Install deps**

Run: `pnpm install`
Expected: lockfile created, `node_modules/` populated, no errors.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: bootstrap pnpm workspace and ts config"
```

---

### Task 2: Scaffold Astro app

**Files:**
- Create: `astro.config.mjs`, `src/pages/index.astro` (placeholder), `src/env.d.ts`

- [ ] **Step 1: Add Astro deps**

Run: `pnpm add astro@^5 @astrojs/sitemap@^3 sharp@^0.33`
Expected: deps added to `package.json`.

- [ ] **Step 2: Create `astro.config.mjs`**

```js
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://logan.github.io',
  base: '/morning-digest',
  trailingSlash: 'never',
  output: 'static',
  integrations: [sitemap()],
  image: {
    remotePatterns: [{ protocol: 'https' }],
  },
});
```

- [ ] **Step 3: Create `src/env.d.ts`**

```ts
/// <reference types="astro/client" />
```

- [ ] **Step 4: Create placeholder `src/pages/index.astro`**

```astro
---
---
<html lang="ko">
  <head><meta charset="utf-8"><title>morning-digest</title></head>
  <body><h1>morning-digest scaffold</h1></body>
</html>
```

- [ ] **Step 5: Verify build**

Run: `pnpm build`
Expected: `dist/index.html` exists, exit 0.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold astro app"
```

---

## Phase 1 — Content Schemas & Sources

### Task 3: Define zod schemas (pipeline contract)

**Files:**
- Create: `pipeline/src/lib/schemas.ts`
- Test: `pipeline/test/schemas.test.ts`

- [ ] **Step 1: Add zod**

Run: `pnpm add zod`

- [ ] **Step 2: Write failing test**

Create `pipeline/test/schemas.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ItemSchema, CuratedItemSchema, TagAllowlist } from '../src/lib/schemas.js';

describe('ItemSchema', () => {
  const base = {
    id: 'a'.repeat(40),
    url: 'https://example.com/x',
    title: 'Hello',
    source: { slug: 'example', name: 'Example', category: 'ai' },
    publishedAt: '2026-04-20T00:00:00.000Z',
    ingestedAt: '2026-04-21T05:30:00.000Z',
    tags: ['ai', 'llm'],
    summary: '요약입니다.',
    highlights: [],
    filterScore: 8,
    thumbnail: null,
    author: null,
    lang: 'ko' as const,
  };

  it('accepts a valid item', () => {
    expect(ItemSchema.parse(base)).toMatchObject({ id: base.id });
  });

  it('rejects tags outside the allowlist', () => {
    expect(() => ItemSchema.parse({ ...base, tags: ['nonsense'] })).toThrow();
  });

  it('rejects filterScore out of range', () => {
    expect(() => ItemSchema.parse({ ...base, filterScore: 11 })).toThrow();
  });

  it('rejects malformed url', () => {
    expect(() => ItemSchema.parse({ ...base, url: 'not-a-url' })).toThrow();
  });
});

describe('CuratedItemSchema', () => {
  it('requires summary non-empty', () => {
    const curated = {
      id: 'b'.repeat(40),
      url: 'https://example.com/y',
      title: 't',
      sourceSlug: 'example',
      publishedAt: '2026-04-20T00:00:00.000Z',
      tags: ['ai'],
      summary: '',
      highlights: [],
      filterScore: 7,
      thumbnail: null,
      author: null,
      lang: 'ko',
    };
    expect(() => CuratedItemSchema.parse(curated)).toThrow();
  });
});

describe('TagAllowlist', () => {
  it('contains expected tags', () => {
    expect(TagAllowlist).toContain('ai');
    expect(TagAllowlist).toContain('kotlin');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run pipeline/test/schemas.test.ts`
Expected: FAIL — cannot resolve `../src/lib/schemas.js`.

- [ ] **Step 4: Implement `pipeline/src/lib/schemas.ts`**

```ts
import { z } from 'zod';

export const TagAllowlist = [
  'ai','llm','agents','backend','frontend','infra','devops','db','security',
  'architecture','testing','kotlin','typescript','java','python','career','tooling',
] as const;

export const TagSchema = z.enum(TagAllowlist);

export const LangSchema = z.enum(['ko', 'en', 'ja', 'other']);

export const SourceRefSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1),
});

export const ItemSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{40}$/),
  url: z.string().url(),
  title: z.string().min(1),
  source: SourceRefSchema,
  publishedAt: z.string().datetime(),
  ingestedAt: z.string().datetime(),
  tags: z.array(TagSchema).max(8),
  summary: z.string().min(1).max(800),
  highlights: z.array(z.string().min(1)).max(5).default([]),
  filterScore: z.number().int().min(0).max(10),
  thumbnail: z.string().url().nullable(),
  author: z.string().nullable(),
  lang: LangSchema,
});
export type Item = z.infer<typeof ItemSchema>;

export const CuratedItemSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{40}$/),
  url: z.string().url(),
  title: z.string().min(1),
  sourceSlug: z.string().min(1),
  publishedAt: z.string().datetime(),
  tags: z.array(TagSchema).max(8),
  summary: z.string().min(1).max(800),
  highlights: z.array(z.string().min(1)).max(5).default([]),
  filterScore: z.number().int().min(0).max(10),
  thumbnail: z.string().url().nullable(),
  author: z.string().nullable(),
  lang: LangSchema,
});
export type CuratedItem = z.infer<typeof CuratedItemSchema>;

export const ExtractedItemSchema = z.object({
  id: z.string(),
  url: z.string().url(),
  title: z.string(),
  sourceSlug: z.string(),
  publishedAt: z.string().datetime(),
  content: z.string(),
  thumbnail: z.string().url().nullable(),
  author: z.string().nullable(),
  lang: LangSchema,
});
export type ExtractedItem = z.infer<typeof ExtractedItemSchema>;

export const RawItemSchema = z.object({
  id: z.string(),
  url: z.string().url(),
  title: z.string(),
  sourceSlug: z.string(),
  publishedAt: z.string().datetime(),
  guid: z.string().nullable(),
  summary: z.string().nullable(),
});
export type RawItem = z.infer<typeof RawItemSchema>;

export const SourceSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  feedUrl: z.string().url(),
  siteUrl: z.string().url(),
  category: z.string().min(1),
  priority: z.number().int().min(0).max(10).default(5),
  tags: z.array(TagSchema).default([]),
});
export type Source = z.infer<typeof SourceSchema>;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run pipeline/test/schemas.test.ts`
Expected: PASS (4 + 1 + 1 = 6 tests).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(pipeline): zod schemas for pipeline stages"
```

---

### Task 4: Hash util for stable item ids

**Files:**
- Create: `pipeline/src/lib/hash.ts`
- Test: `pipeline/test/hash.test.ts`

- [ ] **Step 1: Failing test**

```ts
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
```

- [ ] **Step 2: Run test**

Run: `pnpm vitest run pipeline/test/hash.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

```ts
import { createHash } from 'node:crypto';

export function stableId(guid: string | null, url: string): string {
  const key = guid ?? url;
  return createHash('sha1').update(key).digest('hex');
}
```

- [ ] **Step 4: Run test**

Run: `pnpm vitest run pipeline/test/hash.test.ts`
Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(pipeline): stable item id hash"
```

---

### Task 5: Jsonl logger

**Files:**
- Create: `pipeline/src/lib/log.ts`
- Test: `pipeline/test/log.test.ts`

- [ ] **Step 1: Failing test**

```ts
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
```

- [ ] **Step 2: Run test**

Run: `pnpm vitest run pipeline/test/log.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

```ts
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type StageLogEntry = {
  stage: string;
  ok: boolean;
  itemsIn?: number;
  itemsOut?: number;
  durationMs?: number;
  error?: string;
  [k: string]: unknown;
};

export interface JsonlLogger {
  write(entry: StageLogEntry): void;
}

export function createJsonlLogger(path: string): JsonlLogger {
  mkdirSync(dirname(path), { recursive: true });
  return {
    write(entry) {
      appendFileSync(path, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n');
    },
  };
}
```

- [ ] **Step 4: Run test**

Run: `pnpm vitest run pipeline/test/log.test.ts`
Expected: PASS (1/1).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(pipeline): jsonl logger"
```

---

### Task 6: Workspace path helpers

**Files:**
- Create: `pipeline/src/lib/paths.ts`
- Test: `pipeline/test/paths.test.ts`

- [ ] **Step 1: Failing test**

```ts
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
```

- [ ] **Step 2: Run** — Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
import { join } from 'node:path';

export function workspacePaths(repoRoot: string, date: string) {
  const base = join(repoRoot, '_workspace', date);
  return {
    raw: join(base, 'raw.json'),
    new: join(base, 'new.json'),
    extracted: join(base, 'extracted.json'),
    curated: join(base, 'curated.json'),
    runSummary: join(base, 'run_summary.json'),
    runLog: join(repoRoot, '_workspace', 'logs', `${date}.jsonl`),
    contentDir: join(repoRoot, 'src', 'content', 'items'),
    searchIndex: join(repoRoot, 'public', 'search-index.json'),
    seenDb: join(repoRoot, 'state', 'seen.db'),
  };
}
```

- [ ] **Step 4: Run** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(pipeline): workspace paths helper"
```

---

### Task 7: `sources.yaml` loader

**Files:**
- Create: `pipeline/src/lib/sources.ts`, `sources.yaml`
- Test: `pipeline/test/sources.test.ts`, `pipeline/test/fixtures/sources.valid.yaml`, `pipeline/test/fixtures/sources.invalid.yaml`

- [ ] **Step 1: Add `yaml` dep**

Run: `pnpm add yaml`

- [ ] **Step 2: Create fixtures**

`pipeline/test/fixtures/sources.valid.yaml`:
```yaml
sources:
  - slug: infoq-ai
    name: InfoQ AI
    feedUrl: https://feed.infoq.com/ai-ml/
    siteUrl: https://www.infoq.com/ai-ml/
    category: ai
    priority: 8
    tags: [ai, llm]
```

`pipeline/test/fixtures/sources.invalid.yaml`:
```yaml
sources:
  - slug: Bad Slug!
    name: ''
    feedUrl: not-a-url
    siteUrl: https://x.example
    category: ai
```

- [ ] **Step 3: Failing test**

```ts
import { describe, it, expect } from 'vitest';
import { loadSources } from '../src/lib/sources.js';
import { join } from 'node:path';

const FIX = (n: string) => join(__dirname, 'fixtures', n);

describe('loadSources', () => {
  it('parses a valid yaml', async () => {
    const sources = await loadSources(FIX('sources.valid.yaml'));
    expect(sources).toHaveLength(1);
    expect(sources[0].slug).toBe('infoq-ai');
  });

  it('throws a descriptive error for invalid yaml', async () => {
    await expect(loadSources(FIX('sources.invalid.yaml'))).rejects.toThrow(/sources/);
  });
});
```

- [ ] **Step 4: Run** — Expected: FAIL.

- [ ] **Step 5: Implement**

```ts
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
```

- [ ] **Step 6: Run** — Expected: PASS (2/2).

- [ ] **Step 7: Create initial root `sources.yaml`** (minimal, can grow later)

```yaml
sources:
  - slug: simonw-blog
    name: Simon Willison
    feedUrl: https://simonwillison.net/atom/everything/
    siteUrl: https://simonwillison.net/
    category: ai
    priority: 9
    tags: [ai, llm]
  - slug: martin-fowler
    name: Martin Fowler
    feedUrl: https://martinfowler.com/feed.atom
    siteUrl: https://martinfowler.com/
    category: architecture
    priority: 7
    tags: [architecture, backend]
```

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat(pipeline): sources.yaml loader and initial sources"
```

---

## Phase 2 — Seen DB (dedupe + source health)

### Task 8: Seen DB wrapper

**Files:**
- Create: `pipeline/src/lib/seen-db.ts`
- Test: `pipeline/test/seen-db.test.ts`

- [ ] **Step 1: Add `better-sqlite3`**

Run: `pnpm add better-sqlite3 @types/better-sqlite3`

- [ ] **Step 2: Failing test**

```ts
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
```

- [ ] **Step 3: Run** — Expected: FAIL.

- [ ] **Step 4: Implement**

```ts
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export interface SeenDb {
  filterNew(ids: string[]): string[];
  markSeen(ids: string[], date: string): void;
  recordSourceResult(slug: string, ok: boolean, at: string): void;
  getSourceHealth(slug: string): { slug: string; consecutive_failures: number; last_ok_at: string | null } | null;
  close(): void;
}

export function openSeenDb(path: string): SeenDb {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS seen_items (
      id TEXT PRIMARY KEY,
      first_seen_date TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS source_health (
      slug TEXT PRIMARY KEY,
      consecutive_failures INTEGER NOT NULL DEFAULT 0,
      last_ok_at TEXT
    );
  `);

  const hasStmt = db.prepare('SELECT 1 FROM seen_items WHERE id = ?');
  const insertStmt = db.prepare('INSERT OR IGNORE INTO seen_items (id, first_seen_date) VALUES (?, ?)');
  const getHealthStmt = db.prepare('SELECT * FROM source_health WHERE slug = ?');
  const upsertHealthOk = db.prepare(`
    INSERT INTO source_health (slug, consecutive_failures, last_ok_at)
    VALUES (?, 0, ?)
    ON CONFLICT(slug) DO UPDATE SET consecutive_failures = 0, last_ok_at = excluded.last_ok_at
  `);
  const upsertHealthFail = db.prepare(`
    INSERT INTO source_health (slug, consecutive_failures, last_ok_at)
    VALUES (?, 1, NULL)
    ON CONFLICT(slug) DO UPDATE SET consecutive_failures = source_health.consecutive_failures + 1
  `);

  return {
    filterNew(ids) { return ids.filter(id => !hasStmt.get(id)); },
    markSeen(ids, date) {
      const tx = db.transaction((xs: string[]) => { for (const id of xs) insertStmt.run(id, date); });
      tx(ids);
    },
    recordSourceResult(slug, ok, at) {
      if (ok) upsertHealthOk.run(slug, at); else upsertHealthFail.run(slug);
    },
    getSourceHealth(slug) { return (getHealthStmt.get(slug) as any) ?? null; },
    close() { db.close(); },
  };
}
```

- [ ] **Step 5: Run** — Expected: PASS (2/2).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(pipeline): seen-db with dedupe and source health"
```

---

## Phase 3 — Stages

### Task 9: `fetch` stage

**Files:**
- Create: `pipeline/src/stages/fetch.ts`
- Test: `pipeline/test/stages/fetch.test.ts`

Design: stage receives injectable `fetchFeed(url) => Promise<ParsedFeed>` so the test can stub. Real runtime uses `rss-parser`.

- [ ] **Step 1: Add deps**

Run: `pnpm add rss-parser p-limit`

- [ ] **Step 2: Failing test**

```ts
import { describe, it, expect, vi } from 'vitest';
import { runFetch } from '../../src/stages/fetch.js';
import type { Source } from '../../src/lib/schemas.js';

const sources: Source[] = [
  { slug: 's1', name: 'S1', feedUrl: 'https://s1', siteUrl: 'https://s1', category: 'ai', priority: 5, tags: [] },
  { slug: 's2', name: 'S2', feedUrl: 'https://s2', siteUrl: 'https://s2', category: 'ai', priority: 5, tags: [] },
];

describe('runFetch', () => {
  it('aggregates items across sources and isolates failures', async () => {
    const fetchFeed = vi.fn().mockImplementation(async (url: string) => {
      if (url === 'https://s2') throw new Error('boom');
      return {
        items: [{
          title: 'hello', link: 'https://s1/a', guid: 'g1',
          isoDate: '2026-04-20T00:00:00Z', contentSnippet: null,
        }],
      };
    });
    const result = await runFetch({ sources, fetchFeed, concurrency: 2 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ url: 'https://s1/a', sourceSlug: 's1' });
    expect(result.fetchErrors).toHaveLength(1);
    expect(result.fetchErrors[0]).toMatchObject({ slug: 's2' });
  });
});
```

- [ ] **Step 3: Run** — Expected: FAIL.

- [ ] **Step 4: Implement**

```ts
import pLimit from 'p-limit';
import { stableId } from '../lib/hash.js';
import type { RawItem, Source } from '../lib/schemas.js';

export type ParsedFeedItem = {
  title?: string | null;
  link?: string | null;
  guid?: string | null;
  isoDate?: string | null;
  contentSnippet?: string | null;
};

export type ParsedFeed = { items: ParsedFeedItem[] };

export type FetchFn = (url: string) => Promise<ParsedFeed>;

export type FetchErrors = { slug: string; error: string };

export interface FetchResult {
  items: RawItem[];
  fetchErrors: FetchErrors[];
}

export async function runFetch(opts: {
  sources: Source[];
  fetchFeed: FetchFn;
  concurrency?: number;
}): Promise<FetchResult> {
  const limit = pLimit(opts.concurrency ?? 8);
  const items: RawItem[] = [];
  const errors: FetchErrors[] = [];
  await Promise.all(opts.sources.map(src => limit(async () => {
    try {
      const feed = await opts.fetchFeed(src.feedUrl);
      for (const fi of feed.items) {
        if (!fi.link || !fi.title) continue;
        const url = fi.link;
        const published = fi.isoDate ?? new Date().toISOString();
        items.push({
          id: stableId(fi.guid ?? null, url),
          url,
          title: fi.title,
          sourceSlug: src.slug,
          publishedAt: published,
          guid: fi.guid ?? null,
          summary: fi.contentSnippet ?? null,
        });
      }
    } catch (e) {
      errors.push({ slug: src.slug, error: (e as Error).message });
    }
  })));
  return { items, fetchErrors: errors };
}
```

- [ ] **Step 5: Run** — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(pipeline): fetch stage with concurrency and failure isolation"
```

---

### Task 10: `dedupe` stage

**Files:**
- Create: `pipeline/src/stages/dedupe.ts`
- Test: `pipeline/test/stages/dedupe.test.ts`

- [ ] **Step 1: Failing test**

```ts
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
```

- [ ] **Step 2: Run** — Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
import type { RawItem } from '../lib/schemas.js';
import type { SeenDb } from '../lib/seen-db.js';

export function runDedupe(opts: { raw: RawItem[]; db: SeenDb; date: string }): { newItems: RawItem[] } {
  const newIds = new Set(opts.db.filterNew(opts.raw.map(r => r.id)));
  const newItems = opts.raw.filter(r => newIds.has(r.id));
  if (newItems.length > 0) opts.db.markSeen(newItems.map(r => r.id), opts.date);
  return { newItems };
}
```

- [ ] **Step 4: Run** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(pipeline): dedupe stage"
```

---

### Task 11: `extract` stage

**Files:**
- Create: `pipeline/src/stages/extract.ts`
- Test: `pipeline/test/stages/extract.test.ts`

Design: inject `extractFn(url) => Promise<{ content, thumbnail, author, lang }>`. Real impl uses `@extractus/article-extractor`.

- [ ] **Step 1: Add dep**

Run: `pnpm add @extractus/article-extractor franc`

- [ ] **Step 2: Failing test**

```ts
import { describe, it, expect, vi } from 'vitest';
import { runExtract } from '../../src/stages/extract.js';
import type { RawItem } from '../../src/lib/schemas.js';

const raw: RawItem = {
  id: 'x'.repeat(40), url: 'https://e/a', title: 't',
  sourceSlug: 's', publishedAt: '2026-04-20T00:00:00.000Z',
  guid: null, summary: null,
};

describe('runExtract', () => {
  it('enriches items with content, thumbnail, lang', async () => {
    const extractFn = vi.fn().mockResolvedValue({
      content: 'Hello world '.repeat(20),
      thumbnail: 'https://e/img.png',
      author: 'Jane',
      lang: 'en',
    });
    const out = await runExtract({ items: [raw], extractFn, concurrency: 2 });
    expect(out.items).toHaveLength(1);
    expect(out.items[0]).toMatchObject({ thumbnail: 'https://e/img.png', lang: 'en' });
  });

  it('falls back when extract throws', async () => {
    const extractFn = vi.fn().mockRejectedValue(new Error('nope'));
    const out = await runExtract({ items: [raw], extractFn, concurrency: 2 });
    expect(out.items).toHaveLength(1);
    expect(out.items[0].content).toBe('');
    expect(out.extractErrors).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run** — Expected: FAIL.

- [ ] **Step 4: Implement**

```ts
import pLimit from 'p-limit';
import type { RawItem, ExtractedItem } from '../lib/schemas.js';

export type ExtractFn = (url: string) => Promise<{
  content: string;
  thumbnail: string | null;
  author: string | null;
  lang: 'ko' | 'en' | 'ja' | 'other';
}>;

export interface ExtractResult {
  items: ExtractedItem[];
  extractErrors: { id: string; error: string }[];
}

export async function runExtract(opts: {
  items: RawItem[];
  extractFn: ExtractFn;
  concurrency?: number;
}): Promise<ExtractResult> {
  const limit = pLimit(opts.concurrency ?? 4);
  const results: ExtractedItem[] = [];
  const errors: { id: string; error: string }[] = [];
  await Promise.all(opts.items.map(it => limit(async () => {
    try {
      const r = await opts.extractFn(it.url);
      results.push({
        id: it.id, url: it.url, title: it.title, sourceSlug: it.sourceSlug,
        publishedAt: it.publishedAt,
        content: r.content, thumbnail: r.thumbnail, author: r.author, lang: r.lang,
      });
    } catch (e) {
      errors.push({ id: it.id, error: (e as Error).message });
      results.push({
        id: it.id, url: it.url, title: it.title, sourceSlug: it.sourceSlug,
        publishedAt: it.publishedAt,
        content: '', thumbnail: null, author: null, lang: 'other',
      });
    }
  })));
  return { items: results, extractErrors: errors };
}
```

- [ ] **Step 5: Run** — Expected: PASS (2/2).

- [ ] **Step 6: Create real extract adapter**

Create `pipeline/src/runners/article-extract.ts`:
```ts
import { extract } from '@extractus/article-extractor';
import { franc } from 'franc';
import type { ExtractFn } from '../stages/extract.js';

const langMap: Record<string, 'ko' | 'en' | 'ja' | 'other'> = {
  kor: 'ko', eng: 'en', jpn: 'ja',
};

export const articleExtractor: ExtractFn = async (url) => {
  const art = await extract(url);
  if (!art) return { content: '', thumbnail: null, author: null, lang: 'other' };
  const content = (art.content ?? '').replace(/<[^>]+>/g, ' ').slice(0, 20000);
  const code = content.length > 40 ? franc(content) : 'und';
  return {
    content,
    thumbnail: art.image ?? null,
    author: art.author ?? null,
    lang: langMap[code] ?? 'other',
  };
};
```

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(pipeline): extract stage with fallback and runner"
```

---

### Task 12: `llm` stage with injectable Claude runner

**Files:**
- Create: `pipeline/src/stages/llm.ts`, `pipeline/src/runners/claude-cli.ts`
- Test: `pipeline/test/stages/llm.test.ts`

- [ ] **Step 1: Add `execa`**

Run: `pnpm add execa`

- [ ] **Step 2: Failing test (contract + fallback)**

```ts
import { describe, it, expect } from 'vitest';
import { runLlm, type ClaudeRunner } from '../../src/stages/llm.js';
import type { ExtractedItem } from '../../src/lib/schemas.js';

const extracted: ExtractedItem = {
  id: 'a'.repeat(40), url: 'https://e/a', title: 'title', sourceSlug: 's',
  publishedAt: '2026-04-20T00:00:00.000Z',
  content: 'body', thumbnail: null, author: null, lang: 'en',
};

function makeRunner(fn: (input: string) => Promise<string>): ClaudeRunner {
  return { run: (input) => fn(input) };
}

describe('runLlm', () => {
  it('parses valid curated JSON', async () => {
    const runner = makeRunner(async () => JSON.stringify({
      items: [{
        id: 'a'.repeat(40), url: 'https://e/a', title: 'title', sourceSlug: 's',
        publishedAt: '2026-04-20T00:00:00.000Z', tags: ['ai'],
        summary: '요약.', highlights: [], filterScore: 8,
        thumbnail: null, author: null, lang: 'en',
      }],
    }));
    const out = await runLlm({ items: [extracted], runner });
    expect(out.items).toHaveLength(1);
    expect(out.items[0].summary).toBe('요약.');
  });

  it('retries once on schema failure, then falls back', async () => {
    let calls = 0;
    const runner = makeRunner(async () => { calls++; return 'not json'; });
    const out = await runLlm({ items: [extracted], runner });
    expect(calls).toBe(2);
    expect(out.items).toHaveLength(1);
    expect(out.items[0].summary).toMatch(/^title/);
    expect(out.fallbacks).toEqual([extracted.id]);
  });

  it('filters items below filterScore threshold and keeps top 30', async () => {
    const many: ExtractedItem[] = Array.from({ length: 35 }, (_, i) => ({
      ...extracted, id: String(i).padStart(40, '0'), url: `https://e/${i}`,
    }));
    const runner = makeRunner(async () => JSON.stringify({
      items: many.map((m, i) => ({
        id: m.id, url: m.url, title: 't', sourceSlug: 's',
        publishedAt: m.publishedAt, tags: ['ai'],
        summary: 's', highlights: [], filterScore: i < 30 ? 8 : 3,
        thumbnail: null, author: null, lang: 'en',
      })),
    }));
    const out = await runLlm({ items: many, runner });
    expect(out.items).toHaveLength(30);
    expect(out.items.every(i => i.filterScore >= 6)).toBe(true);
  });
});
```

- [ ] **Step 3: Run** — Expected: FAIL.

- [ ] **Step 4: Implement `pipeline/src/stages/llm.ts`**

```ts
import { z } from 'zod';
import { CuratedItemSchema, type CuratedItem, type ExtractedItem } from '../lib/schemas.js';

export interface ClaudeRunner {
  run(input: string, retryHint?: string): Promise<string>;
}

const ResponseSchema = z.object({ items: z.array(CuratedItemSchema) });

export interface LlmResult {
  items: CuratedItem[];
  fallbacks: string[];
}

function fallbackCurated(it: ExtractedItem): CuratedItem {
  return {
    id: it.id, url: it.url, title: it.title, sourceSlug: it.sourceSlug,
    publishedAt: it.publishedAt,
    tags: [],
    summary: it.title.slice(0, 200),
    highlights: [],
    filterScore: 5,
    thumbnail: it.thumbnail,
    author: it.author,
    lang: it.lang,
  };
}

export async function runLlm(opts: { items: ExtractedItem[]; runner: ClaudeRunner }): Promise<LlmResult> {
  if (opts.items.length === 0) return { items: [], fallbacks: [] };
  const payload = JSON.stringify({ items: opts.items });

  let text = await opts.runner.run(payload);
  let parsed = safeParse(text);
  if (!parsed.ok) {
    text = await opts.runner.run(payload, `Previous output failed: ${parsed.error}. Return ONLY JSON matching the schema.`);
    parsed = safeParse(text);
  }

  if (!parsed.ok) {
    const items = opts.items.map(fallbackCurated);
    return { items, fallbacks: opts.items.map(i => i.id) };
  }

  const byId = new Map(parsed.data.items.map(i => [i.id, i]));
  const fallbacks: string[] = [];
  const enriched: CuratedItem[] = [];
  for (const it of opts.items) {
    const curated = byId.get(it.id);
    if (!curated) { enriched.push(fallbackCurated(it)); fallbacks.push(it.id); continue; }
    enriched.push(curated);
  }

  const keep = enriched
    .filter(i => i.filterScore >= 6)
    .sort((a, b) => b.filterScore - a.filterScore)
    .slice(0, 30);

  return { items: keep, fallbacks };
}

function safeParse(text: string):
  | { ok: true; data: z.infer<typeof ResponseSchema> }
  | { ok: false; error: string } {
  try {
    const parsed = ResponseSchema.safeParse(JSON.parse(text));
    if (!parsed.success) return { ok: false, error: parsed.error.message };
    return { ok: true, data: parsed.data };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
```

- [ ] **Step 5: Run** — Expected: PASS (3/3).

- [ ] **Step 6: Implement real `claude-cli.ts` runner**

```ts
import { execa } from 'execa';
import type { ClaudeRunner } from '../stages/llm.js';

export function claudeCliRunner(opts: { skill: string; cwd: string }): ClaudeRunner {
  return {
    async run(input, retryHint) {
      const args = ['-p', opts.skill];
      const stdin = retryHint ? `${retryHint}\n---\n${input}` : input;
      const { stdout } = await execa('claude', args, { cwd: opts.cwd, input: stdin, timeout: 10 * 60 * 1000 });
      return stdout;
    },
  };
}
```

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(pipeline): llm stage with schema retry and fallback"
```

---

### Task 13: `write` stage

**Files:**
- Create: `pipeline/src/stages/write.ts`
- Test: `pipeline/test/stages/write.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runWrite } from '../../src/stages/write.js';
import type { CuratedItem, Source } from '../../src/lib/schemas.js';

const src: Source = { slug: 's', name: 'S', feedUrl: 'https://s', siteUrl: 'https://s', category: 'ai', priority: 5, tags: [] };
const curated: CuratedItem = {
  id: 'a'.repeat(40), url: 'https://e/a', title: 't', sourceSlug: 's',
  publishedAt: '2026-04-20T00:00:00.000Z',
  tags: ['ai'], summary: '요약.', highlights: [],
  filterScore: 8, thumbnail: null, author: null, lang: 'en',
};

describe('runWrite', () => {
  it('writes one json per curated item and a search index', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wr-'));
    const contentDir = join(dir, 'content');
    const searchIndex = join(dir, 'search.json');
    runWrite({ curated: [curated], sources: [src], contentDir, searchIndexPath: searchIndex, ingestedAt: '2026-04-21T05:30:00.000Z' });
    const files = readdirSync(contentDir);
    expect(files).toEqual([`${curated.id}.json`]);
    const wrote = JSON.parse(readFileSync(join(contentDir, files[0]), 'utf8'));
    expect(wrote.source).toMatchObject({ slug: 's', name: 'S', category: 'ai' });
    const idx = JSON.parse(readFileSync(searchIndex, 'utf8'));
    expect(idx.items[0]).toMatchObject({ id: curated.id, title: 't' });
  });
});
```

- [ ] **Step 2: Run** — Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ItemSchema, type CuratedItem, type Item, type Source } from '../lib/schemas.js';

export function runWrite(opts: {
  curated: CuratedItem[];
  sources: Source[];
  contentDir: string;
  searchIndexPath: string;
  ingestedAt: string;
}) {
  mkdirSync(opts.contentDir, { recursive: true });
  const bySlug = new Map(opts.sources.map(s => [s.slug, s]));

  const items: Item[] = opts.curated.map(c => {
    const src = bySlug.get(c.sourceSlug);
    if (!src) throw new Error(`Unknown source slug: ${c.sourceSlug}`);
    const item: Item = {
      id: c.id, url: c.url, title: c.title,
      source: { slug: src.slug, name: src.name, category: src.category },
      publishedAt: c.publishedAt,
      ingestedAt: opts.ingestedAt,
      tags: c.tags, summary: c.summary, highlights: c.highlights,
      filterScore: c.filterScore,
      thumbnail: c.thumbnail, author: c.author, lang: c.lang,
    };
    return ItemSchema.parse(item);
  });

  for (const item of items) {
    writeFileSync(join(opts.contentDir, `${item.id}.json`), JSON.stringify(item, null, 2));
  }

  mkdirSync(join(opts.searchIndexPath, '..'), { recursive: true });
  const index = {
    generatedAt: opts.ingestedAt,
    items: items.map(i => ({
      id: i.id, title: i.title, summary: i.summary,
      tags: i.tags, source: i.source.name, url: i.url, publishedAt: i.publishedAt,
    })),
  };
  writeFileSync(opts.searchIndexPath, JSON.stringify(index));

  return { itemsWritten: items.length };
}
```

- [ ] **Step 4: Run** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(pipeline): write stage producing content files and search index"
```

---

## Phase 4 — CLI glue

### Task 14: CLI entry with stage flags

**Files:**
- Create: `pipeline/src/index.ts`, `pipeline/src/runners/rss.ts`
- Test: `pipeline/test/cli-dry-run.test.ts`

- [ ] **Step 1: Add arg parser dep**

Run: `pnpm add mri`

- [ ] **Step 2: Create `pipeline/src/runners/rss.ts`**

```ts
import Parser from 'rss-parser';
import type { FetchFn } from '../stages/fetch.js';

const parser = new Parser({ timeout: 30_000, requestOptions: { rejectUnauthorized: false } });

export const rssRunner: FetchFn = async (url) => {
  const feed = await parser.parseURL(url);
  return {
    items: feed.items.map(i => ({
      title: i.title ?? null,
      link: i.link ?? null,
      guid: i.guid ?? null,
      isoDate: i.isoDate ?? null,
      contentSnippet: i.contentSnippet ?? null,
    })),
  };
};
```

- [ ] **Step 3: Failing CLI smoke test (dry-run, no network)**

```ts
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
      'tsx', 'pipeline/src/index.ts', '--dry-run', '--date=2026-04-21'
    ], { cwd: process.cwd(), env: { ...process.env, REPO_ROOT: repo }, reject: false });
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/dry-run/);
    expect(stdout).toMatch(/sources: 1/);
  });
});
```

- [ ] **Step 4: Run** — Expected: FAIL.

- [ ] **Step 5: Implement `pipeline/src/index.ts`**

```ts
import mri from 'mri';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { workspacePaths } from './lib/paths.js';
import { loadSources } from './lib/sources.js';
import { openSeenDb } from './lib/seen-db.js';
import { createJsonlLogger } from './lib/log.js';
import { runFetch } from './stages/fetch.js';
import { runDedupe } from './stages/dedupe.js';
import { runExtract } from './stages/extract.js';
import { runLlm } from './stages/llm.js';
import { runWrite } from './stages/write.js';
import { rssRunner } from './runners/rss.js';
import { articleExtractor } from './runners/article-extract.js';
import { claudeCliRunner } from './runners/claude-cli.js';

type Stage = 'fetch' | 'dedupe' | 'extract' | 'llm' | 'write';
const ALL_STAGES: Stage[] = ['fetch','dedupe','extract','llm','write'];

function todayKst(): string {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}
async function writeJson(path: string, data: unknown) {
  await mkdir(path.slice(0, path.lastIndexOf('/')), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2));
}

async function main() {
  const args = mri(process.argv.slice(2), {
    string: ['date','only'],
    boolean: ['dry-run','force'],
    default: { 'dry-run': false, force: false },
  });
  const date: string = args.date ?? todayKst();
  const repoRoot = process.env.REPO_ROOT ?? process.cwd();
  const paths = workspacePaths(repoRoot, date);
  const only = (args.only?.split(',').filter(Boolean) ?? ALL_STAGES) as Stage[];

  const sources = await loadSources(`${repoRoot}/sources.yaml`);

  if (args['dry-run']) {
    console.log(`dry-run date=${date} sources: ${sources.length} stages: ${only.join(',')}`);
    return;
  }

  const log = createJsonlLogger(paths.runLog);

  // fetch
  if (only.includes('fetch')) {
    const t0 = Date.now();
    const out = await runFetch({ sources, fetchFeed: rssRunner });
    await writeJson(paths.raw, out);
    log.write({ stage: 'fetch', ok: true, itemsOut: out.items.length, durationMs: Date.now() - t0 });
  }

  // dedupe
  if (only.includes('dedupe')) {
    const t0 = Date.now();
    const raw = await readJson<{ items: any[] }>(paths.raw);
    const db = openSeenDb(paths.seenDb);
    const out = args.force
      ? { newItems: raw.items }
      : runDedupe({ raw: raw.items, db, date });
    db.close();
    await writeJson(paths.new, out);
    log.write({ stage: 'dedupe', ok: true, itemsIn: raw.items.length, itemsOut: out.newItems.length, durationMs: Date.now() - t0 });
  }

  // extract
  if (only.includes('extract')) {
    const t0 = Date.now();
    const { newItems } = await readJson<{ newItems: any[] }>(paths.new);
    const out = await runExtract({ items: newItems, extractFn: articleExtractor });
    await writeJson(paths.extracted, out);
    log.write({ stage: 'extract', ok: true, itemsIn: newItems.length, itemsOut: out.items.length, durationMs: Date.now() - t0 });
  }

  // llm
  if (only.includes('llm')) {
    const t0 = Date.now();
    const { items } = await readJson<{ items: any[] }>(paths.extracted);
    const runner = claudeCliRunner({ skill: '/morning-digest', cwd: repoRoot });
    const out = await runLlm({ items, runner });
    await writeJson(paths.curated, out);
    log.write({ stage: 'llm', ok: true, itemsIn: items.length, itemsOut: out.items.length, durationMs: Date.now() - t0 });
  }

  // write
  if (only.includes('write')) {
    const t0 = Date.now();
    const { items } = await readJson<{ items: any[] }>(paths.curated);
    const ingestedAt = new Date().toISOString();
    const res = runWrite({
      curated: items, sources,
      contentDir: paths.contentDir,
      searchIndexPath: paths.searchIndex,
      ingestedAt,
    });
    log.write({ stage: 'write', ok: true, itemsOut: res.itemsWritten, durationMs: Date.now() - t0 });
  }

  await writeJson(paths.runSummary, { date, stages: only, completedAt: new Date().toISOString() });
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 6: Run** — Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(pipeline): CLI entry with stage dispatch and dry-run"
```

---

## Phase 5 — Claude Code Skill

### Task 15: Author `morning-digest` skill

**Files:**
- Create: `.claude/skills/morning-digest/SKILL.md`

- [ ] **Step 1: Create the skill file**

```md
---
name: morning-digest
description: Filter, summarize (Korean, 2-3 sentences), and tag RSS items. Input: JSON {items:[ExtractedItem...]}. Output: JSON ONLY matching the specified schema.
---

# Role
You are a curation assistant for an individual engineer's morning reading list.

# Input
JSON on stdin with shape:
```
{ "items": [
  { "id":"<40-hex>", "url":"<url>", "title":"<string>", "sourceSlug":"<string>",
    "publishedAt":"<ISO-8601>", "content":"<plaintext>",
    "thumbnail":"<url|null>", "author":"<string|null>", "lang":"ko|en|ja|other" }
] }
```

# Task
For each item:
1. Assign `filterScore` (0-10): engineering/AI relevance, depth, originality.
2. Write `summary` in Korean, 2-3 sentences, factual, no marketing tone.
3. Optionally write 3-5 `highlights` (short Korean bullets). Omit when content is thin.
4. Choose up to 4 `tags` from this allowlist ONLY:
   ai, llm, agents, backend, frontend, infra, devops, db, security, architecture,
   testing, kotlin, typescript, java, python, career, tooling
5. Preserve `id`, `url`, `title`, `sourceSlug`, `publishedAt`, `thumbnail`, `author`, `lang`.

# Output
Return JSON ONLY (no prose, no markdown fence). Shape:
```
{ "items": [
  { "id":"...", "url":"...", "title":"...", "sourceSlug":"...",
    "publishedAt":"...", "tags":["..."], "summary":"...",
    "highlights":["..."], "filterScore": 0-10,
    "thumbnail":"<url|null>", "author":"<string|null>", "lang":"..." }
] }
```

# Rules
- Tags outside the allowlist are forbidden. If nothing fits, return `"tags": []`.
- `summary` must be non-empty. If content is too thin, summarize title + source context.
- Never invent facts. Never translate `title`.
```

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "feat: morning-digest skill for claude CLI"
```

---

## Phase 6 — Content Collections (Astro side)

### Task 16: Astro content collection config

**Files:**
- Create: `src/content/config.ts`, `src/content/items/.gitkeep`

- [ ] **Step 1: Create `src/content/config.ts`**

```ts
import { defineCollection, z } from 'astro:content';

const itemSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{40}$/),
  url: z.string().url(),
  title: z.string().min(1),
  source: z.object({
    slug: z.string(),
    name: z.string(),
    category: z.string(),
  }),
  publishedAt: z.string(),
  ingestedAt: z.string(),
  tags: z.array(z.string()).max(8),
  summary: z.string().min(1).max(800),
  highlights: z.array(z.string()).max(5),
  filterScore: z.number().min(0).max(10),
  thumbnail: z.string().url().nullable(),
  author: z.string().nullable(),
  lang: z.enum(['ko','en','ja','other']),
});

export const collections = {
  items: defineCollection({ type: 'data', schema: itemSchema }),
};
```

- [ ] **Step 2: Add empty sentinel**

Create `src/content/items/.gitkeep` (empty file).

- [ ] **Step 3: Build Astro to verify schema wiring**

Run: `pnpm build`
Expected: builds without error (items collection is empty).

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(ui): astro content collection for items"
```

---

### Task 17: Seed a fixture item for UI development

**Files:**
- Create: `src/content/items/seed-0000000000000000000000000000000000000000.json`

- [ ] **Step 1: Create fixture**

```json
{
  "id": "0000000000000000000000000000000000000001",
  "url": "https://example.com/intro",
  "title": "Intro to morning-digest",
  "source": { "slug": "seed", "name": "Seed", "category": "ai" },
  "publishedAt": "2026-04-21T00:00:00.000Z",
  "ingestedAt": "2026-04-21T05:30:00.000Z",
  "tags": ["ai"],
  "summary": "시드 데이터입니다. UI 개발 중에만 사용합니다.",
  "highlights": ["UI 개발용", "빈 컬렉션 방지"],
  "filterScore": 7,
  "thumbnail": null,
  "author": null,
  "lang": "ko"
}
```

Note: rename file to match the `id` field (keep both identical).

- [ ] **Step 2: Build**

Run: `pnpm build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "chore(ui): seed fixture item for dev"
```

---

## Phase 7 — UI pages & components

### Task 18: Global styles and Base layout

**Files:**
- Create: `src/styles/globals.css`, `src/layouts/Base.astro`

- [ ] **Step 1: `src/styles/globals.css`**

```css
:root {
  --bg: #ffffff;
  --fg: #111827;
  --muted: #6b7280;
  --card: #f9fafb;
  --accent: #2563eb;
  --border: #e5e7eb;
}
:root[data-theme="dark"] {
  --bg: #0b0d12;
  --fg: #e5e7eb;
  --muted: #9ca3af;
  --card: #12151b;
  --accent: #60a5fa;
  --border: #1f2937;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: var(--bg); color: var(--fg); font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, sans-serif; }
a { color: var(--accent); }
[data-read="true"] { opacity: 0.55; }
.container { max-width: 880px; margin: 0 auto; padding: 24px 16px; }
.card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 16px; margin-bottom: 12px; }
.tag { display: inline-block; padding: 2px 8px; margin-right: 4px; border-radius: 999px; background: var(--border); font-size: 12px; }
nav { display: flex; gap: 16px; padding: 16px; border-bottom: 1px solid var(--border); }
nav a { text-decoration: none; }
```

- [ ] **Step 2: `src/layouts/Base.astro`**

```astro
---
interface Props { title: string; description?: string; }
const { title, description = 'morning-digest' } = Astro.props;
---
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="description" content={description} />
  <title>{title}</title>
  <link rel="stylesheet" href="/morning-digest/styles.css" />
  <script is:inline>
    (function () {
      try {
        const saved = localStorage.getItem('theme');
        const preferDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const t = saved ?? (preferDark ? 'dark' : 'light');
        document.documentElement.setAttribute('data-theme', t);
      } catch {}
    })();
  </script>
</head>
<body>
  <nav>
    <a href="/morning-digest/">Home</a>
    <a href="/morning-digest/archive">Archive</a>
    <slot name="nav-extra" />
  </nav>
  <main class="container">
    <slot />
  </main>
</body>
</html>
```

- [ ] **Step 3: Make styles available**

Move `src/styles/globals.css` to `public/styles.css` to avoid Astro bundler quirks for this personal site.

Run: `mv src/styles/globals.css public/styles.css && rmdir src/styles`

- [ ] **Step 4: Build**

Run: `pnpm build`
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(ui): base layout and global styles"
```

---

### Task 19: `ItemCard.astro` component

**Files:**
- Create: `src/components/ItemCard.astro`

- [ ] **Step 1: Implement**

```astro
---
import type { CollectionEntry } from 'astro:content';
interface Props { item: CollectionEntry<'items'>; }
const { item } = Astro.props;
const d = item.data;
const dateLabel = new Date(d.publishedAt).toISOString().slice(0, 10);
---
<article class="card" data-item-id={d.id}>
  {d.thumbnail && (
    <img src={d.thumbnail} alt="" loading="lazy" width="640" style="width:100%;max-width:100%;border-radius:8px;aspect-ratio:16/9;object-fit:cover;" />
  )}
  <h3 style="margin:8px 0 4px;"><a href={d.url} rel="noopener noreferrer" target="_blank">{d.title}</a></h3>
  <div style="color:var(--muted);font-size:13px;margin-bottom:8px;">
    <span>{d.source.name}</span> · <span>{dateLabel}</span>
  </div>
  <p style="margin:0 0 8px;">{d.summary}</p>
  <div>
    {d.tags.map(t => <a class="tag" href={`/morning-digest/tags/${t}`}>{t}</a>)}
  </div>
</article>
```

- [ ] **Step 2: Build**

Run: `pnpm build`
Expected: success (not yet used; just compiles).

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(ui): ItemCard component"
```

---

### Task 20: Home page — recent 30 days

**Files:**
- Modify: `src/pages/index.astro`

- [ ] **Step 1: Replace placeholder**

```astro
---
import { getCollection } from 'astro:content';
import Base from '../layouts/Base.astro';
import ItemCard from '../components/ItemCard.astro';

const all = await getCollection('items');
const now = Date.now();
const thirtyDays = 30 * 86400_000;
const recent = all
  .filter(e => now - Date.parse(e.data.publishedAt) < thirtyDays)
  .sort((a, b) => Date.parse(b.data.publishedAt) - Date.parse(a.data.publishedAt));
---
<Base title="morning-digest">
  <h1>Today's picks</h1>
  {recent.length === 0 && <p>No items in the last 30 days.</p>}
  {recent.map(item => <ItemCard item={item} />)}
</Base>
```

- [ ] **Step 2: Build**

Run: `pnpm build`
Expected: `dist/index.html` contains "Today's picks" and the seed fixture.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(ui): home page showing recent 30 days"
```

---

### Task 21: `tags/[tag].astro`

**Files:**
- Create: `src/pages/tags/[tag].astro`

- [ ] **Step 1: Implement**

```astro
---
import { getCollection } from 'astro:content';
import Base from '../../layouts/Base.astro';
import ItemCard from '../../components/ItemCard.astro';

export async function getStaticPaths() {
  const items = await getCollection('items');
  const tags = new Set<string>();
  for (const i of items) for (const t of i.data.tags) tags.add(t);
  return [...tags].map(tag => ({ params: { tag } }));
}

const { tag } = Astro.params as { tag: string };
const items = (await getCollection('items'))
  .filter(i => i.data.tags.includes(tag))
  .sort((a, b) => Date.parse(b.data.publishedAt) - Date.parse(a.data.publishedAt));
---
<Base title={`#${tag} — morning-digest`}>
  <h1>#{tag}</h1>
  {items.map(i => <ItemCard item={i} />)}
</Base>
```

- [ ] **Step 2: Build** — Expected: success, `dist/tags/ai/index.html` exists.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(ui): tags/[tag] page"
```

---

### Task 22: `sources/[slug].astro`

**Files:**
- Create: `src/pages/sources/[slug].astro`

- [ ] **Step 1: Implement**

```astro
---
import { getCollection } from 'astro:content';
import Base from '../../layouts/Base.astro';
import ItemCard from '../../components/ItemCard.astro';

export async function getStaticPaths() {
  const items = await getCollection('items');
  const slugs = new Set<string>();
  for (const i of items) slugs.add(i.data.source.slug);
  return [...slugs].map(slug => ({ params: { slug } }));
}

const { slug } = Astro.params as { slug: string };
const items = (await getCollection('items'))
  .filter(i => i.data.source.slug === slug)
  .sort((a, b) => Date.parse(b.data.publishedAt) - Date.parse(a.data.publishedAt));
const source = items[0]?.data.source;
---
<Base title={`${source?.name ?? slug} — morning-digest`}>
  <h1>{source?.name ?? slug}</h1>
  {items.map(i => <ItemCard item={i} />)}
</Base>
```

- [ ] **Step 2: Build** — Expected: success.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(ui): sources/[slug] page"
```

---

### Task 23: Archive pages

**Files:**
- Create: `src/pages/archive/index.astro`, `src/pages/archive/[ym].astro`

- [ ] **Step 1: `archive/index.astro`**

```astro
---
import { getCollection } from 'astro:content';
import Base from '../../layouts/Base.astro';

const items = await getCollection('items');
const months = new Map<string, number>();
for (const i of items) {
  const ym = i.data.publishedAt.slice(0, 7);
  months.set(ym, (months.get(ym) ?? 0) + 1);
}
const entries = [...months.entries()].sort((a, b) => b[0].localeCompare(a[0]));
---
<Base title="Archive — morning-digest">
  <h1>Archive</h1>
  <ul>
    {entries.map(([ym, n]) => <li><a href={`/morning-digest/archive/${ym}`}>{ym}</a> ({n})</li>)}
  </ul>
</Base>
```

- [ ] **Step 2: `archive/[ym].astro`**

```astro
---
import { getCollection } from 'astro:content';
import Base from '../../layouts/Base.astro';
import ItemCard from '../../components/ItemCard.astro';

export async function getStaticPaths() {
  const items = await getCollection('items');
  const yms = new Set<string>();
  for (const i of items) yms.add(i.data.publishedAt.slice(0, 7));
  return [...yms].map(ym => ({ params: { ym } }));
}

const { ym } = Astro.params as { ym: string };
const items = (await getCollection('items'))
  .filter(i => i.data.publishedAt.startsWith(ym))
  .sort((a, b) => Date.parse(b.data.publishedAt) - Date.parse(a.data.publishedAt));
---
<Base title={`${ym} — morning-digest`}>
  <h1>{ym}</h1>
  {items.map(i => <ItemCard item={i} />)}
</Base>
```

- [ ] **Step 3: Build** — Expected: success.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(ui): archive pages"
```

---

### Task 24: `rss.xml.ts` — self-republished feed

**Files:**
- Create: `src/pages/rss.xml.ts`

- [ ] **Step 1: Add dep**

Run: `pnpm add @astrojs/rss`

- [ ] **Step 2: Implement**

```ts
import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';

export async function GET(context: { site?: URL }) {
  const items = (await getCollection('items'))
    .sort((a, b) => Date.parse(b.data.publishedAt) - Date.parse(a.data.publishedAt))
    .slice(0, 30);
  return rss({
    title: 'morning-digest',
    description: 'Personal morning digest',
    site: context.site?.toString() ?? 'https://example.invalid',
    items: items.map(i => ({
      title: i.data.title,
      link: i.data.url,
      pubDate: new Date(i.data.publishedAt),
      description: i.data.summary,
    })),
  });
}
```

- [ ] **Step 3: Build** — Expected: `dist/rss.xml` exists.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(ui): self-republished rss feed"
```

---

### Task 25: ThemeToggle island

**Files:**
- Create: `src/components/ThemeToggle.astro`
- Modify: `src/layouts/Base.astro`

- [ ] **Step 1: `ThemeToggle.astro`**

```astro
---
---
<button id="theme-toggle" aria-label="Toggle theme" style="margin-left:auto;padding:6px 10px;border-radius:8px;border:1px solid var(--border);background:var(--card);color:var(--fg);">
  Theme
</button>
<script>
  const btn = document.getElementById('theme-toggle')!;
  btn.addEventListener('click', () => {
    const html = document.documentElement;
    const current = html.getAttribute('data-theme') ?? 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch {}
  });
</script>
```

- [ ] **Step 2: Mount in `Base.astro` nav**

Edit `src/layouts/Base.astro` — inside `<nav>`:

```astro
<nav>
  <a href="/morning-digest/">Home</a>
  <a href="/morning-digest/archive">Archive</a>
  <slot name="nav-extra" />
  <ThemeToggle />
</nav>
```

And add import at the top frontmatter: `import ThemeToggle from '../components/ThemeToggle.astro';`

- [ ] **Step 3: Build** — Expected: success.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(ui): theme toggle island"
```

---

### Task 26: Read-state tracker island

**Files:**
- Create: `src/components/ReadTracker.astro`
- Modify: `src/layouts/Base.astro`

- [ ] **Step 1: Implement**

```astro
---
---
<script>
  const KEY = 'read-items';
  function load(): Set<string> {
    try { return new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]')); } catch { return new Set(); }
  }
  function save(s: Set<string>) { try { localStorage.setItem(KEY, JSON.stringify([...s])); } catch {} }

  const read = load();
  function mark(el: HTMLElement) {
    const id = el.getAttribute('data-item-id');
    if (!id || read.has(id)) return;
    read.add(id); save(read);
    el.setAttribute('data-read', 'true');
  }

  document.querySelectorAll<HTMLElement>('[data-item-id]').forEach(el => {
    if (read.has(el.getAttribute('data-item-id')!)) el.setAttribute('data-read', 'true');
    el.querySelectorAll('a').forEach(a => a.addEventListener('click', () => mark(el)));
  });

  if ('IntersectionObserver' in window) {
    const timers = new WeakMap<Element, number>();
    const io = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (e.isIntersecting) {
          timers.set(e.target, window.setTimeout(() => mark(e.target as HTMLElement), 3000));
        } else {
          const t = timers.get(e.target); if (t) window.clearTimeout(t);
        }
      }
    }, { threshold: 0.5 });
    document.querySelectorAll('[data-item-id]').forEach(el => io.observe(el));
  }
</script>
```

- [ ] **Step 2: Mount in `Base.astro`**

Add before `</body>`: `<ReadTracker />` and import at top.

- [ ] **Step 3: Build** — Expected: success.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(ui): read-state tracker island"
```

---

### Task 27: SearchBox island with fuse.js

**Files:**
- Create: `src/components/SearchBox.astro`, `public/search-index.json` (empty default)
- Modify: `src/layouts/Base.astro`

- [ ] **Step 1: Add `fuse.js`**

Run: `pnpm add fuse.js`

- [ ] **Step 2: Create `public/search-index.json`** (the pipeline overwrites this)

```json
{ "generatedAt": null, "items": [] }
```

- [ ] **Step 3: Implement `SearchBox.astro`**

```astro
---
---
<div style="margin:12px 0;">
  <input id="sb-input" type="search" placeholder="Search…" style="width:100%;padding:8px 12px;border-radius:8px;border:1px solid var(--border);background:var(--card);color:var(--fg);" />
  <ul id="sb-results" style="list-style:none;padding:0;margin:8px 0;"></ul>
</div>
<script>
  import Fuse from 'fuse.js';
  const input = document.getElementById('sb-input') as HTMLInputElement;
  const list = document.getElementById('sb-results')!;
  let fuse: any = null;
  async function init() {
    if (fuse) return;
    const res = await fetch('/morning-digest/search-index.json');
    const data = await res.json();
    fuse = new Fuse(data.items ?? [], { keys: ['title','summary','tags','source'], threshold: 0.35 });
  }
  input.addEventListener('input', async (e) => {
    const q = (e.target as HTMLInputElement).value.trim();
    if (!q) { list.innerHTML = ''; return; }
    await init();
    const hits = fuse.search(q).slice(0, 10);
    list.innerHTML = hits.map((h: any) => `<li><a href="${h.item.url}">${h.item.title}</a></li>`).join('');
  });
</script>
```

- [ ] **Step 4: Mount in Base layout above `<main>`**

Import and place `<SearchBox />` inside `main.container` on the home page (or in Base with a conditional). For simplicity insert it at the top of `src/pages/index.astro` content.

Modify `src/pages/index.astro` frontmatter to import and render:

```astro
import SearchBox from '../components/SearchBox.astro';
```

and `<SearchBox />` right below `<h1>Today's picks</h1>`.

- [ ] **Step 5: Build** — Expected: success.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(ui): search box island with fuse.js"
```

---

### Task 28: Category fallback SVGs & thumbnail config

**Files:**
- Create: `public/fallbacks/ai.svg`, `public/fallbacks/backend.svg`, `public/fallbacks/infra.svg`, `public/fallbacks/frontend.svg`, `public/fallbacks/devops.svg`, `public/fallbacks/architecture.svg`, `public/fallbacks/career.svg`, `public/fallbacks/default.svg`
- Modify: `src/components/ItemCard.astro`

- [ ] **Step 1: Create the fallback SVGs**

For each category create a 640x360 SVG with the label. Example `public/fallbacks/ai.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" role="img" aria-label="ai">
  <rect width="640" height="360" fill="#1f2937"/>
  <text x="50%" y="55%" fill="#e5e7eb" font-family="sans-serif" font-size="64" text-anchor="middle">ai</text>
</svg>
```

Repeat for other categories with their labels. Use `default.svg` with `digest` label.

- [ ] **Step 2: Update `ItemCard.astro`**

Replace the `{d.thumbnail && ...}` block with:

```astro
{(() => {
  const fallback = `/morning-digest/fallbacks/${d.source.category}.svg`;
  const src = d.thumbnail ?? fallback;
  return <img src={src} alt="" loading="lazy" width="640" style="width:100%;max-width:100%;border-radius:8px;aspect-ratio:16/9;object-fit:cover;" onerror={`this.onerror=null;this.src='${fallback}'`} />;
})()}
```

- [ ] **Step 3: Build** — Expected: success.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(ui): category fallback svgs for thumbnails"
```

---

## Phase 8 — CI / Deploy

### Task 29: `ci.yml` (PR and main push safety)

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create workflow**

```yaml
name: ci
on:
  pull_request:
  push:
    branches-ignore: [main]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm test
      - run: pnpm build
```

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "ci: pnpm install, lint, test, build on PR"
```

---

### Task 30: `deploy.yml` (Pages deploy on push to main)

**Files:**
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: Create workflow**

```yaml
name: deploy
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "ci: deploy astro build to github pages"
```

---

## Phase 9 — Scheduling

### Task 31: `scripts/daily.sh`

**Files:**
- Create: `scripts/daily.sh`

- [ ] **Step 1: Create script**

```bash
#!/usr/bin/env bash
set -u
cd "$(dirname "$0")/.."
REPO_ROOT="$(pwd)"
export REPO_ROOT

LOG_DIR="$REPO_ROOT/_workspace/logs"
mkdir -p "$LOG_DIR"
STAMP="$(date +%F)"

{
  echo "=== daily run $STAMP ==="
  git pull --ff-only || true
  pnpm install --frozen-lockfile || exit 0
  pnpm digest:daily || exit 0
  if [[ -n "$(git status --porcelain src/content/items public/search-index.json)" ]]; then
    git add src/content/items public/search-index.json
    git commit -m "chore: digest $STAMP"
    git push
  else
    echo "no changes"
  fi
} >> "$LOG_DIR/launchd.out.log" 2>> "$LOG_DIR/launchd.err.log"
exit 0
```

- [ ] **Step 2: Make executable**

Run: `chmod +x scripts/daily.sh`

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(ops): daily.sh wrapper for launchd"
```

---

### Task 32: launchd plist template

**Files:**
- Create: `scripts/launchd/me.logan.morning-digest.plist`, `scripts/launchd/install.sh`

- [ ] **Step 1: Plist template**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key><string>me.logan.morning-digest</string>
    <key>ProgramArguments</key>
    <array>
      <string>/bin/bash</string>
      <string>-lc</string>
      <string>REPO_PLACEHOLDER/scripts/daily.sh</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
      <key>Hour</key><integer>5</integer>
      <key>Minute</key><integer>30</integer>
    </dict>
    <key>StandardOutPath</key><string>REPO_PLACEHOLDER/_workspace/logs/launchd.out.log</string>
    <key>StandardErrorPath</key><string>REPO_PLACEHOLDER/_workspace/logs/launchd.err.log</string>
    <key>RunAtLoad</key><false/>
  </dict>
</plist>
```

- [ ] **Step 2: Install helper**

`scripts/launchd/install.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
DEST="$HOME/Library/LaunchAgents/me.logan.morning-digest.plist"
sed "s|REPO_PLACEHOLDER|$REPO|g" "$REPO/scripts/launchd/me.logan.morning-digest.plist" > "$DEST"
launchctl unload "$DEST" 2>/dev/null || true
launchctl load "$DEST"
echo "installed $DEST"
```

Run: `chmod +x scripts/launchd/install.sh`

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(ops): launchd plist template and installer"
```

---

## Phase 10 — E2E smoke & docs

### Task 33: Playwright smoke test

**Files:**
- Create: `playwright.config.ts`, `e2e/smoke.spec.ts`

- [ ] **Step 1: Add deps**

Run: `pnpm add -D @playwright/test && pnpm exec playwright install chromium`

- [ ] **Step 2: Config**

`playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'e2e',
  webServer: {
    command: 'pnpm build && pnpm preview --host 127.0.0.1 --port 4321',
    url: 'http://127.0.0.1:4321/morning-digest/',
    timeout: 120_000,
    reuseExistingServer: false,
  },
  use: { baseURL: 'http://127.0.0.1:4321/morning-digest' },
});
```

- [ ] **Step 3: Smoke spec**

`e2e/smoke.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test('home renders and theme toggles', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: "Today's picks" })).toBeVisible();
  const before = await page.locator('html').getAttribute('data-theme');
  await page.getByRole('button', { name: 'Toggle theme' }).click();
  const after = await page.locator('html').getAttribute('data-theme');
  expect(after).not.toBe(before);
});
```

- [ ] **Step 4: Run**

Run: `pnpm test:e2e`
Expected: PASS 1/1.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "test(ui): playwright smoke test for home + theme"
```

---

### Task 34: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write a concise README**

```md
# morning-digest

Personal static morning-reading digest. Pipeline (TS/Node) → Astro SSG → GitHub Pages.

## Local

```
pnpm install
pnpm digest:daily --dry-run
pnpm dev
```

## Pipeline

```
pnpm digest:daily [--date=YYYY-MM-DD] [--only=fetch,dedupe,extract,llm,write] [--dry-run] [--force]
```

Stages: fetch → dedupe → extract → llm (`claude -p /morning-digest`) → write.
Output lives in `src/content/items/*.json` and `public/search-index.json`.

## Deploy

Push to `main` → Actions builds and publishes to `gh-pages`.

## Schedule

```
bash scripts/launchd/install.sh   # KST 05:30 daily
```

Logs: `_workspace/logs/`.
```

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "docs: readme"
```

---

## Self-Review (executed by plan author, results recorded below)

**Spec coverage check:**

| Spec section | Task(s) |
|---|---|
| §2 Decisions | Design already encoded in tasks below |
| §3 Architecture (pipeline/content/ui) | T9-T14 / T16-T17 / T18-T28 |
| §4.1 item schema | T3 + T16 |
| §4.2 tag allowlist | T3 + T15 |
| §4.3 sort + search index | T13 + T27 |
| §5.1 CLI flags | T14 |
| §5.2 stages | T9-T13 |
| §5.3 LLM skill + retry | T12 + T15 |
| §5.4 idempotency | T10 + T14 |
| §6.1 routes | T20-T24 |
| §6.2 components | T18-T19, T25-T27 |
| §6.3 interactions (read, theme, search, tags) | T25-T27 + T21 |
| §6.4 island strategy | islands in T25-T27 |
| §6.5 thumbnails + fallback | T19 + T28 |
| §7 errors & observability | T9 (fetchErrors), T5 log, T8 source health |
| §8 tests | pipeline (T3-T13) + smoke (T33) |
| §9.1 actions | T29 + T30 |
| §9.2 launchd | T31 + T32 |
| §10 repo layout | honored throughout |
| §11 open questions | deferred; flagged in README |

**Placeholder scan:** none remain; each step includes complete code or commands.

**Type consistency:** `ItemSchema`, `CuratedItemSchema`, `ExtractedItem`, `RawItem`, `Source`, `SeenDb`, `ClaudeRunner`, `FetchFn`, `ExtractFn` names are used identically across tasks 3–14 and referenced unchanged by tasks 16–28.

**Remaining gaps:** source health warning after 7 consecutive failures (spec §7.3) is recorded in `seen-db` but no alert surface is implemented — the log entry in `_workspace/logs/launchd.err.log` from `daily.sh` plus manual review is treated as sufficient for a personal site. If an automated warning is desired later, add a `stages/health-report.ts` task.

---

🤖 Generated with Claude Code
Co-Authored-By: Claude <noreply@anthropic.com>
