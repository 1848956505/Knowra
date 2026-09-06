import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { withBrowser } from '../阶段4/browser-fixture.mjs';

await withBrowser(async ({ page, origin, f, browser, errors }) => {
  const apiOnly = (url) => url.pathname.startsWith('/api/');
  await page.goto(`${origin}/#/materials`);
  await page.getByText('阶段四浏览器笔记', { exact: true }).waitFor({ timeout: 30_000 });
  await page.getByText('阶段四浏览器笔记', { exact: true }).dblclick();
  await expect(page).toHaveURL(/\/materials\/notes\/browser-note$/);

  const serverGroups = (await f.request('/api/knowledge/tag-groups')).data;
  const onlineCache = await page.evaluate(() => JSON.parse(localStorage.getItem('study-accelerator.backend-workspace-cache')));
  assert.equal(serverGroups.length, 4);
  assert.equal(onlineCache.tagGroups.length, 4);

  await page.route(apiOnly, (route) => route.abort('failed'));
  await page.reload();
  await expect(page.getByText(/缓存只读/).first()).toBeVisible();
  await page.evaluate(() => { location.hash = '/materials/tags'; });
  await page.getByRole('heading', { name: '标签管理', exact: true }).waitFor();
  for (const name of ['普通标签', '掌握程度', '重要程度', '用途']) {
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  }
  await expect(page.getByRole('button', { name: '新建分组', exact: true })).toHaveCount(0);
  await page.screenshot({ path: 'docs/审查/证据/修复3/R06-离线缓存保留标签分组.png' });

  console.log(JSON.stringify({
    browser: browser.version(),
    viewport: { width: 1440, height: 1000 },
    transport: 'Vite same-origin proxy to isolated real API',
    outcome: 'pass',
    checks: {
      serverGroups: serverGroups.length,
      cachedGroupsAfterNavigation: onlineCache.tagGroups.length,
      offlineGroupHeadings: 4,
      offlineWriteActionsHidden: true,
      pageErrors: errors
    }
  }, null, 2));
}, { restartAfterSpace: false });
