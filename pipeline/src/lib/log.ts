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
