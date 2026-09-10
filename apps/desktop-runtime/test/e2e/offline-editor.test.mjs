import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { chromium, expect } from '@playwright/test';

test('真实 V4 页面断外网编辑、保存状态、强制终止运行服务并重新打开', { timeout: 60000 }, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'knowra-offline-e2e-'));
  const browser = await chromium.launch({ ...(process.env.V4_BROWSER_CHANNEL === 'chrome' ? { channel: 'chrome' } : {}) });
  let child;
  t.after(async () => {
    await browser.close();
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
    fs.rmSync(root, { recursive: true, force: true });
  });
  const start = async () => {
    child = fork(fileURLToPath(new URL('../../src/main.mjs', import.meta.url)), ['--data-dir', root], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
    const [message] = await once(child, 'message');
    assert.equal(message.type, 'ready');
    return message;
  };
  let runtime = await start();
  let context = await browser.newContext();
  let page = await context.newPage();
  const problems = [];
  page.on('pageerror', error => problems.push(error.message));
  // 阻断所有非回环流量，保留实际本地 HTTP；不 Mock 任何业务 API。
  await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.goto(runtime.launchUrl);
  const request = context.request;
  const space = (await (await request.post(`${runtime.origin}/api/knowledge/spaces/default`, { data: {} })).json()).data;
  const note = (await (await request.post(`${runtime.origin}/api/knowledge/notes`, { data: { spaceId: space.id, title: '离线页面验收', rawMarkdown: '原始内容' } })).json()).data;
  // 通过 API 建立夹具后刷新主页，再使用真实入口打开笔记。
  await page.goto(runtime.origin);
  await page.reload();
  await page.getByRole('button', { name: '打开 离线页面验收', exact: true }).click();
  await expect(page.getByRole('heading', { name: '离线页面验收', exact: true })).toBeVisible();
  const editor = page.locator('.ProseMirror');
  await expect(editor).toContainText('原始内容');
  await expect(page.getByRole('button', { name: '插入图片', exact: true })).toBeEnabled();
  await editor.click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' 离线新增中文正文');
  await expect(page.getByRole('contentinfo')).toContainText('保存中');
  await expect(page.getByRole('contentinfo')).toContainText('已保存到本机');
  await expect(page.getByRole('contentinfo')).toContainText('连接云端');
  await editor.press('ControlOrMeta+a');
  await page.getByRole('button', { name: '标记重点', exact: true }).click();
  await expect.poll(async () => (await (await request.get(`${runtime.origin}/api/knowledge/annotations?noteId=${note.id}`)).json()).data.length).toBe(1);
  await editor.press('ArrowRight');
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: '插入图片', exact: true }).click()
  ]);
  await chooser.setFiles({ name: '离线图片.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64') });
  await expect(editor.getByRole('img', { name: '离线图片.png', exact: true })).toBeVisible();
  await expect(page.getByRole('contentinfo')).toContainText('已保存到本机');
  await expect.poll(async () => (await (await request.get(`${runtime.origin}/api/knowledge/notes/${note.id}`)).json()).data.rawMarkdown).toContain('/api/storage/attachments/');
  const saved = (await (await request.get(`${runtime.origin}/api/knowledge/notes/${note.id}`)).json()).data;
  assert(saved.rawMarkdown.includes('离线新增中文正文'));
  assert(saved.rawMarkdown.includes('/api/storage/attachments/'));
  const before = (await (await request.get(`${runtime.origin}/api/local-runtime/status`)).json()).data;
  assert(before.pendingOperations > 0);
  const screenshots = process.env.KNOWRA_E2E_OUTPUT;
  if (screenshots) {
    fs.mkdirSync(screenshots, { recursive: true });
    await page.screenshot({ path: path.join(screenshots, 'offline-saved.png') });
  }
  await context.close();
  const exited = once(child, 'exit');
  child.kill('SIGKILL');
  await exited;
  runtime = await start();
  context = await browser.newContext();
  await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  page = await context.newPage();
  page.on('pageerror', error => problems.push(error.message));
  await page.goto(runtime.launchUrl);
  await page.goto(`${runtime.origin}/#/materials/notes/${note.id}`);
  await expect(page.locator('.ProseMirror')).toContainText('离线新增中文正文');
  await expect(page.locator('.ProseMirror').getByRole('img', { name: '离线图片.png', exact: true })).toBeVisible();
  assert(await page.locator('.ProseMirror').getByRole('img', { name: '离线图片.png', exact: true }).evaluate(image => image.complete && image.naturalWidth > 0));
  assert.equal((await (await context.request.get(`${runtime.origin}/api/knowledge/annotations?noteId=${note.id}`)).json()).data.length, 1);
  const after = (await (await context.request.get(`${runtime.origin}/api/local-runtime/status`)).json()).data;
  assert.equal(after.pendingOperations, before.pendingOperations);
  assert.equal(after.deviceId, before.deviceId);
  assert.deepEqual(problems, []);
  if (screenshots) await page.screenshot({ path: path.join(screenshots, 'offline-restored.png') });
});
