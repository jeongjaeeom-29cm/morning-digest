import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'e2e',
  webServer: {
    command: 'pnpm build && pnpm preview --host 127.0.0.1 --port 4321',
    url: 'http://127.0.0.1:4321/morning-digest/',
    timeout: 120_000,
    reuseExistingServer: false,
  },
  use: { baseURL: 'http://127.0.0.1:4321/morning-digest/' },
});
