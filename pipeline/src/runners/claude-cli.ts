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
