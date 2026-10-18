import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e', testMatch: ['editor-table-boundary.spec.ts'], grep: /HTML 粘贴表格末行左格|第 (9|10) 格右键在下方/, timeout: 15000, globalTimeout: 180000, outputDir: './test-results/mobile-evidence',
  fullyParallel: true, workers: 2, retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/mobile-evidence', open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:5173', browserName: 'chromium', channel: 'chrome', launchOptions: { chromiumSandbox: true }, serviceWorkers: 'block', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: 'npm run preview -- --host 127.0.0.1 --port 5173 --strictPort', url: 'http://127.0.0.1:5173', reuseExistingServer: false },
});
