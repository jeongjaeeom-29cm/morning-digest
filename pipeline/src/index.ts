import mri from 'mri';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
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
const ALL_STAGES: Stage[] = ['fetch', 'dedupe', 'extract', 'llm', 'write'];

function todayKst(): string {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}
async function writeJson(path: string, data: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2));
}

async function main() {
  const args = mri(process.argv.slice(2), {
    string: ['date', 'only'],
    boolean: ['dry-run', 'force'],
    default: { 'dry-run': false, force: false },
  });
  const date: string = args.date ?? todayKst();
  const repoRoot = process.env.REPO_ROOT ?? process.cwd();
  const paths = workspacePaths(repoRoot, date);
  const only: Stage[] = args.only
    ? (args.only.split(',').filter(Boolean) as Stage[])
    : ALL_STAGES;

  const sources = await loadSources(`${repoRoot}/sources.yaml`);

  if (args['dry-run']) {
    console.log(`dry-run date=${date} sources: ${sources.length} stages: ${only.join(',')}`);
    return;
  }

  const log = createJsonlLogger(paths.runLog);

  if (only.includes('fetch')) {
    const t0 = Date.now();
    const out = await runFetch({ sources, fetchFeed: rssRunner });
    await writeJson(paths.raw, out);
    log.write({ stage: 'fetch', ok: true, itemsOut: out.items.length, durationMs: Date.now() - t0 });
  }

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

  if (only.includes('extract')) {
    const t0 = Date.now();
    const { newItems } = await readJson<{ newItems: any[] }>(paths.new);
    const out = await runExtract({ items: newItems, extractFn: articleExtractor });
    await writeJson(paths.extracted, out);
    log.write({ stage: 'extract', ok: true, itemsIn: newItems.length, itemsOut: out.items.length, durationMs: Date.now() - t0 });
  }

  if (only.includes('llm')) {
    const t0 = Date.now();
    const { items } = await readJson<{ items: any[] }>(paths.extracted);
    const runner = claudeCliRunner({ skill: '/morning-digest', cwd: repoRoot });
    const out = await runLlm({ items, runner });
    await writeJson(paths.curated, out);
    log.write({ stage: 'llm', ok: true, itemsIn: items.length, itemsOut: out.items.length, durationMs: Date.now() - t0 });
  }

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
