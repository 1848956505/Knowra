import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { _electron as electron, expect } from '@playwright/test';
import { executablePath } from './packaged-app-path.mjs';

test('打包 APP 的附件下载复用会话，原生保存后可主动打开，正文链接使用相同路径', { timeout: 60000 }, async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'knowra-packaged-attachment-'));
  let app;
  t.after(async () => { await app?.close().catch(() => {}); fs.rmSync(directory, { recursive: true, force: true }); });
  app = await electron.launch({ executablePath, env: { ...process.env, KNOWRA_DESKTOP_SMOKE_DIR: directory }, timeout: 20000 });
  const page = await app.firstWindow(); await page.waitForLoadState('domcontentloaded');
  const result = await page.evaluate(async () => {
    const send = async (route, method, data) => (await (await fetch(route, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })).json()).data;
    const space = await send('/api/knowledge/spaces/default', 'POST', {});
    const note = await send('/api/knowledge/notes', 'POST', { spaceId: space.id, title: '打包附件验收', rawMarkdown: '原始正文' });
    const attachment = await send('/api/storage/attachments', 'POST', { noteId: note.id, fileName: '下载.txt', mimeType: 'text/plain', contentBase64: 'b3JpZ2luYWw=' });
    const updated = await send(`/api/knowledge/notes/${note.id}`, 'PATCH', { expectedUpdatedAt: note.updatedAt, rawMarkdown: `[正文附件](/api/storage/attachments/${attachment.id}/content)` });
    return { note, attachment, updated };
  });
  assert(result.updated?.rawMarkdown?.includes('正文附件'), JSON.stringify(result.updated));
  const destination = path.join(directory, '下载结果.txt');
  await app.evaluate(({ dialog, shell }, destination) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: destination });
    shell.openPath = async file => { globalThis.attachmentOpened = file; return ''; };
  }, destination);
  await page.goto(`${new URL(page.url()).origin}/#/materials/notes/${result.note.id}`); await page.reload();
  await expect(page.locator('.ProseMirror')).toContainText('正文附件');
  if (!await page.getByRole('button', { name: '上传附件', exact: true }).isVisible()) await page.getByRole('button', { name: '切换文档检查器' }).click();
  await page.getByRole('button', { name: '打开附件 下载.txt', exact: true }).click();
  await expect(page.getByRole('button', { name: '打开已保存文件', exact: true })).toBeVisible();
  assert.equal(fs.readFileSync(destination, 'utf8'), 'original');
  await page.getByRole('button', { name: '打开已保存文件', exact: true }).click();
  await expect.poll(() => app.evaluate(() => globalThis.attachmentOpened)).toBe(destination);
  fs.unlinkSync(destination);
  await page.locator('.ProseMirror a').filter({ hasText: '正文附件' }).click();
  await expect(page.getByRole('button', { name: '打开已保存附件', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '打开已保存附件', exact: true }).click();
  await expect.poll(() => fs.existsSync(destination)).toBe(true);
  assert.equal(fs.readFileSync(destination, 'utf8'), 'original');
  fs.unlinkSync(destination);
  await page.locator('.ProseMirror a').filter({ hasText: '正文附件' }).click({ button: 'middle' });
  await expect.poll(() => fs.existsSync(destination)).toBe(true);
  assert.equal(fs.readFileSync(destination, 'utf8'), 'original');
  const denied = await fetch(`${new URL(page.url()).origin}/api/storage/attachments/${result.attachment.id}/content`);
  assert.equal(denied.status, 401, '外部会话仍应被拒绝');
  if (process.env.KNOWRA_E2E_OUTPUT) {
    fs.mkdirSync(process.env.KNOWRA_E2E_OUTPUT, { recursive: true });
    await page.screenshot({ animations: 'disabled', path: path.join(process.env.KNOWRA_E2E_OUTPUT, 'packaged-attachment-download.png') });
  }
});
