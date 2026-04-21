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
