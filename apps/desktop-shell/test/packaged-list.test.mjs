import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { _electron as electron, expect } from '@playwright/test';
import { executablePath } from './packaged-app-path.mjs';

test('Mac 打包应用：列表子树标记、系统剪贴板粘贴、真实退出重开继续跟随', { timeout: 90000 }, async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'knowra-packaged-list-'));
  let app;
  t.after(async () => { if (app) await app.close().catch(() => {}); fs.rmSync(directory, { recursive: true, force: true }); });
  const launch = () => electron.launch({ executablePath, env: { ...process.env, KNOWRA_DESKTOP_SMOKE_DIR: directory }, timeout: 20000 });
  const quit = async () => {
    const closed = app.waitForEvent('close');
    await app.evaluate(({ app: nativeApp }) => nativeApp.quit());
    await closed; app = null;
  };
  app = await launch();
  let page = await app.firstWindow(); await page.waitForLoadState('domcontentloaded');
  const note = await page.evaluate(async () => {
    const space = (await (await fetch('/api/knowledge/spaces/default', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json()).data;
    return (await (await fetch('/api/knowledge/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spaceId: space.id, title: '打包列表验收', rawMarkdown: '- 父项\n  - 子项\n- 相邻' }) })).json()).data;
  });
  const open = async () => {
    await page.goto(`${new URL(page.url()).origin}/#/materials/notes/${note.id}`);
    await expect(page.locator('.ProseMirror')).toContainText('子项');
  };
  const read = () => page.evaluate(async noteId => (await (await fetch(`/api/knowledge/annotations?noteId=${noteId}`)).json()).data, note.id);
  const caret = async () => page.locator('.ProseMirror p').filter({ hasText: /^父项/ }).first().evaluate(element => {
    const range = document.createRange(); range.selectNodeContents(element); range.collapse(false);
    element.closest('[contenteditable]').focus(); window.getSelection().removeAllRanges(); window.getSelection().addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await page.reload(); await page.waitForLoadState('domcontentloaded');
  await open();
  await page.locator('.ProseMirror p').filter({ hasText: /^父项$/ }).first().hover();
  await page.getByRole('button', { name: '列表项重点菜单', exact: true }).click();
  await page.getByRole('menuitem', { name: '标记此列表项为重点（包含本项及全部子项）', exact: true }).click();
  await expect.poll(async () => (await read()).length).toBe(1);
  const original = (await read())[0]; assert.equal(original.scopeType, 'list');
  await app.evaluate(({ clipboard }) => clipboard.writeText('系统粘贴😀'));
  await caret(); await page.keyboard.press('Meta+v');
  await expect.poll(async () => (await read())[0].quoteText).toContain('系统粘贴😀');
  assert.equal((await read())[0].anchorStatus, 'resolved');
  await quit();
  app = await launch(); page = await app.firstWindow(); await page.waitForLoadState('domcontentloaded');
  await open();
  const restored = (await read())[0];
  assert.equal(restored.id, original.id); assert.equal(restored.anchor.tracking.rootId, original.anchor.tracking.rootId);
  assert.deepEqual(restored.originSnapshot, original.originSnapshot); assert.doesNotMatch(restored.quoteText, /相邻/);
  await caret(); await page.keyboard.insertText('重开后编辑');
  await expect.poll(async () => (await read())[0].quoteText).toContain('重开后编辑');
  assert.equal((await read())[0].anchorStatus, 'resolved');
  await page.screenshot({ path: '/tmp/knowra-packaged-list-ui.png', fullPage: true });
  await quit();
});
