import fs from 'node:fs';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { expect } from '@playwright/test';
import { withBrowser } from '../阶段4/browser-fixture.mjs';

const rows = [];
const outputDirectory = 'docs/审查/证据/修复5/';

for (const count of [100, 1000, 10000]) {
  await withBrowser(async ({ page, origin, f, errors }) => {
    const template = f.store.state.notes[0];
    f.store.state.notes.splice(0, f.store.state.notes.length, ...Array.from({ length: count }, (_, index) => ({
      ...template,
      id: `scale-${index}`,
      title: `规模笔记${index}`,
      rawMarkdown: 'a'.repeat(1024),
      plainText: 'a'.repeat(1024)
    })));
    f.store.state.noteVersions.splice(0);
    f.store.flush();

    const requests = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname === '/api/knowledge/notes' && url.searchParams.get('limit') === '31') {
        requests.push(Object.fromEntries(url.searchParams));
      }
    });
    const startedAt = performance.now();
    await page.goto(`${origin}/#/materials`);
    await expect(page.locator('[data-art-kind="document"]')).toHaveCount(10, { timeout: 90000 });
    await expect.poll(() => requests.length, { timeout: 90000 }).toBe(1);
    await expect(page.getByText(`已载入 30 篇文稿`, { exact: false })).toBeVisible();
    const initialMs = performance.now() - startedAt;

    await page.getByRole('button', { name: '加载更多', exact: true }).click();
    await expect.poll(() => requests.length, { timeout: 90000 }).toBe(2);
    await expect(page.getByText('第 1 / 6 页 · 已载入 60 条', { exact: true })).toBeVisible();
    assert.equal(await page.locator('[data-art-kind="document"]').count(), 10);
    assert.deepEqual(requests.map((request) => request.offset), ['0', '30']);
    assert.deepEqual(errors, []);

    rows.push({
      notes: count,
      initialPageQueryRequests: 1,
      requestsAfterOneExplicitLoad: 2,
      offsets: requests.map((request) => request.offset),
      gridDomCards: await page.locator('[data-art-kind="document"]').count(),
      navigationToFirstPageMs: Number(initialMs.toFixed(2)),
      pageErrors: errors
    });
    if (count === 10000) {
      await page.screenshot({ path: `${outputDirectory}修复后-10000-图标分页.png` });
    }
  });
}

fs.writeFileSync(
  `${outputDirectory}浏览器规模复验结果.json`,
  `${JSON.stringify({
    environment: 'Chromium 151, 1440x1000, Vite source + isolated local-json API; fresh browser per scale; single sample, no SLO supplied',
    rows
  }, null, 2)}\n`
);
