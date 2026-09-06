import fs from 'node:fs';
import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { withBrowser } from '../阶段4/browser-fixture.mjs';

const out = 'docs/审查/证据/修复2/';
await withBrowser(async ({ page, origin, f, errors }) => {
  const source = () => page.getByRole('textbox', { name: 'Markdown 源码编辑器', exact: true });
  async function showSource() {
    if (!await source().isVisible()) {
      await page.getByRole('button', { name: '视图', exact: true }).click();
      await page.getByRole('menuitem', { name: '显示源码编辑器', exact: true }).click();
    }
    await source().waitFor();
  }
  await page.goto(origin + '/#/materials/notes/browser-note');
  await page.getByText('初始浏览器正文', { exact: true }).waitFor({ timeout: 30000 });
  await showSource();
  await f.request('/api/knowledge/notes/browser-note', 'PATCH', { rawMarkdown: '另一客户端已保存的正文' });
  await source().fill('跨页面与刷新保留的冲突草稿 😀');
  const exportButton = () => page.getByRole('button', { name: '导出本地草稿', exact: true });
  await exportButton().waitFor();
  await page.getByRole('button', { name: '资料', exact: true }).click();
  await expect(page).toHaveURL(/#\/materials$/);
  await page.goBack();
  await showSource();
  await expect(source()).toHaveValue('跨页面与刷新保留的冲突草稿 😀');
  await exportButton().waitFor();
  await page.reload();
  await showSource();
  await expect(source()).toHaveValue('跨页面与刷新保留的冲突草稿 😀');
  await exportButton().waitFor();
  await source().fill('冲突恢复后继续输入的草稿 😀');
  const downloadPromise = page.waitForEvent('download');
  await exportButton().click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  let text = '';
  for await (const chunk of stream) text += chunk;
  assert.equal(text, '冲突恢复后继续输入的草稿 😀');
  await page.screenshot({ path: out + '冲突草稿恢复.png' });
  assert.equal((await f.request('/api/knowledge/notes/browser-note')).data.rawMarkdown, '另一客户端已保存的正文');
  const resolveDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出草稿并加载远端', exact: true }).click();
  const resolved = await resolveDownload;
  const resolvedStream = await resolved.createReadStream();
  let resolvedText = '';
  for await (const chunk of resolvedStream) resolvedText += chunk;
  assert.equal(resolvedText, '冲突恢复后继续输入的草稿 😀');
  await showSource();
  await expect(source()).toHaveValue('另一客户端已保存的正文');
  await expect(exportButton()).toBeHidden();
  assert.deepEqual(errors, []);
  fs.writeFileSync(out + '浏览器草稿恢复结果.json', JSON.stringify({
    outcome: 'pass', realHttpConflict: true, routeReturnPreserved: true,
    reloadPreserved: true, continuedDraftExported: true, explicitExportAndRemoteReload: true, remoteUnchanged: true, pageErrors: errors
  }, null, 2) + '\n');
});
