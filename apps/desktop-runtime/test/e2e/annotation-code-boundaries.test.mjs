import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { chromium, expect } from '@playwright/test';
import { createFileDataStore } from '../../../api/src/infrastructure/file-data-store.js';
import { createAppContext } from '../../../api/src/app.factory.js';
import { createServer } from '../../../api/src/server.js';
import { createV4WebServer } from '../../../web-v4/server/app.mjs';
import { projectMarkdown, anchorForBlock, anchorForSection, calculateContentHash } from '../../../../packages/content-anchor/src/index.js';

async function fixture(t, rawMarkdown, marked = true) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'knowra-code-boundary-'));
  const store = createFileDataStore(path.join(root, 'data.json'));
  const app = createAppContext({ dataStore: store, storageRootDir: root });
  const k = app.modules.knowledge;
  const space = k.knowledgeSpaceService.createDefaultKnowledgeSpace({ userId: 'demo' });
  const note = k.noteService.createNote({ title: '合成重点边界', spaceId: space.id, rawMarkdown });
  let annotation;
  if (marked) {
    const p = projectMarkdown(rawMarkdown), anchor = marked === 'section' ? anchorForSection(p, 0) : anchorForBlock(p, p.blocks.findIndex(block => block.type === 'code'));
    annotation = k.contentAnnotationService.createAnnotation({
      spaceId: space.id, noteId: note.id, schemaVersion: 2, scopeType: anchor.scopeType, anchor,
      quoteText: anchor.quoteText, fromPosition: anchor.sourceStart, toPosition: anchor.sourceEnd,
      anchorFingerprint: 'synthetic', noteContentHash: calculateContentHash(rawMarkdown),
      idempotencyKey: 'synthetic', importance: 'core', comment: '合成备注'
    });
  }
  const api = createServer({ appContext: app }); api.listen(0, '127.0.0.1'); await once(api, 'listening');
  const web = createV4WebServer({
    distRoot: fileURLToPath(new URL('../../../web-v4/dist/', import.meta.url)),
    getApiOrigin: () => `http://127.0.0.1:${api.address().port}`
  }); web.listen(0, '127.0.0.1'); await once(web, 'listening');
  const browser = await chromium.launch({ executablePath: process.env.KNOWRA_TEST_BROWSER_EXECUTABLE });
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => {
    await browser.close();
    await new Promise(resolve => web.close(resolve));
    await new Promise(resolve => api.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
    assert.deepEqual(errors, []);
  });
  await page.goto(`http://127.0.0.1:${web.address().port}/#/materials/notes/${note.id}`);
  const editor = page.locator('.ProseMirror');
  await expect(editor).toBeVisible();
  await expect(page.locator('[data-editor-ready="true"]')).toBeVisible();
  const annotations = () => k.contentAnnotationService.listAnnotationsByNote({ noteId: note.id });
  return { page, editor, k, note, annotation, annotations };
}

