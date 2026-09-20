import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { chromium, expect } from '@playwright/test';
import { startLocalRuntime } from '../../src/runtime-server.mjs';

test('桌面真实页面提前说明永久删除限制，并可预览分析范围', { timeout: 60000 }, async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'knowra-capabilities-'));
  const runtime = await startLocalRuntime({ dataDirectory: directory, distRoot: fileURLToPath(new URL('../../../web-v4/dist/', import.meta.url)) });
  const browser = await chromium.launch();
  t.after(async () => { await browser.close(); await runtime.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(runtime.launchUrl);
  const space = (await (await page.request.post(`${runtime.origin}/api/knowledge/spaces/default`, { data: {} })).json()).data;
  const create = async (title, rawMarkdown) => (await (await page.request.post(`${runtime.origin}/api/knowledge/notes`, { data: { spaceId: space.id, title, rawMarkdown } })).json()).data;
  const active = await create('可预览分析', '要预览的范围正文');
  const trash = await create('回收站说明', '可恢复正文');
  await page.request.delete(`${runtime.origin}/api/knowledge/notes/${trash.id}`);
  await page.goto(`${runtime.origin}/#/materials?scope=trash`);
  await page.reload();
  await expect(page.getByText(/桌面端暂不支持彻底删除/)).toBeVisible();
  await page.getByRole('button', { name: '回收站说明的回收站操作' }).click();
  await expect(page.getByRole('menuitem', { name: '彻底删除（请在网页版操作）' })).toHaveAttribute('aria-disabled', 'true');
  await page.getByRole('menuitem', { name: '恢复笔记', exact: true }).click();
  await expect.poll(() => runtime.store.state.notes.find(note => note.id === trash.id).deleted).toBe(false);
  await page.goto(`${runtime.origin}/#/materials/notes/${active.id}`);
  await expect(page.locator('.ProseMirror')).toContainText('要预览的范围正文');
  if (!await page.getByRole('tab', { name: 'AI', exact: true }).isVisible()) await page.getByRole('button', { name: '切换文档检查器' }).click();
  await page.getByRole('tab', { name: 'AI', exact: true }).click();
  await page.getByRole('button', { name: '分析整篇', exact: true }).click();
  const preview = page.getByRole('dialog', { name: '确认分析范围' });
  await expect(preview).toContainText('要预览的范围正文');
  await expect(preview).toContainText('范围快照暂不支持离线同步');
  await expect(preview.getByRole('button', { name: '保存范围快照' })).toBeDisabled();
  assert.equal(runtime.store.state.analysisScopeSnapshots.length, 0);
  assert.deepEqual(errors, []);
  if (process.env.KNOWRA_E2E_OUTPUT) {
    fs.mkdirSync(process.env.KNOWRA_E2E_OUTPUT, { recursive: true });
    await page.screenshot({ path: path.join(process.env.KNOWRA_E2E_OUTPUT, 'desktop-analysis-preview.png'), animations: 'disabled' });
  }
});
