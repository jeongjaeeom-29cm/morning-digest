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
    filterNew(ids: string[]): string[] {
      return ids.filter(id => !hasStmt.get(id));
    },
    markSeen(ids: string[], date: string): void {
      const tx = db.transaction((xs: string[]) => {
        for (const id of xs) insertStmt.run(id, date);
      });
      tx(ids);
    },
    recordSourceResult(slug: string, ok: boolean, at: string): void {
      if (ok) {
        upsertHealthOk.run(slug, at);
      } else {
        upsertHealthFail.run(slug);
      }
    },
    getSourceHealth(slug: string) {
      return (getHealthStmt.get(slug) as { slug: string; consecutive_failures: number; last_ok_at: string | null } | undefined) ?? null;
    },
    close(): void {
      db.close();
    },
  };
}
