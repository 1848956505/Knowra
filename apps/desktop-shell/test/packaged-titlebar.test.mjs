import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { _electron as electron, expect } from '@playwright/test';
import { executablePath } from './packaged-app-path.mjs';
import { closeTestApplication, launchTestApplication } from './app-lifecycle.mjs';

test('Mac 标题栏承载笔记标签，其他页面保留窗口拖动区域', { timeout: 60000 }, async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'knowra-titlebar-'));
  const app = await launchTestApplication(electron, {
    executablePath,
    env: { ...process.env, KNOWRA_DESKTOP_SMOKE_DIR: directory },
    timeout: 20000
  });
  t.after(async () => {
    await closeTestApplication(app);
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  const notes = await page.evaluate(async () => {
    const space = (await (await fetch('/api/knowledge/spaces/default', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
    })).json()).data;
    const created = [];
    for (const title of ['标题栏验收笔记', '第二篇笔记', ...Array.from({ length: 5 }, (_, index) => `溢出标签 ${index + 3}`)]) {
      created.push((await (await fetch('/api/knowledge/notes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spaceId: space.id, title, rawMarkdown: '正文' })
      })).json()).data);
    }
    return created;
  });
  assert.equal(notes.length, 7);
  await page.reload();
  await page.getByRole('button', { name: '打开 标题栏验收笔记', exact: true }).click();

  const titlebar = page.getByLabel('Mac 窗口标题栏');
  const tabs = titlebar.getByRole('tablist', { name: '打开的笔记' });
  await expect(tabs.getByRole('tab', { name: '标题栏验收笔记' })).toBeVisible();
  await expect(page.getByLabel('笔记编辑页面骨架')).toHaveAttribute('data-window-tabs', 'true');
  assert.equal(Math.round((await titlebar.boundingBox()).height), 34);
  const skipLink = page.getByRole('link', { name: '跳到主内容' });
  assert(await skipLink.evaluate(element => element.getBoundingClientRect().bottom <= 0));
  await skipLink.focus();
  assert((await skipLink.boundingBox()).y >= 34);
  assert((await tabs.boundingBox()).x >= 92);
  assert.equal(await titlebar.evaluate(element => getComputedStyle(element).getPropertyValue('-webkit-app-region')), 'drag');
  assert.equal(await tabs.getByRole('tab', { name: '标题栏验收笔记' }).evaluate(element => getComputedStyle(element).getPropertyValue('-webkit-app-region')), 'no-drag');
  await tabs.getByRole('button', { name: '查看全部标签页' }).click();
  await expect(page.getByRole('menu', { name: '全部标签页' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(tabs.getByRole('button', { name: '新建笔记' })).toBeVisible();
  await expect(page.locator('.ProseMirror')).toContainText('正文');

  await page.getByRole('button', { name: '知境工作区' }).click();
  await page.getByRole('button', { name: '打开 第二篇笔记', exact: true }).click();
  await expect(tabs.getByRole('tab', { name: '第二篇笔记' })).toBeVisible();
  await tabs.getByRole('tab', { name: '标题栏验收笔记' }).click();
  await expect(tabs.getByRole('tab', { name: '标题栏验收笔记' })).toHaveAttribute('aria-selected', 'true');
  const secondIndex = await tabs.getByRole('tab').evaluateAll(elements => elements.findIndex(element => element.getAttribute('aria-label') === '第二篇笔记'));
  await tabs.getByRole('tab', { name: '第二篇笔记' }).click({ button: 'right' });
  await expect(page.getByRole('menu', { name: '第二篇笔记' })).toBeVisible();
  await page.getByRole('menuitem', { name: secondIndex > 0 ? '向左移动标签' : '向右移动标签' }).click();
  await expect(tabs.getByRole('tab').nth(secondIndex > 0 ? secondIndex - 1 : secondIndex + 1)).toHaveAttribute('aria-label', '第二篇笔记');
  const draggedName = await tabs.getByRole('tab').first().getAttribute('aria-label');
  await tabs.locator('[draggable="true"]').first().dragTo(tabs.locator('[draggable="true"]').last());
  await expect(tabs.getByRole('tab').last()).toHaveAttribute('aria-label', draggedName);

  for (const item of notes.slice(2)) {
    await page.evaluate(id => { location.hash = `/materials/notes/${id}`; }, item.id);
    await expect(tabs.getByRole('tab', { name: item.title })).toBeVisible();
  }

  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(960, 700));
  await expect.poll(async () => (await titlebar.boundingBox()).width).toBe(960);
  await expect(tabs.getByRole('tab')).toHaveCount(7);
  assert(await tabs.evaluate(element => element.firstElementChild.scrollWidth > element.firstElementChild.clientWidth));
  await page.getByRole('button', { name: '切换检查器' }).click();
  const inspector = page.getByRole('complementary', { name: '文档检查器' });
  await expect(inspector).toBeVisible();
  assert((await inspector.boundingBox()).y >= (await titlebar.boundingBox()).height);
  await page.getByRole('button', { name: '切换专注模式' }).click();
  await expect(tabs).toBeVisible();
  await expect(page.getByRole('navigation', { name: '工作域导航' })).toHaveCount(0);
  await page.getByRole('button', { name: '切换专注模式' }).click();

  await tabs.getByRole('button', { name: '新建笔记' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');

  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setFullScreen(true));
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen())).toBe(true);
  await expect(tabs).toBeVisible();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setFullScreen(false));
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen())).toBe(false);

  await page.locator('.ProseMirror').click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.insertText(' 关闭前保存');
  await tabs.getByRole('button', { name: '关闭溢出标签 7' }).click();
  await expect(tabs.getByRole('tab', { name: '溢出标签 7' })).toHaveCount(0);
  const saved = await page.evaluate(async id => (await (await fetch(`/api/knowledge/notes/${id}`)).json()).data.rawMarkdown, notes.at(-1).id);
  assert(saved.includes('关闭前保存'));

  await page.getByRole('button', { name: '知境工作区' }).click();
  await expect(tabs.getByRole('tab')).toHaveCount(6);
  await expect(tabs.getByRole('tab', { name: '标题栏验收笔记' })).toHaveAttribute('aria-selected', 'false');
  await page.getByRole('button', { name: '知识', exact: true }).click();
  await expect(tabs.getByRole('tab')).toHaveCount(6);
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await expect(tabs.getByRole('tab')).toHaveCount(6);
  await tabs.getByRole('tab', { name: '标题栏验收笔记' }).click();
  await expect(page.getByLabel('笔记编辑页面骨架')).toBeVisible();
  await page.getByRole('button', { name: '知境工作区' }).click();
  await tabs.getByRole('tab', { name: '标题栏验收笔记' }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: '关闭其他标签页' }).click();
  await expect(tabs.getByRole('tab')).toHaveCount(1);
  await tabs.locator('[draggable="true"]').hover();
  await tabs.getByRole('button', { name: '关闭标题栏验收笔记' }).click();
  await expect(titlebar.getByRole('tablist', { name: '打开的笔记' })).toHaveCount(0);
  await expect(titlebar).toContainText('知境·Knowra');
});