test('真实代码块：末尾换行后文字即时、保存、重开和撤销重做继承核心颜色', { timeout: 60000 }, async t => {
  const { page, editor, k, annotation } = await fixture(t, '## 合成章节\n\n```\n原始甲\n原始乙\n```\n\n尾段');
  const code = editor.locator('pre code');
  await code.evaluate(el => {
    const range = document.createRange(); range.selectNodeContents(el); range.collapse(false);
    el.closest('[contenteditable]').focus();
    window.getSelection().removeAllRanges(); window.getSelection().addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await page.keyboard.press('Enter');
  await page.keyboard.insertText('新增行');
  const highlighted = editor.locator(`[data-annotation-id="${annotation.id}"]`);
  await expect.poll(async () => (await highlighted.allTextContents()).join('')).toContain('新增行');
  await expect.poll(async () => (await highlighted.allTextContents()).join('')).toBe(await code.textContent());
  const color = await highlighted.first().evaluate(el => getComputedStyle(el).color);
  assert.ok(color && color !== ''); await expect(highlighted.first()).toHaveAttribute('data-importance', 'core');
  await expect.poll(() => k.contentAnnotationService.getAnnotation(annotation.id).quoteText).toContain('新增行');
  const saved = k.contentAnnotationService.getAnnotation(annotation.id);
  assert.equal(saved.id, annotation.id); assert.equal(saved.importance, 'core'); assert.equal(saved.comment, '合成备注');
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => k.contentAnnotationService.getAnnotation(annotation.id).quoteText).not.toContain('新增行');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect.poll(() => k.contentAnnotationService.getAnnotation(annotation.id).quoteText).toContain('新增行');
  await page.reload();
  await expect.poll(async () => (await highlighted.allTextContents()).join('')).toContain('新增行');
  assert.equal(await highlighted.first().evaluate(el => getComputedStyle(el).color), color);
  assert.equal(k.contentAnnotationService.getAnnotation(annotation.id).anchorStatus, 'resolved');
});

test('真实选区工具：普通、重点、核心直接创建，重开保留对应等级', { timeout: 60000 }, async t => {
  const { page, editor, annotations } = await fixture(t, '## 合成选区\n\n普通摘录\n\n重点摘录\n\n核心摘录', false);
  for (const [label, importance] of [['普通', 'normal'], ['重点', 'important'], ['核心', 'core']]) {
    const paragraph = editor.locator('p').filter({ hasText: label + '摘录' });
    await paragraph.evaluate(el => {
      const range = document.createRange(); range.selectNodeContents(el);
      el.closest('[contenteditable]').focus(); window.getSelection().removeAllRanges(); window.getSelection().addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
    });
    await page.getByRole('button', { name: `标记重点（${label}）`, exact: true }).click();
    await expect.poll(() => annotations().find(item => item.quoteText === label + '摘录')?.importance).toBe(importance);
  }
  await page.reload();
  assert.deepEqual(annotations().map(item => item.importance).sort(), ['core', 'important', 'normal']);
  await expect(editor.locator('[data-importance="core"]')).toHaveText('核心摘录');
});

test('真实章节：首尾空段与混合结构可创建和重开，同级标题仍是边界', { timeout: 60000 }, async t => {
  const markdown = '### 合成章节\n\n<br />\n\n开始\n\n* 甲\n* 乙\n\n> 引用\n\n***\n\n```\n\n代码\n\n```\n\n<br />\n\n### 同级边界\n\n相邻段';
  const { page, editor, annotations } = await fixture(t, markdown, false);
  await editor.locator('h3').first().hover();
  await page.getByRole('button', { name: '标题重点菜单', exact: true }).click();
  await page.getByRole('menuitem', { name: '标记本节为重点', exact: true }).hover();
  await page.getByRole('menuitem', { name: '重点', exact: true }).click();
  await expect.poll(() => annotations().length).toBe(1);
  const annotation = annotations()[0];
  assert.equal(annotation.importance, 'important'); assert.equal(annotation.scopeType, 'section');
  assert.ok(!annotation.quoteText.includes('同级边界'));
  await page.reload();
  await expect(editor.locator(`[data-annotation-id="${annotation.id}"]`).first()).toBeVisible();
  await expect(editor.locator('h3').last()).not.toHaveAttribute('data-annotation-id');
});

test('真实已保存章节：引用定义省略后重开仍标首个同名同文章节', { timeout: 60000 }, async t => {
  const markdown = '[甲]: https://example.com/a\n\n[乙]: https://example.com/b\n\n## 同名\n\n同文\n\n## 同名\n\n同文';
  const { page, editor, annotation } = await fixture(t, markdown, 'section');
  const selector = `[data-annotation-id="${annotation.id}"]`;
  await expect(editor.locator('h2').first().locator(selector)).toBeVisible();
  await expect(editor.locator('h2').last().locator(selector)).toHaveCount(0);
  await page.reload();
  await expect(editor.locator('h2').first().locator(selector)).toBeVisible();
  await expect(editor.locator('h2').last().locator(selector)).toHaveCount(0);
});

test('真实菜单：空行代码块通过悬停子菜单创建指定等级，右键卡片复用取消及撤销', { timeout: 60000 }, async t => {
  const { page, editor, annotations } = await fixture(t, '## 合成标题\n\n```\n\n合成内容\n\n```\n\n尾段', false);
  await editor.locator('pre code').hover();
  await page.getByRole('button', { name: '内容块重点菜单', exact: true }).click();
  await page.getByRole('menuitem', { name: '标记此块为重点', exact: true }).hover();
  await page.getByRole('menuitem', { name: '核心', exact: true }).click();
  await expect.poll(() => annotations().length).toBe(1);
  assert.equal(annotations()[0].quoteText, '\n合成内容\n'); assert.equal(annotations()[0].importance, 'core');
  await page.getByRole('button', { name: '切换文档检查器', exact: true }).click();
  await page.getByRole('tab', { name: '标注', exact: true }).click();
  const card = page.locator('[data-annotation-card-id]').first();
  await card.click({ button: 'right' });
  await page.getByRole('menuitem', { name: '取消重点', exact: true }).click();
  await expect.poll(() => annotations().length).toBe(0);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect.poll(() => annotations().length).toBe(1);
});
