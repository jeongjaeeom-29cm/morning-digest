# morning-digest

Personal static morning-reading digest. TypeScript pipeline → Astro SSG → GitHub Pages.

## Local

```bash
pnpm install
pnpm digest:daily --dry-run
pnpm dev
```

## Pipeline

```bash
pnpm digest:daily [--date=YYYY-MM-DD] [--only=fetch,dedupe,extract,llm,write] [--dry-run] [--force]
```

Stages: `fetch` → `dedupe` → `extract` → `llm` (via `claude -p /morning-digest`) → `write`.
Outputs: `src/content/items/<id>.json` and `public/search-index.json`.

## Tests

```bash
pnpm test       # vitest (pipeline unit)
pnpm test:e2e   # playwright smoke
pnpm lint       # tsc --noEmit (root + pipeline)
pnpm build      # astro static build
```

## Deploy

Push to `main` → GitHub Actions builds Astro and publishes to GitHub Pages.

## Schedule

```bash
bash scripts/launchd/install.sh   # KST 05:30 daily
```

Logs: `_workspace/logs/launchd.{out,err}.log`.

## Structure

- `pipeline/` — Node/TS CLI (fetch → dedupe → extract → llm → write).
- `src/content/` — typed JSON contract between pipeline and UI.
- `src/` — Astro pages, layouts, islands (theme toggle, read tracker, search, tag filters via routes).
- `.claude/skills/morning-digest/SKILL.md` — LLM curation contract.
- `scripts/` — daily runner + launchd plist + installer.

## Docs

- Design spec: `docs/superpowers/specs/2026-04-21-morning-digest-design.md`
- Implementation plan: `docs/superpowers/plans/2026-04-21-morning-digest-impl.md`
