import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { chromium, expect } from '@playwright/test';
import { startLocalRuntime } from '../../src/runtime-server.mjs';

// 同文档 hash 导航后 reload 可能回到旧历史项；需要全新加载时先到 about:blank。
async function openFresh(page, url) { await page.goto('about:blank'); await page.goto(url); }

test('真实SQLite页面：保存后块身份写入服务端，整页重开沿用同一组块 ID', { timeout: 45000 }, async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'knowra-block-identity-'));
  const runtime = await startLocalRuntime({ dataDirectory: directory, distRoot: fileURLToPath(new URL('../../../web-v4/dist/', import.meta.url)) });
  const browser = await chromium.launch({ executablePath: process.env.KNOWRA_TEST_BROWSER_EXECUTABLE });
  t.after(async () => { await browser.close(); await runtime.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  const page = await browser.newPage(); await page.goto(runtime.launchUrl);
  const post = async (pathname, data) => {
    const response = await page.request.post(runtime.origin + pathname, { data });
    assert.equal(response.ok(), true, await response.text()); return (await response.json()).data;
  };
  const readNote = async id => (await (await page.request.get(`${runtime.origin}/api/knowledge/notes/${id}`)).json()).data;
  const space = await post('/api/knowledge/spaces/default', {});
  const note = await post('/api/knowledge/notes', { id: 'block-identity', spaceId: space.id, title: '块身份', rawMarkdown: '## 标题\n\n第一段\n\n第二段' });
  const url = `${runtime.origin}/#/materials/notes/${note.id}`;
  const editor = () => page.getByRole('textbox', { name: '笔记正文' });
  const blockIds = () => page.evaluate(() => Array.from(document.querySelectorAll('.ProseMirror [data-block-id]'), element => element.getAttribute('data-block-id')));

  await openFresh(page, url);
  await expect(page.locator('[data-editor-ready="true"]')).toBeVisible();
  await editor().getByText('第二段', { exact: true }).click();
  await page.keyboard.press('End');
  await page.keyboard.type('补充');
  // 就绪后编辑器会恢复上次光标位置，输入落在哪个块不影响本用例。
  await expect.poll(async () => (await readNote(note.id)).rawMarkdown).toContain('补充');
  await expect.poll(async () => (await readNote(note.id)).annotationStructure?.identity?.blocks?.length ?? 0).toBe(3);
  const before = await blockIds();
  const identity = (await readNote(note.id)).annotationStructure.identity;
  assert.deepEqual(identity.blocks.map(block => block.id), before);

  await openFresh(page, url);
  await expect(page.locator('[data-editor-ready="true"]')).toBeVisible();
  await expect(editor()).toContainText('补充');
  assert.deepEqual(await blockIds(), before);
});
