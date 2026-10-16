import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './src/tests/e2e',
  timeout: 60000,
  expect: { timeout: 12000 },
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1440, height: 960 },
  },
  outputDir: 'test-results',
});
