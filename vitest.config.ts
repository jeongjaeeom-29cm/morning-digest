import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['pipeline/test/**/*.test.ts'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
  },
});
