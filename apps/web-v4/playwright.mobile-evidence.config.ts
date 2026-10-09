import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e', testMatch: 'mobile-evidence.spec.ts', outputDir: './mobile-evidence-results',
  fullyParallel: true, workers: 2, retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'mobile-evidence-report', open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:5173', browserName: 'chromium', serviceWorkers: 'block', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: 'npm run preview -- --host 127.0.0.1 --port 5173 --strictPort', url: 'http://127.0.0.1:5173', reuseExistingServer: false },
});
