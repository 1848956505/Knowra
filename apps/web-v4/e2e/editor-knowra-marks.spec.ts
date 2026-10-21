import { expect } from '@playwright/test';
import { knowraCheck, parseKnowraMarks } from '@study-accelerator/shared/knowra-marks';
import { test } from './fixtures/syntheticTest';
import { mockEditorWorkspace } from './fixtures/editorWorkspace';
import { openEditorToolbarMenu } from '../../../scripts/test-support/editor-menu.mjs';

for (const mode of ['text', 'code'] as const) test(`内联重点复制（${mode}）：粘贴生成新重点，保存重载保持两个身份`, async ({ page, context }, info) => {
  const saved: string[] = [];
  const initial = mode === 'code' ? `<!--k a s=code r=0-3 h=${knowraCheck('abc')}-->\n~~~\nabc\n~~~`
    : '<mark data-k="a" data-t="key">abc</mark>';
  await mockEditorWorkspace(page, saved, [], initial);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/#/materials/notes/note-1');
  await expect(page.locator('[data-editor-ready]')).toHaveAttribute('data-editor-ready', 'true');
  const editor = page.locator('.ProseMirror');
  const text = mode === 'code' ? editor.locator('[data-code-block] code') : editor;
  await expect(editor.locator('mark[data-knowra-mark="a"]')).toHaveText('abc');
  await editor.focus();
  await editor.locator('mark[data-knowra-mark="a"]').evaluate(mark => {
    const range = document.createRange(); range.selectNodeContents(mark);
    const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
  });
  await page.keyboard.press('ControlOrMeta+c');
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('abc');
  await editor.locator('mark[data-knowra-mark="a"]').click();
  await page.keyboard.press('End');
  await page.keyboard.press('ControlOrMeta+v');
  await expect(text).toHaveText('abcabc');
  await expect(editor.locator('mark[data-knowra-mark]')).toHaveCount(2);
  await expect.poll(() => saved.length).toBeGreaterThan(0);
  const markdown = saved.at(-1)!;
  const parsed = parseKnowraMarks(markdown);
  const ids = (mode === 'code' ? parsed.blocks : parsed.inline).map(mark => mark.id);
  expect(ids).toHaveLength(2);
  expect(ids[0]).toBe('a');
  expect(ids[1]).not.toBe('a');
  await page.reload();
  await expect(page.locator('[data-editor-ready]')).toHaveAttribute('data-editor-ready', 'true');
  await expect(text).toHaveText('abcabc');
  expect(await editor.locator('mark[data-knowra-mark]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-knowra-mark')))).toEqual(ids);
  await info.attach('inline-mark-copy', { body: markdown, contentType: 'text/markdown' });
  await info.attach('inline-mark-copy-page', { body: await page.screenshot(), contentType: 'image/png' });
});

for (const mode of ['menu-native', 'native-menu'] as const) test(`重点部分剪切跨入口（${mode}）：保存重载仍属于原重点`, async ({ page, context }, info) => {
  const saved: string[] = [];
  await mockEditorWorkspace(page, saved, [], '<mark data-k="a">abc</mark>\n\n尾段');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/#/materials/notes/note-1');
  await expect(page.locator('[data-editor-ready]')).toHaveAttribute('data-editor-ready', 'true');
  const editor = page.locator('.ProseMirror');
  await editor.focus();
  await editor.locator('mark[data-knowra-mark="a"]').evaluate(mark => {
    const range = document.createRange(); range.setStart(mark.firstChild!, 1); range.setEnd(mark.firstChild!, 2);
    const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
  });
  if (mode === 'menu-native') {
    await openEditorToolbarMenu(page, '编辑');
    await page.getByRole('menuitem', { name: '剪切', exact: true }).click();
  } else await page.keyboard.press('ControlOrMeta+x');
  await expect(editor).toHaveText('ac尾段');
  await editor.locator(':scope > p').last().click();
  await page.keyboard.press('End');
  if (mode === 'native-menu') {
    await openEditorToolbarMenu(page, '编辑');
    await page.getByRole('menuitem', { name: '粘贴', exact: true }).click();
  } else await page.keyboard.press('ControlOrMeta+v');
  await expect(editor).toHaveText('ac尾段b');
  await expect.poll(() => parseKnowraMarks(saved.at(-1) ?? '').inline.map(mark => mark.id)).toEqual(['a', 'a']);
  await page.reload();
  await expect(page.locator('[data-editor-ready]')).toHaveAttribute('data-editor-ready', 'true');
  await expect(editor).toHaveText('ac尾段b');
  expect(await editor.locator('mark[data-knowra-mark]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-knowra-mark')))).toEqual(['a', 'a']);
  await info.attach('inline-mark-cut-move', { body: saved.at(-1)!, contentType: 'text/markdown' });
});

for (const mode of ['native', 'menu'] as const) test(`代码内普通文本粘贴（${mode}）：扩展原重点且不产生新重点`, async ({ page, context }) => {
  const saved: string[] = [];
  await mockEditorWorkspace(page, saved, [], `<!--k a s=code r=0-3 h=${knowraCheck('abc')}-->\n~~~\nabc\n~~~`);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/#/materials/notes/note-1');
  await expect(page.locator('[data-editor-ready]')).toHaveAttribute('data-editor-ready', 'true');
  const code = page.locator('.ProseMirror [data-code-block] code');
  await page.evaluate(() => navigator.clipboard.writeText('X'));
  await code.locator('mark[data-knowra-mark="a"]').click();
  const caretOffset = () => code.evaluate(element => {
    const selection = window.getSelection();
    if (!selection?.isCollapsed || !selection.focusNode || !element.contains(selection.focusNode)) return -1;
    const range = document.createRange(); range.selectNodeContents(element);
    range.setEnd(selection.focusNode, selection.focusOffset);
    return range.toString().length;
  });
  await page.keyboard.press('Home');
  await expect.poll(caretOffset).toBe(0);
  await page.keyboard.press('ArrowRight');
  await expect.poll(caretOffset).toBe(1);
  if (mode === 'native') await page.keyboard.press('ControlOrMeta+v');
  else {
    await openEditorToolbarMenu(page, '编辑');
    await page.getByRole('menuitem', { name: '粘贴', exact: true }).click();
  }
  await expect(code).toHaveText('aXbc');
  await expect(code.locator('mark[data-knowra-mark]')).toHaveCount(1);
  await expect.poll(() => parseKnowraMarks(saved.at(-1) ?? '').blocks.map(mark => mark.id)).toEqual(['a']);
  await page.reload();
  await expect(page.locator('[data-editor-ready]')).toHaveAttribute('data-editor-ready', 'true');
  await expect(code).toHaveText('aXbc');
  await expect(code.locator('mark[data-knowra-mark="a"]')).toHaveText('aXbc');
});
