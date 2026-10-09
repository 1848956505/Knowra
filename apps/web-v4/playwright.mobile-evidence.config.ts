import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e', testMatch: ['mobile-evidence.spec.ts', 'responsive-mobile-tablet.spec.ts', 'v4-05-shell-home.spec.ts', 'v4-07-editor.spec.ts', 'ai-assistant.spec.ts'], outputDir: './test-results/mobile-evidence',
  fullyParallel: true, workers: 2, retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/mobile-evidence', open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:5173', browserName: 'chromium', launchOptions: { chromiumSandbox: true }, serviceWorkers: 'block', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: 'npm run preview -- --host 127.0.0.1 --port 5173 --strictPort', url: 'http://127.0.0.1:5173', reuseExistingServer: false },
});
