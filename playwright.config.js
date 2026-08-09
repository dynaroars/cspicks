import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  timeout: 30_000,
  fullyParallel: true,
  use: {
    baseURL: 'http://127.0.0.1:4173/cspicks/',
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true
  }
});
