import { expect, test, type Locator, type Page } from '@playwright/test';
import { mockEditorWorkspace, createNote } from './fixtures/editorWorkspace';

for (const key of ['Backspace', 'Delete']) {
  test(`V4-07 ${key} 删除文首空行时保留后续标题`, async ({ page }) => {
    const saved: string[] = [];
    await mockEditorWorkspace(page, saved, [], '# 1.0\n\n后续正文');
    await page.goto('/#/materials/notes/note-1');
    const editor = page.locator('.ProseMirror');
    const firstParagraph = editor.locator(':scope > p').first();
    await editor.locator(':scope > h1').first().click();
    await page.keyboard.press('Home');
    await page.keyboard.press('Enter');
    await expect(firstParagraph).toBeEmpty();
    await firstParagraph.evaluate((paragraph) => {
      (paragraph.closest('[contenteditable]') as HTMLElement).focus();
      const range = document.createRange();
      range.setStart(paragraph, 0);
      range.collapse(true);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
    });
    await expect.poll(() => editor.evaluate((element) => {
      const selection = window.getSelection();
      return selection?.anchorNode === element.firstElementChild && selection.anchorOffset === 0;
    })).toBe(true);
    await page.keyboard.press(key);
    await expect(editor.locator(':scope > :first-child')).toHaveText('1.0');
    expect(await editor.locator(':scope > :first-child').evaluate(element => element.tagName)).toBe('H1');
    await expect(editor).toContainText('后续正文');
    await expect.poll(() => saved.at(-1) ?? '').toMatch(/^# 1\.0/);
  });
}

test('V4-07 正文编辑、工具栏命令和自动保存形成闭环', async ({ page }) => {
  const savedMarkdown: string[] = [];
  const browserProblems: string[] = [];
  page.on('console', (message) => {
    if (['warning', 'error'].includes(message.type())) browserProblems.push(`${message.type()}: ${message.text()}`);
  });
  page.on('pageerror', (error) => browserProblems.push(`pageerror: ${error.message}`));
  await mockEditorWorkspace(page, savedMarkdown);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/#/materials/notes/note-1');

  await expect(page.getByRole('heading', { name: '编辑器验收笔记' })).toBeVisible();
  const editor = page.locator('.ProseMirror');
  await expect(editor).toContainText('已有正文');
  expect(savedMarkdown).toEqual([]);
  const cover = page.locator('[data-editor-cover]');
  await expect(cover).toHaveCSS('width', '72px');
  await expect(cover).toHaveCSS('height', '98px');
  await expect(cover).toHaveCSS('top', '-12px');
  await expect.poll(() => cover.evaluate((element) => getComputedStyle(element).boxShadow))
    .toContain('rgb(56, 189, 248) 5px 5px');
  const floatingToolbar = page.getByRole('toolbar', { name: '笔记格式工具栏' });
  await expect(floatingToolbar).toHaveCSS('margin-top', '24px');
  for (const name of ['文件', '段落', '编辑', '格式', '视图']) {
    await expect(floatingToolbar.getByRole('button', { name, exact: true })).toBeVisible();
  }
  await editor.click();
  expect(await editor.evaluate((element) => {
    const style = getComputedStyle(element);
    return { outline: style.outlineStyle, boxShadow: style.boxShadow };
  })).toEqual({ outline: 'none', boxShadow: 'none' });
  await page.keyboard.press('End');
  await page.keyboard.type(' 新增内容');
  await expect.poll(() => savedMarkdown.at(-1) ?? '').toContain('新增内容');

  await editor.click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await page.getByRole('button', { name: '一级标题' }).click();
  await expect.poll(() => savedMarkdown.at(-1) ?? '').toMatch(/^# /);

  await page.getByRole('button', { name: '查看全部标签页' }).click();
  await expect(page.getByRole('menu', { name: '全部标签页' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /编辑器验收笔记/ })).toBeVisible();
  await page.keyboard.press('Escape');

  const openFileMenu = async () => {
    await page.getByRole('toolbar', { name: '笔记格式工具栏' }).evaluate((toolbar) => {
      const stage = toolbar.closest('article')?.parentElement;
      if (!stage) return;
      stage.scrollTop = 500;
      stage.dispatchEvent(new Event('scroll'));
    });
    await page.getByRole('button', { name: '文件', exact: true }).click();
    await expect(page.getByRole('menu', { name: '文件', exact: true })).toBeVisible();
  };
  await openFileMenu();
  await expect(page.getByRole('menuitem', { name: '导入 Markdown' })).toBeEnabled();
  await expect(page.getByRole('menuitem', { name: '另存为' })).toBeEnabled();
  await expect(page.getByRole('menuitem', { name: '删除' })).toHaveAttribute('data-danger', 'true');
  await page.getByRole('menuitem', { name: '重命名' }).click();
  await expect(page.getByRole('textbox', { name: '笔记标题' })).toBeFocused();

  await openFileMenu();
  await page.waitForTimeout(800);
  const savedCount = savedMarkdown.length;
  await page.getByRole('menuitem', { name: '保存' }).click();
  await page.waitForTimeout(800);
  expect(savedMarkdown).toHaveLength(savedCount);

  await openFileMenu();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: '导出 Markdown' }).click();
  expect((await downloadPromise).suggestedFilename()).toBe('编辑器验收笔记.md');

  await openFileMenu();
  const pdfDownloadPromise = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: '导出 PDF' }).click();
  const pdfDownload = await pdfDownloadPromise;
  expect(pdfDownload.suggestedFilename()).toBe('编辑器验收笔记.pdf');
  const pdfStream = await pdfDownload.createReadStream();
  const firstPdfChunk = await new Promise<Buffer>((resolve, reject) => {
    pdfStream.once('data', (chunk) => resolve(Buffer.from(chunk)));
    pdfStream.once('error', reject);
  });
  expect(firstPdfChunk.subarray(0, 5).toString()).toBe('%PDF-');

  await openFileMenu();
  await page.getByRole('menuitem', { name: '新建文件夹' }).click();
  await expect(page.getByRole('dialog', { name: '新建文件夹' })).toBeVisible();
  await page.getByRole('button', { name: '取消' }).click();

  await openFileMenu();
  await page.getByRole('menuitem', { name: '删除' }).click();
  await expect(page.getByRole('dialog', { name: '删除笔记？' })).toBeVisible();
  await page.getByRole('button', { name: '取消' }).click();

  await openFileMenu();
  await page.getByRole('menuitem', { name: '另存为' }).click();
  await expect(page.getByRole('heading', { name: '编辑器验收笔记 Copy' })).toBeVisible();
  await page.screenshot({ path: 'e2e/visual-baseline/screenshots/v4-07-editor-1280.png', fullPage: false });

  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(2);
  expect(browserProblems).toEqual([]);
});

test('V4-07 保存冲突会暂停自动写入并保留可导出的本地草稿', async ({ page }) => {
  const savedMarkdown: string[] = [];
  await mockEditorWorkspace(page, savedMarkdown);
  await page.route('**/api/knowledge/notes/note-1', async (route) => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    await route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          code: 'NOTE_UPDATE_CONFLICT',
          message: 'Note has changed since it was loaded'
        }
      })
    });
  });
  await page.goto('/#/materials/notes/note-1');

  const editor = page.locator('.ProseMirror');
  await expect(editor).toContainText('已有正文');
  await editor.locator(':scope > p').first().click();
  await page.keyboard.press('End');
  await page.keyboard.type(' 本地冲突草稿');

  const alert = page.getByRole('alert');
  await expect(alert).toContainText('正文尚未保存');
  await expect(editor).toContainText('本地冲突草稿');
  expect(savedMarkdown).toEqual([]);

  const downloadPromise = page.waitForEvent('download');
  await alert.getByRole('button', { name: '导出本地草稿' }).click();
  expect((await downloadPromise).suggestedFilename()).toBe('编辑器验收笔记-冲突草稿.md');
  await page.setViewportSize({ width: 390, height: 760 });
  await expect(alert.getByRole('button', { name: '导出本地草稿' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
    .toBeLessThanOrEqual(2);
});

test('V4-07 连续输入只产生必要段落并在 IME 候选上屏后再保存', async ({ page }) => {
  const savedMarkdown: string[] = [];
  await mockEditorWorkspace(page, savedMarkdown);
  await page.goto('/#/materials/notes/note-1');

  const editor = page.locator('.ProseMirror');
  await expect(editor).toContainText('已有正文');
  await editor.click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await page.keyboard.type('第一段');
  await page.keyboard.press('Enter');
  await page.keyboard.type('第二段');

  await expect(editor.locator(':scope > p')).toHaveCount(2);
  await expect.poll(() => (savedMarkdown.at(-1) ?? '').trimEnd()).toBe('第一段\n\n第二段');
  expect(savedMarkdown.at(-1)).not.toMatch(/\n{4,}/);
  expect(savedMarkdown.at(-1)).not.toMatch(/(^|\n)\\($|\n)/);

  const savedCountBeforeComposition = savedMarkdown.length;
  await editor.evaluate((element) => {
    element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
  });
  await page.keyboard.type(' ni hao');
  await page.waitForTimeout(900);
  expect(savedMarkdown).toHaveLength(savedCountBeforeComposition);

  await editor.evaluate((element) => {
    element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '你好' }));
  });
  await expect.poll(() => savedMarkdown.at(-1) ?? '').toContain('ni hao');

  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await page.keyboard.type('- ');
  await page.keyboard.type('列表项');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('列表外正文');
  await expect(editor.locator('ul li')).toHaveCount(1);
  await expect(editor.locator(':scope > p').last()).toHaveText('列表外正文');
  await expect.poll(() => savedMarkdown.at(-1) ?? '').toContain('\n\n列表外正文');
});

test('V4-07 Typora 式 Markdown 输入规则可转换且可用退格退出结构', async ({ page }) => {
  const savedMarkdown: string[] = [];
  await mockEditorWorkspace(page, savedMarkdown, [], '');
  await page.goto('/#/materials/notes/note-1');

  const editor = page.locator('.ProseMirror');
  const replaceAllByTyping = async (markdown: string) => {
    await editor.click();
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
    await page.keyboard.type(markdown);
  };

  await replaceAllByTyping('# ');
  await expect(editor.locator(':scope > h1')).toHaveCount(1);
  await page.keyboard.press('Backspace');
  await expect(editor.locator(':scope > p')).toHaveCount(1);

  await replaceAllByTyping('- ');
  await expect(editor.locator('ul > li')).toHaveCount(1);
  await replaceAllByTyping('1. ');
  await expect(editor.locator('ol > li')).toHaveCount(1);
  await replaceAllByTyping('> ');
  await expect(editor.locator('blockquote')).toHaveCount(1);
  await replaceAllByTyping('- [ ] ');
  await expect(editor.locator('li[data-item-type="task"]')).toHaveCount(1);
  await replaceAllByTyping('``` ');
  await expect(editor.locator('pre')).toHaveCount(1);
  await replaceAllByTyping('**重点**');
  await expect(editor.locator('strong')).toHaveText('重点');
  await replaceAllByTyping('~~删除线~~');
  await expect(editor.locator('del')).toHaveText('删除线');
  await expect.poll(() => savedMarkdown.at(-1) ?? '').toContain('~~删除线~~');
});

test('V4-07 代码块保持 Typora 式插入与末尾点击行为', async ({ page }) => {
  const savedMarkdown: string[] = [];
  await mockEditorWorkspace(page, savedMarkdown, [], '已有正文');
  await page.goto('/#/materials/notes/note-1');

  const editor = page.locator('.ProseMirror');
  const paragraph = editor.locator(':scope > p').first();
  await paragraph.click();
  await page.keyboard.press('End');
  await page.getByRole('button', { name: '段落', exact: true }).click();
  await page.getByRole('menuitem', { name: '代码块', exact: true }).click();

  await expect(paragraph).toHaveText('已有正文');
  await expect(editor.locator(':scope > pre')).toHaveCount(1);
  await expect(editor.locator(':scope > p')).toHaveCount(2);
  expect(await editor.locator(':scope > *').evaluateAll((children) => (
    children.map((child) => child.tagName.toLowerCase())
  ))).toEqual(['p', 'pre', 'p']);
  await page.keyboard.type('const inserted = true');
  await expect(editor.locator(':scope > pre')).toContainText('const inserted = true');
  await expect.poll(() => savedMarkdown.at(-1) ?? '').toMatch(/^已有正文\n\n```\nconst inserted = true/);

  const codeOnlySavedMarkdown: string[] = [];
  await mockEditorWorkspace(page, codeOnlySavedMarkdown, [], '```js\nconst tail = true\n```');
  await page.reload();
  await expect(editor.locator(':scope > pre')).toHaveCount(1);
  await expect(editor.locator(':scope > p')).toHaveCount(0);

  const editorBox = await editor.boundingBox();
  const codeBlockBox = await editor.locator(':scope > pre').boundingBox();
  expect(editorBox).not.toBeNull();
  expect(codeBlockBox).not.toBeNull();
  await editor.click({
    position: {
      x: 20,
      y: Math.min(
        (editorBox?.height ?? 280) - 4,
        (codeBlockBox?.y ?? 0) - (editorBox?.y ?? 0) + (codeBlockBox?.height ?? 0) + 24
      )
    }
  });

  await expect(editor.locator(':scope > p')).toHaveCount(1);
  await page.keyboard.type('继续编辑');
  await expect(editor.locator(':scope > p').last()).toHaveText('继续编辑');
  await expect.poll(() => codeOnlySavedMarkdown.at(-1) ?? '').toContain('```\n\n继续编辑');
});

test('V4-07 段落菜单复用编辑器命令并通过现有保存链路持久化', async ({ page }) => {
  test.setTimeout(60_000);
  const savedMarkdown: string[] = [];
  await mockEditorWorkspace(page, savedMarkdown);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/#/materials/notes/note-1');

  const editor = page.locator('.ProseMirror');
  await expect(editor).toContainText('已有正文');
  await expect(editor.locator('xpath=ancestor::*[@data-editor-ready][1]')).toHaveAttribute('data-editor-ready', 'true');
  const firstParagraph = editor.locator(':scope > p').first();
  await firstParagraph.click();
  await firstParagraph.evaluate((paragraph) => {
    const selection = window.getSelection();
    const range = document.createRange();
    range.setStart(paragraph, 0);
    range.collapse(true);
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await page.keyboard.press('Tab');
  await page.keyboard.type('缩进验收');
  await expect(editor).toBeFocused();
  await expect.poll(() => firstParagraph.evaluate((paragraph) => paragraph.textContent ?? ''))
    .toBe('    缩进验收已有正文');
  await page.keyboard.press('Shift+Tab');
  await expect(editor).toBeFocused();
  await expect.poll(() => firstParagraph.evaluate((paragraph) => paragraph.textContent ?? ''))
    .toBe('缩进验收已有正文');
  await expect.poll(() => savedMarkdown.at(-1) ?? '').toContain('缩进验收已有正文');

  const selectFirstParagraph = async () => {
    await editor.locator('p').first().click({ clickCount: 3 });
    await pinEditorToolbar(page);
  };
  const chooseParagraphAction = async (name: string) => {
    await pinEditorToolbar(page);
    await page.getByRole('button', { name: '段落', exact: true }).click();
    await page.getByRole('menuitem', { name, exact: true }).click();
  };

  await selectFirstParagraph();
  await chooseParagraphAction('H4');
  await expect.poll(() => savedMarkdown.at(-1) ?? '').toMatch(/^#### 缩进验收已有正文/);

  await page.keyboard.press('Control+0');
  await expect.poll(() => savedMarkdown.at(-1) ?? '').not.toMatch(/^#### /);

  await editor.locator(':scope > p').first().evaluate((paragraph) => {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await pinEditorToolbar(page);
  await page.getByRole('button', { name: '格式', exact: true }).click();
  await page.getByRole('menuitem', { name: /^行内代码/ }).click();
  await expect.poll(() => savedMarkdown.at(-1) ?? '').toMatch(/^`缩进验收已有正文`/);
  await expect(editor.locator('p code').first()).toHaveCSS('background-color', 'rgb(243, 246, 255)');
  await pinEditorToolbar(page);
  await page.getByRole('button', { name: '格式', exact: true }).click();
  await page.getByRole('menuitem', { name: /^行内代码/ }).click();
  await expect.poll(() => savedMarkdown.at(-1) ?? '').not.toMatch(/^`缩进验收已有正文`/);

  await selectFirstParagraph();
  await chooseParagraphAction('无序列表');
  await expect.poll(() => savedMarkdown.at(-1) ?? '').toMatch(/^[*-] 缩进验收已有正文/);
  await expect(editor.locator('ul').first()).toHaveCSS('list-style-type', 'none');

  await chooseParagraphAction('有序列表');
  await expect.poll(() => savedMarkdown.at(-1) ?? '').toMatch(/^1\. 缩进验收已有正文/);
  await expect(editor.locator('ol > li').first()).toHaveCSS('counter-increment', 'knowra-ordered-item 1');
  await expect.poll(() => editor.locator('ol > li').first().evaluate((item) => (
    getComputedStyle(item, '::before').content
  ))).not.toBe('none');

  await chooseParagraphAction('有序列表');
  await expect.poll(() => savedMarkdown.at(-1) ?? '').not.toMatch(/^1\. /);

  await selectFirstParagraph();
  await chooseParagraphAction('任务列表');
  await expect.poll(() => savedMarkdown.at(-1) ?? '').toMatch(/^[*-] \[ \] 缩进验收已有正文/);
  await page.locator('li[data-item-type="task"]').first().click({ position: { x: 8, y: 8 } });
  await expect.poll(() => savedMarkdown.at(-1) ?? '').toMatch(/^[*-] \[x\] 缩进验收已有正文/i);

  await replaceEditorParagraph(page, editor, '引用验收');
  await chooseParagraphAction('引用块');
  await expect.poll(() => savedMarkdown.at(-1) ?? '').toContain('> 引用验收');

  await replaceEditorParagraph(page, editor, '代码验收');
  await chooseParagraphAction('代码块');
  await expect(editor.locator(':scope > p').first()).toHaveText('代码验收');
  await expect.poll(() => savedMarkdown.at(-1) ?? '').toContain('代码验收\n\n```');
  await expect(editor.locator('pre code').first()).toHaveText('');
  await expect(editor.locator('pre').first()).toHaveCSS('display', 'block');
  await expect(editor.locator('pre').first()).toHaveCSS('background-color', 'rgb(249, 246, 241)');
  await expect(editor.locator('pre code').first()).toHaveCSS('padding', '18px 20px');

  await replaceEditorParagraph(page, editor, '分割线验收');
  await chooseParagraphAction('分割线');
  await expect.poll(() => savedMarkdown.at(-1) ?? '').toMatch(/(?:^|\n)(?:---|\*\*\*)(?:\n|$)/);

  await replaceEditorParagraph(page, editor, '表格验收');
  await chooseParagraphAction('表格');
  await expect.poll(() => savedMarkdown.at(-1) ?? '').toMatch(/\|.*\|/);
  const firstTableCell = editor.locator('td, th').first();
  await firstTableCell.locator('p').click({ position: { x: 4, y: 4 } });
  await expect.poll(() => editor.evaluate(() => {
    const anchor = window.getSelection()?.anchorNode;
    const element = anchor instanceof Element ? anchor : anchor?.parentElement;
    return element?.closest('td, th')?.cellIndex ?? -1;
  })).toBe(0);
  // Native selectionchange is delivered after the DOM selection; let ProseMirror consume it before Tab.
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.keyboard.press('Tab');
  await expect(editor).toBeFocused();
  await expect.poll(() => editor.evaluate(() => {
    const anchor = window.getSelection()?.anchorNode;
    const element = anchor instanceof Element ? anchor : anchor?.parentElement;
    return element?.closest('td, th')?.cellIndex ?? -1;
  })).toBe(1);
  await page.keyboard.type('单元格导航');
  await expect(editor.locator('td, th').nth(1)).toContainText('单元格导航');
});

test('V4-07 格式菜单复用编辑器与内部链接保存链路', async ({ page }) => {
  test.setTimeout(60_000);
  const savedMarkdown: string[] = [];
  await mockEditorWorkspace(page, savedMarkdown);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/#/materials/notes/note-1');

  const editor = page.locator('.ProseMirror');
  await expect(editor).toContainText('已有正文');
  const selectFirstParagraph = async () => {
    await editor.locator(':scope > p').first().evaluate((paragraph) => {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(paragraph);
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
  };
  const openFormatMenu = async () => {
    await pinEditorToolbar(page);
    await page.getByRole('button', { name: '格式', exact: true }).click();
    await expect(page.getByRole('menu', { name: '格式', exact: true })).toBeVisible();
  };
  const runFormatAction = async (name: string | RegExp) => {
    await selectFirstParagraph();
    await openFormatMenu();
    await page.getByRole('menuitem', { name }).click();
  };

  await openFormatMenu();
  await expect(page.getByRole('menuitem', { name: '图片', exact: true })).toBeEnabled();
  for (const name of ['内部链接', '斜体', '删除线']) {
    await expect(page.getByRole('menuitem', { name, exact: true })).toBeEnabled();
  }
  for (const name of [/^加粗/, /^行内代码/, /^高亮/]) {
    await expect(page.getByRole('menuitem', { name })).toBeEnabled();
  }
  await page.keyboard.press('Escape');

  await runFormatAction(/^加粗/);
  await expect.poll(() => savedMarkdown.at(-1) ?? '').toMatch(/^\*\*已有正文\*\*/);
  await runFormatAction(/^加粗/);

  await runFormatAction('斜体');
  await expect.poll(() => savedMarkdown.at(-1) ?? '').toMatch(/^\*已有正文\*/);
  await runFormatAction('斜体');

  await runFormatAction('删除线');
  await expect.poll(() => savedMarkdown.at(-1) ?? '').toMatch(/^~~已有正文~~/);
  await expect(editor.locator('del').first()).toHaveCSS('text-decoration-line', 'line-through');
  await runFormatAction('删除线');

  await runFormatAction(/^高亮/);
  await expect.poll(() => savedMarkdown.at(-1) ?? '').toMatch(/^==已有正文==/);
  await expect(editor.locator('mark').first()).toBeVisible();
  await runFormatAction(/^高亮/);

  await runFormatAction('内部链接');
  const linkDialog = page.getByRole('dialog', { name: '插入笔记链接', exact: true });
  await linkDialog.getByRole('button', { name: '关联验收笔记 · 工作', exact: true }).click();
  await linkDialog.getByRole('button', { name: '确认', exact: true }).click();
  await expect.poll(() => savedMarkdown.at(-1) ?? '').toMatch(/^\[已有正文\]\(knowra:\/\/note\/note-2#ref=/);
  await expect(editor.locator('[data-note-link]').first()).toHaveText('已有正文');
});

test('V4-07 编辑器右键面板复用命令并处理二级菜单跨越与底部碰撞', async ({ page }) => {
  test.setTimeout(60_000);
  const savedMarkdown: string[] = [];
  const browserProblems: string[] = [];
  page.on('console', (message) => {
    if (['warning', 'error'].includes(message.type())) browserProblems.push(`${message.type()}: ${message.text()}`);
  });
  page.on('pageerror', (error) => browserProblems.push(`pageerror: ${error.message}`));
  await mockEditorWorkspace(page, savedMarkdown);
  await page.setViewportSize({ width: 1280, height: 640 });
  await page.goto('/#/materials/notes/note-1');

  const editor = page.locator('.ProseMirror');
  const firstParagraph = editor.locator(':scope > p').first();
  await firstParagraph.scrollIntoViewIfNeeded();
  await firstParagraph.evaluate((paragraph) => {
    const selection = window.getSelection();
    const range = document.createRange();
    const text = paragraph.firstChild;
    if (!text) return;
    range.setStart(text, 0);
    range.setEnd(text, Math.min(2, text.textContent?.length ?? 0));
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await firstParagraph.click({ button: 'right', position: { x: 20, y: 10 } });

  const contextMenu = page.getByRole('menu', { name: '编辑器右键快捷功能' });
  await expect(contextMenu).toBeVisible();
  await expect(contextMenu).toHaveCSS('border-top-width', '4px');
  const quickButtonBox = await contextMenu.getByRole('menuitem', { name: '剪切', exact: true }).boundingBox();
  expect(quickButtonBox?.height).toBeLessThanOrEqual(44);
  expect((await contextMenu.boundingBox())?.width).toBeLessThanOrEqual(280);
  for (const label of ['剪切', '复制', '粘贴', '删除', '加粗', '斜体', '高亮', '行内代码', '有序', '无序', '任务']) {
    await expect(contextMenu.getByRole('menuitem', { name: label, exact: true })).toBeEnabled();
  }
  await contextMenu.getByRole('menuitem', { name: '删除', exact: true }).click();
  await expect.poll(() => savedMarkdown.at(-1) ?? '').toMatch(/^正文/);

  await firstParagraph.evaluate((paragraph) => {
    const rect = paragraph.getBoundingClientRect();
    paragraph.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      button: 2,
      clientX: rect.left + 20,
      clientY: rect.top + 10
    }));
  });
  const headingTrigger = contextMenu.getByRole('menuitem', { name: '标题', exact: true });
  await headingTrigger.hover();
  const headingMenu = page.getByRole('menu', { name: '标题', exact: true });
  await expect(headingMenu).toBeVisible();

  const headingTriggerBox = await headingTrigger.boundingBox();
  const headingMenuBox = await headingMenu.boundingBox();
  expect(headingTriggerBox).not.toBeNull();
  expect(headingMenuBox).not.toBeNull();
  if (headingTriggerBox && headingMenuBox) {
    await page.mouse.move(headingTriggerBox.x + headingTriggerBox.width - 2, headingTriggerBox.y + headingTriggerBox.height / 2);
    await page.mouse.move(
      headingMenuBox.x + (headingMenuBox.x >= headingTriggerBox.x ? 2 : headingMenuBox.width - 2),
      headingMenuBox.y + 20,
      { steps: 8 }
    );
  }
  await expect(headingMenu).toBeVisible();
  await headingMenu.getByRole('menuitem', { name: /^H2/ }).click();
  await expect.poll(() => savedMarkdown.at(-1) ?? '').toMatch(/^## 正文/);

  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  await editor.locator(':scope > p').last().evaluate((paragraph, viewportHeight) => {
    const rect = paragraph.getBoundingClientRect();
    paragraph.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      button: 2,
      clientX: rect.left + 24,
      clientY: Number(viewportHeight) - 3
    }));
  }, viewport?.height ?? 640);
  await expect(contextMenu).toBeVisible();
  const bottomMenuBox = await contextMenu.boundingBox();
  expect(bottomMenuBox).not.toBeNull();
  if (bottomMenuBox && viewport) {
    expect(bottomMenuBox.y).toBeGreaterThanOrEqual(11);
    expect(bottomMenuBox.y + bottomMenuBox.height).toBeLessThanOrEqual(viewport.height - 11);
  }

  const insertTrigger = contextMenu.getByRole('menuitem', { name: '插入', exact: true });
  await insertTrigger.hover();
  const insertMenu = page.getByRole('menu', { name: '插入', exact: true });
  await expect(insertMenu).toBeVisible();
  await expect(insertMenu.getByRole('menuitem', { name: '图片', exact: true })).toBeEnabled();
  const insertMenuBox = await insertMenu.boundingBox();
  expect(insertMenuBox).not.toBeNull();
  if (insertMenuBox && viewport) {
    expect(insertMenuBox.y).toBeGreaterThanOrEqual(11);
    expect(insertMenuBox.y + insertMenuBox.height).toBeLessThanOrEqual(viewport.height - 11);
  }
  await page.screenshot({ path: 'e2e/visual-baseline/screenshots/v4-07-editor-context-menu-1280.png', fullPage: false });
  await insertMenu.getByRole('menuitem', { name: '水平分割线', exact: true }).click();
  await expect.poll(() => savedMarkdown.at(-1) ?? '').toMatch(/(?:^|\n)(?:---|\*\*\*)(?:\n|$)/);
  expect(browserProblems).toEqual([]);
});

test('V4-07 编辑菜单完成剪贴板、查找替换与历史命令闭环', async ({ page, context }) => {
  test.setTimeout(60_000);
  const savedMarkdown: string[] = [];
  const baseUrl = process.env.V4_BASE_URL ?? 'http://127.0.0.1:5173';
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(baseUrl).origin });
  await mockEditorWorkspace(page, savedMarkdown);
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.goto('/#/materials/notes/note-1');

  const editor = page.locator('.ProseMirror');
  const openEditMenu = async () => {
    await pinEditorToolbar(page);
    await page.getByRole('button', { name: '编辑', exact: true }).click();
    await expect(page.getByRole('menu', { name: '编辑', exact: true })).toBeVisible();
  };

  await openEditMenu();
  for (const label of ['撤销', '重做', '剪切', '复制', '粘贴', '查找', '替换', '全选']) {
    await expect(page.getByRole('menuitem', { name: label, exact: true })).toBeEnabled();
  }
  await page.getByRole('menuitem', { name: '全选', exact: true }).click();
  await openEditMenu();
  await page.getByRole('menuitem', { name: '复制', exact: true }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('验收段落 48');

  await page.evaluate(() => navigator.clipboard.writeText('\n粘贴验收'));
  await editor.locator(':scope > p').last().click();
  await page.keyboard.press('End');
  await openEditMenu();
  await page.getByRole('menuitem', { name: '粘贴', exact: true }).click();
  await expect.poll(() => savedMarkdown.at(-1) ?? '').toContain('粘贴验收');

  await editor.locator(':scope > p').first().evaluate((paragraph) => {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await openEditMenu();
  await page.getByRole('menuitem', { name: '剪切', exact: true }).click();
  await expect.poll(() => savedMarkdown.at(-1) ?? '').not.toMatch(/^已有正文/);

  await openEditMenu();
  await page.getByRole('menuitem', { name: '撤销', exact: true }).click();
  await expect.poll(() => savedMarkdown.at(-1) ?? '').toMatch(/^已有正文/);
  await openEditMenu();
  await page.getByRole('menuitem', { name: '重做', exact: true }).click();
  await expect.poll(() => savedMarkdown.at(-1) ?? '').not.toMatch(/^已有正文/);
  await openEditMenu();
  await page.getByRole('menuitem', { name: '撤销', exact: true }).click();

  await openEditMenu();
  await page.getByRole('menuitem', { name: '查找', exact: true }).click();
  const findPanel = page.getByRole('region', { name: '查找面板' });
  await findPanel.getByRole('textbox', { name: '查找内容' }).fill('验收段落 10');
  await findPanel.getByRole('button', { name: '下一处' }).click();
  await expect(findPanel.getByRole('status')).toHaveText('第 1 / 1 处');
  await expect(editor.locator('.editor-find-match-active')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(findPanel).toBeHidden();

  await openEditMenu();
  await page.getByRole('menuitem', { name: '替换', exact: true }).click();
  const replacePanel = page.getByRole('region', { name: '替换面板' });
  await replacePanel.getByRole('textbox', { name: '查找内容' }).fill('验收段落 10');
  await replacePanel.getByRole('textbox', { name: '替换为' }).fill('已替换段落');
  await replacePanel.getByRole('button', { name: '全部替换' }).click();
  await expect.poll(() => savedMarkdown.at(-1) ?? '').toContain('已替换段落');
  await expect(editor).not.toContainText('验收段落 10');
});

test('V4-07 原生粘贴保留语义并清理外部样式与不安全图片', async ({ page }) => {
  const savedMarkdown: string[] = [];
  await mockEditorWorkspace(page, savedMarkdown);
  await page.goto('/#/materials/notes/note-1');

  const editor = page.locator('.ProseMirror');
  const lastParagraph = editor.locator(':scope > p').last();
  await lastParagraph.click();
  await page.keyboard.press('End');
  await dispatchPaste(page, {
    html: '<p style="color: red; font-size: 40px"><strong>富文本验收</strong></p>',
    text: '富文本验收'
  });
  const richText = editor.locator('strong', { hasText: '富文本验收' });
  await expect(richText).toBeVisible();
  await expect(richText).not.toHaveAttribute('style');
  await expect.poll(() => savedMarkdown.at(-1) ?? '').toContain('**富文本验收**');

  await editor.locator(':scope > p').last().click();
  await page.keyboard.press('End');
  await dispatchPaste(page, {
    html: '<p>## Markdown 粘贴标题</p>',
    text: '## Markdown 粘贴标题'
  });
  await expect(editor.getByRole('heading', { level: 2, name: 'Markdown 粘贴标题' })).toBeVisible();
  await expect.poll(() => savedMarkdown.at(-1) ?? '').toContain('## Markdown 粘贴标题');

  const beforeBlockedPaste = savedMarkdown.at(-1);
  await dispatchPaste(page, {
    html: '<img src="http://example.com/insecure.png">',
    text: '![不安全图片](http://example.com/insecure.png)'
  });
  await expect(editor.locator('img')).toHaveCount(0);
  await page.waitForTimeout(900);
  expect(savedMarkdown.at(-1)).toBe(beforeBlockedPaste);
});

test('V4-07 跨段落选区在操作工具栏后仍保持并统一格式化', async ({ page }) => {
  const savedMarkdown: string[] = [];
  await mockEditorWorkspace(page, savedMarkdown);
  await page.goto('/#/materials/notes/note-1');

  const editor = page.locator('.ProseMirror');
  await editor.locator(':scope > p').nth(1).evaluate((secondParagraph) => {
    const firstParagraph = secondParagraph.previousElementSibling;
    const firstText = firstParagraph?.firstChild;
    const secondText = secondParagraph.firstChild;
    if (!firstText || !secondText) return;
    const range = document.createRange();
    range.setStart(firstText, 0);
    range.setEnd(secondText, secondText.textContent?.length ?? 0);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await page.getByRole('toolbar', { name: '笔记格式工具栏' }).getByRole('button', { name: '加粗', exact: true }).click();

  await expect(editor.locator(':scope > p').nth(0).locator('strong')).toHaveText('已有正文');
  await expect(editor.locator(':scope > p').nth(1).locator('strong')).toHaveText('验收段落 1');
  await expect.poll(() => savedMarkdown.at(-1) ?? '').toMatch(/^\*\*已有正文\*\*\n\n\*\*验收段落 1\*\*/);
});

test('V4-07 异常格式修复读取原始草稿并可一次撤销', async ({ page }) => {
  const malformedMarkdown = '第一段\n\n\n\\\n\n尾部';
  const savedMarkdown: string[] = [];
  await mockEditorWorkspace(page, savedMarkdown, [], malformedMarkdown);
  await page.goto('/#/materials/notes/note-1');

  const openEditMenu = async () => {
    await pinEditorToolbar(page);
    await page.getByRole('button', { name: '编辑', exact: true }).click();
    await expect(page.getByRole('menu', { name: '编辑', exact: true })).toBeVisible();
  };
  await openEditMenu();
  await page.getByRole('menuitem', { name: '检查异常格式', exact: true }).click();

  const dialog = page.getByRole('dialog', { name: '检查异常格式' });
  await expect(dialog).toContainText('可合并的多余空行：2');
  await expect(dialog).toContainText('可移除的独立反斜杠：1');
  await dialog.getByRole('button', { name: '应用修复' }).click();
  await expect.poll(() => (savedMarkdown.at(-1) ?? '').trimEnd()).toBe('第一段\n\n尾部');

  await openEditMenu();
  await page.getByRole('menuitem', { name: '撤销', exact: true }).click();
  await expect.poll(() => savedMarkdown.at(-1) ?? '').toContain('\\');
  await expect(page.locator('.ProseMirror')).toContainText('尾部');
});

test('V4-07 超长文档输入保持光标可见并按笔记恢复滚动位置', async ({ page }) => {
  test.setTimeout(60_000);
  const longMarkdown = Array.from({ length: 600 }, (_, index) => (
    `长文段落 ${index + 1} ${'稳定内容'.repeat(12)}`
  )).join('\n\n');
  const savedMarkdown: string[] = [];
  await mockEditorWorkspace(page, savedMarkdown, [], longMarkdown);
  await page.setViewportSize({ width: 1280, height: 700 });
  await page.goto('/#/materials/notes/note-1');

  const editor = page.locator('.ProseMirror');
  const scrollRoot = page.locator('[data-editor-scroll-root]');
  await expect(editor.locator(':scope > p')).toHaveCount(600);
  await expect(editor.locator('xpath=ancestor::*[@data-editor-ready][1]')).toHaveAttribute('data-editor-ready', 'true');
  const target = editor.locator(':scope > p').nth(449);
  await target.scrollIntoViewIfNeeded();
  await target.evaluate((paragraph) => {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);
    paragraph.closest<HTMLElement>('.ProseMirror')?.focus({ preventScroll: true });
  });
  await page.keyboard.type(' 长文追加');
  await expect.poll(() => savedMarkdown.at(-1) ?? '').toContain('长文追加');

  const editedScrollTop = await scrollRoot.evaluate((element) => element.scrollTop);
  expect(editedScrollTop).toBeGreaterThan(1000);
  const caretVisibility = await editor.evaluate((element) => {
    const anchor = window.getSelection()?.anchorNode;
    const caretBlock = (anchor instanceof Element ? anchor : anchor?.parentElement)?.closest('p, h1, h2, h3, h4, li, pre');
    const caret = caretBlock?.getBoundingClientRect();
    const scrollRoot = element.closest('[data-editor-scroll-root]');
    const viewport = scrollRoot?.getBoundingClientRect();
    return {
      visible: Boolean(caret && viewport && caret.bottom >= viewport.top && caret.top <= viewport.bottom),
      anchor: anchor?.textContent ?? null,
      focus: window.getSelection()?.focusNode?.textContent ?? null,
      collapsed: window.getSelection()?.isCollapsed ?? null,
      caret: caret ? { top: caret.top, bottom: caret.bottom } : null,
      viewport: viewport ? { top: viewport.top, bottom: viewport.bottom } : null,
      scrollTop: scrollRoot?.scrollTop ?? null,
      scrollHeight: scrollRoot?.scrollHeight ?? null
    };
  });
  expect(caretVisibility.visible, JSON.stringify(caretVisibility)).toBe(true);

  await page.getByRole('button', { name: '切换文档检查器' }).click();
  const scrollBeforeSwitch = await scrollRoot.evaluate((element) => element.scrollTop);
  await page.getByRole('complementary', { name: '文档检查器' })
    .getByRole('link', { name: '关联验收笔记' }).click();
  await expect(page.locator('.ProseMirror')).toContainText('第二篇正文');
  await expect.poll(() => scrollRoot.evaluate((element) => element.scrollTop)).toBeLessThan(80);

  await page.getByRole('tab', { name: '编辑器验收笔记', exact: true }).click();
  await expect(page.locator('.ProseMirror')).toContainText('长文追加');
  await expect(page.locator('.ProseMirror').locator('xpath=ancestor::*[@data-editor-ready][1]')).toHaveAttribute('data-editor-ready', 'true');
  await expect.poll(() => scrollRoot.evaluate((element) => element.scrollTop)).toBeGreaterThan(scrollBeforeSwitch - 80);
  await expect.poll(() => scrollRoot.evaluate((element) => element.scrollTop)).toBeLessThan(scrollBeforeSwitch + 80);
});

test('V4-07 在工具栏后方输入时只滚动到正文首个可见位置', async ({ page }) => {
  const savedMarkdown: string[] = [];
  const markdown = Array.from({ length: 36 }, (_, index) => `测试段落 ${index + 1}`).join('\n\n');
  await mockEditorWorkspace(page, savedMarkdown, [], markdown);
  await page.setViewportSize({ width: 1280, height: 700 });
  await page.goto('/#/materials/notes/note-1');
  const editor = page.locator('.ProseMirror');
  await expect(editor.locator(':scope > p')).toHaveCount(36);
  await expect(editor.locator('xpath=ancestor::*[@data-editor-ready][1]')).toHaveAttribute('data-editor-ready', 'true');
  const target = editor.locator(':scope > p').nth(6);
  const before = await target.evaluate((paragraph) => {
    const stage = paragraph.closest<HTMLElement>('[data-editor-scroll-root]')!;
    stage.scrollTop += paragraph.getBoundingClientRect().top - stage.getBoundingClientRect().top + 4;
    paragraph.closest<HTMLElement>('.ProseMirror')!.focus({ preventScroll: true });
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    range.collapse(false);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    return stage.scrollTop;
  });
  await page.keyboard.type('z');
  await expect(target).toContainText('z');
  const position = await target.evaluate((paragraph) => {
    const stage = paragraph.closest<HTMLElement>('[data-editor-scroll-root]')!;
    const toolbar = stage.querySelector<HTMLElement>('[role="toolbar"][aria-label="笔记格式工具栏"]')!;
    return { top: paragraph.getBoundingClientRect().top, toolbarBottom: toolbar.getBoundingClientRect().bottom, stageTop: stage.getBoundingClientRect().top, scrollTop: stage.scrollTop };
  });
  expect(position.top, JSON.stringify(position)).toBeGreaterThanOrEqual(Math.max(position.stageTop, position.toolbarBottom) - 4);
  expect(position.top, JSON.stringify(position)).toBeLessThan(Math.max(position.stageTop, position.toolbarBottom) + 54);
  expect(before - position.scrollTop, JSON.stringify(position)).toBeLessThan(160);
});

test('V4-07 Mac 笔记快捷键可执行格式、段落与查找', async ({ page }) => {
  await mockEditorWorkspace(page, [], [], '格式测试\n\n引用测试');
  await page.goto('/#/materials/notes/note-1');
  const editor = page.locator('.ProseMirror');
  await expect(editor.locator(':scope > p')).toHaveCount(2);
  await editor.locator(':scope > p').first().click({ clickCount: 3 });
  await page.keyboard.press('Meta+i');
  await expect(editor.locator(':scope > p em')).toHaveText('格式测试');
  await page.keyboard.press('Meta+Alt+q');
  await expect(editor.locator(':scope > blockquote')).toContainText('格式测试');
  await page.keyboard.press('Meta+f');
  await expect(page.getByRole('region', { name: '查找面板' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(editor).toBeFocused();
  await page.keyboard.press('Meta+h');
  await expect(page.getByRole('region', { name: '替换面板' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(editor).toBeFocused();
  const fileChooser = page.waitForEvent('filechooser');
  await page.keyboard.press('Meta+Control+i');
  expect((await fileChooser).isMultiple()).toBe(false);
});

test('V4-07 视图菜单统一控制阅读、编辑、专注、双侧栏与源码模式', async ({ page }) => {
  test.setTimeout(60_000);
  const savedMarkdown: string[] = [];
  await mockEditorWorkspace(page, savedMarkdown);
  await page.setViewportSize({ width: 1280, height: 700 });
  await page.goto('/#/materials/notes/note-1');

  const editor = page.locator('.ProseMirror');
  await editor.locator(':scope > p').first().click();
  await page.keyboard.press('End');
  const openViewMenu = async () => {
    await pinEditorToolbar(page);
    await page.getByRole('button', { name: '视图', exact: true }).click();
    await expect(page.getByRole('menu', { name: '视图', exact: true })).toBeVisible();
  };

  await openViewMenu();
  for (const label of ['阅读模式', '编辑模式', '专注模式', '隐藏左侧目录区', '显示右侧辅助区', '显示源码编辑器']) {
    await expect(page.getByRole('menuitem', { name: label, exact: true })).toBeEnabled();
  }

  await page.getByRole('menuitem', { name: '阅读模式', exact: true }).click();
  await expect(editor).toHaveAttribute('contenteditable', 'false');
  await expect(page.getByRole('textbox', { name: '笔记标题' })).toHaveAttribute('readonly');
  await editor.evaluate((element) => { element.setAttribute('data-runtime-marker', 'preserved'); });

  await openViewMenu();
  await page.getByRole('menuitem', { name: '编辑模式', exact: true }).click();
  await expect(editor).toHaveAttribute('contenteditable', 'true');
  await expect(editor).toHaveAttribute('data-runtime-marker', 'preserved');
  await editor.focus();
  await page.keyboard.type(' 选区保持');
  await expect(editor.locator(':scope > p').first()).toHaveText('已有正文 选区保持');

  await openViewMenu();
  await page.getByRole('menuitem', { name: '隐藏左侧目录区', exact: true }).click();
  await expect(page.getByRole('complementary', { name: '笔记上下文导航' })).toHaveCount(0);
  await openViewMenu();
  await page.getByRole('menuitem', { name: '显示左侧目录区', exact: true }).click();
  await expect(page.getByRole('complementary', { name: '笔记上下文导航' })).toBeVisible();

  await openViewMenu();
  await page.getByRole('menuitem', { name: '显示右侧辅助区', exact: true }).click();
  await expect(page.getByRole('complementary', { name: '文档检查器' })).toBeVisible();
  await openViewMenu();
  await page.getByRole('menuitem', { name: '隐藏右侧辅助区', exact: true }).click();
  await expect(page.getByRole('complementary', { name: '文档检查器' })).toBeHidden();

  await openViewMenu();
  await page.getByRole('menuitem', { name: '显示源码编辑器', exact: true }).click();
  const source = page.getByRole('textbox', { name: 'Markdown 源码编辑器' });
  await expect(source).toBeVisible();
  await source.fill('# 源码模式验收\n\n正文同步');
  await expect(editor).toContainText('源码模式验收');
  await expect.poll(() => savedMarkdown.at(-1) ?? '').toContain('正文同步');
  await page.getByRole('button', { name: '保存源码' }).click();

  await openViewMenu();
  await page.getByRole('menuitem', { name: '隐藏源码编辑器', exact: true }).click();
  await expect(source).toHaveCount(0);

  await openViewMenu();
  await page.getByRole('menuitem', { name: '专注模式', exact: true }).click();
  await expect(page.getByRole('navigation', { name: '工作域导航' })).toHaveCount(0);
  await expect(page.getByRole('complementary', { name: '笔记上下文导航' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '切换专注模式' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '切换专注模式' }).click();
  await expect(page.getByRole('navigation', { name: '工作域导航' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: '笔记上下文导航' })).toBeVisible();
});

test('V4-07 文档检查器呈现真实信息并保证切换笔记时草稿不串写', async ({ page }) => {
  test.setTimeout(60_000);
  const savedMarkdown: string[] = [];
  const savedRequests: Array<{ noteId: string; markdown: string }> = [];
  await mockEditorWorkspace(page, savedMarkdown, savedRequests);
  await page.setViewportSize({ width: 1280, height: 760 });
  await page.goto('/#/materials/notes/note-1');

  const noteTabs = page.getByRole('tablist', { name: '打开的笔记' });
  const closedTabsWidth = (await noteTabs.boundingBox())?.width ?? 0;
  await page.getByRole('button', { name: '切换文档检查器' }).click();
  const inspector = page.getByRole('complementary', { name: '文档检查器' });
  await expect(inspector).toBeVisible();
  const contextSidebar = page.getByRole('complementary', { name: '笔记上下文导航' });
  const moduleRail = page.getByRole('navigation', { name: '工作域导航' });
  await expect.poll(async () => ({
    inspector: (await inspector.boundingBox())?.width ?? 0,
    rail: (await moduleRail.boundingBox())?.width ?? 0,
    context: (await contextSidebar.boundingBox())?.width ?? 0,
    tabs: closedTabsWidth - ((await noteTabs.boundingBox())?.width ?? 0)
  })).toEqual({ inspector: 288, rail: 64, context: 224, tabs: 288 });
  await expect.poll(async () => {
    const [inspectorBox, tabsBox, contextBox] = await Promise.all([
      inspector.boundingBox(),
      page.getByRole('tablist', { name: '打开的笔记' }).boundingBox(),
      contextSidebar.boundingBox()
    ]);
    if (!inspectorBox || !tabsBox || !contextBox) return null;
    return {
      alignedTop: Math.abs(inspectorBox.y - contextBox.y) <= 1,
      adjacentTabs: Math.abs(inspectorBox.x - (tabsBox.x + tabsBox.width)) <= 1
    };
  }).toEqual({ alignedTop: true, adjacentTabs: true });
  await expect.poll(async () => ({
    inspector: await inspector.evaluate((element) => getComputedStyle(element).backgroundColor),
    header: await inspector.locator('header').evaluate((element) => getComputedStyle(element).backgroundColor)
  })).toEqual({ inspector: 'rgb(249, 247, 242)', header: 'rgb(249, 247, 242)' });
  await expect(inspector.getByRole('tablist', { name: '检查器视图' })).toBeVisible();
  for (const name of ['信息', '大纲', '链接', '记录', 'AI']) {
    await expect(inspector.getByRole('tab', { name, exact: true })).toBeVisible();
  }
  await expect(page.getByRole('tablist', { name: '打开的笔记' })).toHaveCSS('background-color', 'rgb(249, 247, 242)');
  await expect(contextSidebar).toHaveCSS('background-color', 'rgb(249, 247, 242)');
  expect(await page.locator('article[data-pdf-document]').evaluate((paper) => {
    const stage = paper.parentElement;
    if (!stage) return Infinity;
    return Math.round((stage.clientWidth - paper.getBoundingClientRect().width) / 2);
  })).toBeLessThanOrEqual(20);
  await expect(inspector.getByText('Markdown 文档')).toBeVisible();
  await expect(inspector.getByText('工作')).toBeVisible();
  await expect(inspector.getByText('待整理')).toBeVisible();
  await expect(inspector.getByText('学习')).toBeVisible();
  await expect(inspector.getByText('AI', { exact: true }).last()).toBeVisible();

  const editor = page.locator('.ProseMirror');
  await editor.locator(':scope > p').first().click();
  await page.keyboard.press('End');
  await page.keyboard.type(' 仅属于第一篇');
  await inspector.getByRole('link', { name: '关联验收笔记' }).click();

  await expect(page.getByRole('heading', { name: '关联验收笔记', level: 1 })).toBeVisible();
  await expect(page.locator('.ProseMirror')).toContainText('第二篇正文');
  await expect.poll(() => savedRequests.some((entry) => (
    entry.noteId === 'note-1' && entry.markdown.includes('仅属于第一篇')
  ))).toBe(true);
  expect(savedRequests.some((entry) => (
    entry.noteId === 'note-2' && entry.markdown.includes('仅属于第一篇')
  ))).toBe(false);

  await page.goto('/#/materials/notes/note-1');
  const screenshotInspector = page.locator('aside[aria-label="文档检查器"]');
  if (!await screenshotInspector.isVisible()) {
    await page.getByRole('button', { name: '切换文档检查器' }).click();
  }
  await expect(screenshotInspector).toBeVisible();
  await page.screenshot({ path: 'e2e/visual-baseline/screenshots/v4-07-editor-inspector-1280.png', fullPage: false });
  await page.setViewportSize({ width: 390, height: 760 });
  await expect.poll(async () => (await screenshotInspector.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(389);
  await expect.poll(async () => {
    const [inspectorBox, editorBox] = await Promise.all([
      screenshotInspector.boundingBox(),
      page.getByRole('region', { name: '笔记编辑页面骨架' }).boundingBox()
    ]);
    return inspectorBox && editorBox ? Math.abs(inspectorBox.y - editorBox.y) : Infinity;
  }).toBeLessThanOrEqual(1);
});

test('V4-07 宽屏打开检查器不缩小纸张', async ({ page }) => {
  await mockEditorWorkspace(page, []);
  await page.setViewportSize({ width: 1920, height: 900 });
  await page.goto('/#/materials/notes/note-1');
  const paper = page.locator('article[data-pdf-document]');
  await expect(paper).toBeVisible();
  const before = (await paper.boundingBox())?.width;
  await page.getByRole('button', { name: '切换文档检查器' }).click();
  await expect(page.getByRole('complementary', { name: '文档检查器' })).toBeVisible();
  const after = (await paper.boundingBox())?.width;
  expect(before).toBe(960);
  expect(after).toBe(before);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(2);
});

test('V4-07 大纲保留标题层级并精确跳转到重复标题', async ({ page }) => {
  const markdown = [
    '# 重复标题',
    ...Array.from({ length: 28 }, (_, index) => `前置段落 ${index + 1} ${'填充内容'.repeat(10)}`),
    '```md',
    '## 代码块内标题',
    '```',
    '## 重复标题',
    '### 深层标题',
    '尾部正文'
  ].join('\n\n');
  await mockEditorWorkspace(page, [], [], markdown);
  await page.setViewportSize({ width: 1280, height: 700 });
  await page.goto('/#/materials/notes/note-1');
  await expect(page.locator('[data-editor-ready]')).toHaveAttribute('data-editor-ready', 'true');

  await page.getByRole('button', { name: '切换文档检查器' }).click();
  const inspector = page.getByRole('complementary', { name: '文档检查器' });
  await inspector.getByRole('tab', { name: '大纲' }).click();
  await expect(inspector.getByText('DOCUMENT OUTLINE')).toHaveCount(0);
  await expect(inspector.getByRole('heading', { name: '本页大纲' })).toHaveCount(0);
  await expect(inspector.getByRole('button', { name: '跳转到「代码块内标题」，H2' })).toHaveCount(0);

  await inspector.getByRole('button', { name: '跳转到「重复标题」，H2' }).click();
  await expect.poll(() => page.locator('.ProseMirror').evaluate((editor) => {
    const selection = window.getSelection();
    const anchor = selection?.anchorNode;
    const element = anchor instanceof Element ? anchor : anchor?.parentElement;
    const heading = element?.closest('h2');
    const stage = editor.closest<HTMLElement>('[data-editor-scroll-root]');
    const headingBox = heading?.getBoundingClientRect();
    const stageBox = stage?.getBoundingClientRect();
    return {
      focused: document.activeElement === editor,
      text: heading?.textContent ?? '',
      visible: Boolean(headingBox && stageBox && headingBox.top >= stageBox.top && headingBox.top < stageBox.bottom)
    };
  })).toEqual({ focused: true, text: '重复标题', visible: true });
});

test('V4-07 Markdown 导入复用后端批量能力并打开首篇笔记', async ({ page }) => {
  await mockEditorWorkspace(page, []);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/#/materials/notes/note-1');
  await expect(page.getByRole('heading', { name: '编辑器验收笔记' })).toBeVisible();
  await expect(page.locator('.ProseMirror')).toContainText('已有正文');
  await page.getByRole('toolbar', { name: '笔记格式工具栏' }).evaluate((toolbar) => {
    const stage = toolbar.closest('article')?.parentElement;
    if (!stage) return;
    stage.scrollTop = 500;
    stage.dispatchEvent(new Event('scroll'));
  });
  await page.getByRole('button', { name: '文件', exact: true }).click();
  await page.getByRole('menuitem', { name: '导入 Markdown' }).click();

  const dialog = page.getByRole('dialog', { name: '导入 Markdown' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('拖放 Markdown 文件到这里').setInputFiles([
    { name: 'first.md', mimeType: 'text/markdown', buffer: Buffer.from('# 导入验收一\n\n正文') },
    { name: 'second.markdown', mimeType: 'text/markdown', buffer: Buffer.from('# 导入验收二') }
  ]);
  await dialog.getByRole('button', { name: '导入 2 篇' }).click();
  await expect(page.locator('#note-editor-title')).toHaveText('导入验收一');
});

test('V4-07 代码语言、逐行编辑、原文复制与保存回读', async ({ page, context }) => {
  const saved: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await mockEditorWorkspace(page, saved, [], '```python\n    first\n    second\n```');
  await page.goto('/#/materials/notes/note-1');
  const editor = page.locator('.ProseMirror');
  const code = editor.locator('pre > code');
  await expect(code).toHaveText('    first\n    second');
  const language = page.getByRole('textbox', { name: '代码语言', exact: true });
  await expect(language).toHaveValue('python');
  await language.fill('c++');
  await language.press('Enter');
  await expect.poll(() => saved.at(-1)).toContain('```c++');
  await code.evaluate((element) => {
    const text = element.firstChild;
    if (!text?.textContent) throw new Error('代码块缺少文本节点');
    element.closest<HTMLElement>('.ProseMirror')?.focus();
    const range = document.createRange();
    range.setStart(text, text.textContent.length);
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+Tab');
  await expect.poll(() => code.textContent()).toBe('    first\nsecond');
  await page.keyboard.press('Tab');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('third');
  await expect.poll(() => code.textContent()).toBe('    first\n    second\n    third');
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => code.textContent()).not.toContain('third');
  // Code paste must bypass Markdown parsing, including fences and headings.
  await page.evaluate(() => navigator.clipboard.writeText('# literal\n```js\n**text**'));
  await page.keyboard.press('ControlOrMeta+v');
  await expect(code).toContainText('# literal\n```js\n**text**');
  await page.evaluate(() => navigator.clipboard.writeText('\n# 菜单粘贴\n    raw'));
  await pinEditorToolbar(page);
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  await page.getByRole('menuitem', { name: '粘贴', exact: true }).click();
  await expect(code).toContainText('\n# 菜单粘贴\n    raw');
  await expect(editor.locator('h1')).toHaveCount(0);
  await page.getByRole('button', { name: '复制代码', exact: true }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(await code.textContent());
  const expected = await code.textContent();
  await page.getByRole('button', { name: '在下方继续', exact: true }).click();
  await page.keyboard.type('正文继续');
  await expect(editor.locator(':scope > p')).toHaveText('正文继续');
  await expect.poll(() => saved.at(-1)).toContain('正文继续');
  await page.reload();
  await expect(code).toHaveText(expected!);
  await expect(language).toHaveValue('c++');
  await expect(editor.locator(':scope > p')).toHaveText('正文继续');
  await pinEditorToolbar(page);
  await page.getByRole('button', { name: '视图', exact: true }).click();
  await page.getByRole('menuitem', { name: '阅读模式', exact: true }).click();
  await expect(language).toBeDisabled();
  await expect(page.getByRole('button', { name: '在下方继续', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '复制代码', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '视图', exact: true }).click();
  await page.getByRole('menuitem', { name: '编辑模式', exact: true }).click();
  await expect(language).toBeEnabled();
  expect(errors).toEqual([]);
});

test('V4-07 围栏输入支持语言符号且长代码随宽度软换行', async ({ page, context }) => {
  const saved: string[] = [];
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await mockEditorWorkspace(page, saved, [], '');
  await page.setViewportSize({ width: 600, height: 800 });
  await page.goto('/#/materials/notes/note-1');
  const editor = page.locator('.ProseMirror');
  await editor.click();
  await page.keyboard.type('```c++');
  await page.keyboard.press('Enter');
  const code = editor.locator('pre > code');
  await expect(code).toBeVisible();
  await page.keyboard.type('x'.repeat(300));
  await expect(code).toHaveText('x'.repeat(300));
  await expect.poll(() => saved.at(-1) ?? '').toContain(`\n${'x'.repeat(300)}\n`);
  const originalMarkdown = saved.at(-1);
  const layout = async () => code.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    return { lines: range.getClientRects().length, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth };
  });
  const narrow = await layout();
  expect(narrow.lines).toBeGreaterThan(1);
  expect(narrow.scrollWidth).toBeLessThanOrEqual(narrow.clientWidth + 1);
  await page.setViewportSize({ width: 1280, height: 800 });
  const wide = await layout();
  expect(wide.lines).toBeLessThan(narrow.lines);
  expect(wide.scrollWidth).toBeLessThanOrEqual(wide.clientWidth + 1);
  await page.setViewportSize({ width: 600, height: 800 });
  expect((await layout()).lines).toBe(narrow.lines);
  expect(saved.at(-1)).toBe(originalMarkdown);
  await page.getByRole('button', { name: '复制代码', exact: true }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('x'.repeat(300));
  expect(await editor.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await page.getByRole('button', { name: '在下方继续', exact: true }).click();
  await page.keyboard.type('after');
  await expect(editor.locator(':scope > p')).toHaveText('after');
});

test('V4-07 代码块内 ⌘A 仅选当前代码，正文 ⌘A 仍选整篇笔记', async ({ page }) => {
  const codeText = 'first line\nsecond line';
  await mockEditorWorkspace(page, [], [], `正文之前\n\n\`\`\`python\n${codeText}\n\`\`\`\n\n正文之后\n\n\`\`\`js\nother block\n\`\`\``);
  await page.goto('/#/materials/notes/note-1');
  const editor = page.locator('.ProseMirror');
  const code = editor.locator('pre[data-code-block] > code').first();
  await expect(code).toHaveText(codeText);
  await code.evaluate((element) => {
    element.closest<HTMLElement>('.ProseMirror')?.focus({ preventScroll: true });
    const range = document.createRange();
    range.setStart(element.firstChild!, 2);
    range.setEnd(element.firstChild!, 5);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
  });
  const selectedText = () => page.evaluate(() => window.getSelection()?.toString() ?? '');
  await expect.poll(selectedText).toBe('rst');
  await page.keyboard.press('Meta+a');
  await expect.poll(selectedText).toBe(codeText);
  await page.keyboard.press('Meta+a');
  await expect.poll(selectedText).toBe(codeText);
  await editor.locator('pre[data-code-block] > code').last().click();
  await page.keyboard.press('Meta+a');
  await expect.poll(selectedText).toBe('other block');
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  await page.getByRole('menuitem', { name: '全选', exact: true }).click();
  await expect.poll(selectedText).toBe('other block');
  await editor.locator(':scope > p').first().click();
  await page.keyboard.press('Meta+a');
  await expect.poll(selectedText).toContain('正文之前');
  await expect.poll(selectedText).toContain('正文之后');
  await expect.poll(selectedText).toContain('other block');
});

test('V4-07 参考样式代码块支持空块删除与非空行插入', async ({ page }) => {
  const saved: string[] = [];
  await mockEditorWorkspace(page, saved, [], '保留当前行');
  await page.goto('/#/materials/notes/note-1');
  const editor = page.locator('.ProseMirror');
  await editor.locator('p').click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await page.keyboard.press('ControlOrMeta+Alt+c');
  const block = editor.locator('pre');
  await expect(editor.locator('p').first()).toHaveText('保留当前行');
  await expect(block.locator('code')).toHaveText('');
  await expect(block).toHaveCSS('border-left-color', 'rgb(35, 35, 35)');
  await expect(block).toHaveCSS('background-color', 'rgb(249, 246, 241)');
  await expect.poll(() => block.evaluate(el => getComputedStyle(el).boxShadow)).toContain('4px 4px 0px');
  await expect(block.locator('[data-code-toolbar]')).toHaveCSS('border-bottom-width', '1px');
  await expect(page.getByRole('textbox', { name: '代码语言', exact: true })).toHaveCSS('background-color', 'rgb(255, 254, 253)');
  await block.screenshot({ path: '/tmp/knowra-code-block-inset.png' });
  await page.keyboard.press('Backspace');
  await expect(block).toHaveCount(0);
  await page.keyboard.type('删除后可输入');
  await expect(editor).toContainText('删除后可输入');
  await page.keyboard.press('ControlOrMeta+z');
  await page.keyboard.press('ControlOrMeta+z');
  // Return to a fresh empty block and verify forward deletion too.
  await editor.locator('p').first().click();
  await page.keyboard.press('End');
  await page.keyboard.press('ControlOrMeta+Alt+c');
  await expect(block).toHaveCount(1);
  await page.keyboard.press('Delete');
  await expect(block).toHaveCount(0);
  await editor.locator('p').first().click();
  await page.keyboard.press('End');
  await page.keyboard.press('ControlOrMeta+Alt+c');
  await block.locator('code').click({ button: 'right' });
  await page.getByRole('menuitem', { name: '删除', exact: true }).click();
  await expect(block).toHaveCount(0);
  await editor.locator('p').first().click();
  await page.keyboard.press('End');
  await page.keyboard.press('ControlOrMeta+Alt+c');
  await page.keyboard.type('const value = 1');
  await expect(block.locator('code')).toHaveText('const value = 1');
  await page.keyboard.press('ControlOrMeta+Alt+c');
  await page.keyboard.type('块外正文');
  await expect(block).toHaveCount(0);
  await expect(editor.locator('p')).toContainText(['保留当前行', 'const value = 1块外正文']);
  await expect.poll(() => saved.at(-1)).toContain('块外正文');
});

test('V4-07 代码块命令将当前代码行转为正文并保留上下代码', async ({ page }) => {
  const saved: string[] = [];
  await mockEditorWorkspace(page, saved, [], '```python\none\n    two\nthree\n```');
  await page.goto('/#/materials/notes/note-1');
  const editor = page.locator('.ProseMirror');
  const code = editor.locator('pre > code');
  await expect(code).toHaveText('one\n    two\nthree');
  await code.click();
  await code.evaluate(element => {
    const range = document.createRange();
    range.setStart(element.firstChild!, 9);
    range.collapse(true);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
  });
  await page.getByRole('button', { name: '段落', exact: true }).click();
  await page.getByRole('menuitem', { name: '代码块', exact: true }).click();
  await expect(code).toHaveText(['one', 'three']);
  await expect(editor.locator(':scope > p')).toHaveText('    two');
  await expect(page.getByRole('textbox', { name: '代码语言', exact: true }).nth(0)).toHaveValue('python');
  await expect(page.getByRole('textbox', { name: '代码语言', exact: true }).nth(1)).toHaveValue('python');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(code).toHaveText('one\n    two\nthree');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(code).toHaveText(['one', 'three']);
  await expect.poll(() => (saved.at(-1)?.match(/```python/g) ?? []).length).toBe(2);
  await page.reload();
  await expect(code).toHaveText(['one', 'three']);
  await expect(editor.locator(':scope > p')).toHaveText('    two');
});

test('V4-07 空普通行就地插入代码块，非空行在下方插入', async ({ page }) => {
  await mockEditorWorkspace(page, [], [], '');
  await page.goto('/#/materials/notes/note-1');
  const editor = page.locator('.ProseMirror');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+Alt+c');
  await expect(editor.locator(':scope > *').first()).toHaveJSProperty('tagName', 'PRE');
  await expect(editor.locator('pre code')).toHaveText('');
  await page.keyboard.press('Backspace');
  await page.keyboard.type('普通行');
  await page.keyboard.press('ControlOrMeta+Alt+c');
  await expect(editor.locator(':scope > p').first()).toHaveText('普通行');
  await expect(editor.locator(':scope > *').nth(1)).toHaveJSProperty('tagName', 'PRE');
  await expect(editor.locator('pre code')).toHaveText('');
});

test('V4-07 Safari 中文上屏辅助元素不制造代码块视觉空行', async ({ page }) => {
  // Enable the same GFM IME compatibility plugin that Safari uses.
  await page.addInitScript(() => Object.defineProperty(navigator, 'vendor', { get: () => 'Apple Computer, Inc.' }));
  const saved: string[] = [];
  await mockEditorWorkspace(page, saved, [], '```\n```');
  await page.goto('/#/materials/notes/note-1');
  const editor = page.locator('.ProseMirror');
  const code = editor.locator('pre > code');
  await code.click();
  await code.dispatchEvent('compositionstart', { data: '' });
  await page.keyboard.insertText('你好');
  const separator = code.locator('img.ProseMirror-separator');
  await expect(separator).toHaveCount(1);
  await expect(separator).toHaveCSS('display', 'inline');
  // Both the helper and the last character must remain on the first visual line.
  expect(await code.evaluate(element => {
    const range = document.createRange();
    range.selectNodeContents(element.firstChild!);
    const textRect = range.getBoundingClientRect();
    const imageRect = element.querySelector('img.ProseMirror-separator')!.getBoundingClientRect();
    return imageRect.top <= textRect.bottom;
  })).toBe(true);
  await code.dispatchEvent('compositionend', { data: '你好' });
  await expect.poll(() => code.textContent()).toBe('你好');
  await expect.poll(() => saved.at(-1)).toBe('```\n你好\n```\n');
  await page.keyboard.press('Enter');
  await page.keyboard.insertText('第二行');
  await expect.poll(() => code.textContent()).toBe('你好\n第二行');
});

test('V4-07 代码块输入法结束后仍等待编辑器完成组合输入再处理删除键', async ({ page }) => {
  await mockEditorWorkspace(page, [], [], '```\n```');
  await page.goto('/#/materials/notes/note-1');
  const code = page.locator('.ProseMirror pre code');
  await code.click();
  await code.evaluate(async (element) => {
    element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }));
  });
  await expect(code).toHaveCount(1);
  await page.waitForTimeout(30);
  await page.keyboard.press('Backspace');
  await expect(code).toHaveCount(0);
});

async function dispatchPaste(page: Page, content: { html?: string; text: string }): Promise<void> {
  await page.locator('.ProseMirror').evaluate((editor, pasted) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', pasted.text);
    if (pasted.html) clipboardData.setData('text/html', pasted.html);
    editor.dispatchEvent(new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData
    }));
  }, content);
}

async function pinEditorToolbar(page: Page): Promise<void> {
  const editor = page.locator('.ProseMirror');
  await expect(editor.locator('xpath=ancestor::*[@data-editor-ready][1]')).toHaveAttribute('data-editor-ready', 'true');
  const toolbar = page.getByRole('toolbar', { name: '笔记格式工具栏' });
  // 编辑器就绪会恢复滚动位置；在恢复结束后重试真实滚动，不与初始化抢时序。
  await expect.poll(async () => {
    await toolbar.evaluate((toolbarElement) => {
      const stage = toolbarElement.closest('article')?.parentElement;
      if (!stage) return;
      stage.scrollTop = stage.scrollHeight;
      stage.dispatchEvent(new Event('scroll'));
    });
    return toolbar.getAttribute('data-pinned');
  }).toBe('true');
  await expect(toolbar.getByRole('button', { name: '段落', exact: true })).toBeVisible();
}

async function replaceEditorParagraph(page: Page, editor: Locator, text: string): Promise<void> {
  await editor.locator(':scope > p').first().click({ clickCount: 3 });
  await page.keyboard.type(text);
}

test('V4-07 重点标记内的粗体保持醒目', async ({ page }) => {
  await mockEditorWorkspace(page, [], [], '# 第一节\n\n**需要标记的正文内容**');
  const created: Array<Record<string, unknown>> = [];
  await page.route('**/api/knowledge/annotations**', async (route) => {
    if (route.request().method() === 'POST') {
      const annotation = { ...route.request().postDataJSON(), id: 'bold-annotation', status: 'active', lifecycleStatus: 'active', anchorStatus: 'resolved', revision: 1 };
      created.push(annotation);
      await route.fulfill({ json: { data: annotation } });
      return;
    }
    await route.fulfill({ json: { data: created } });
  });
  await page.goto('/#/materials/notes/note-1');
  const editor = page.locator('.ProseMirror');
  const strong = editor.locator('strong');
  await expect(strong).toHaveText('需要标记的正文内容');
  await editor.locator('p').first().click({ clickCount: 3 });
  await page.getByRole('toolbar', { name: '选区工具' }).getByRole('button', { name: '标记重点（普通）', exact: true }).click();
  await expect.poll(() => created.length).toBe(1);
  await expect(editor.locator('.editor-annotation')).toHaveCSS('color', 'rgb(37, 99, 235)');
  expect(Number(await strong.evaluate(element => getComputedStyle(element).fontWeight))).toBeGreaterThan(400);
  await editor.locator('p').first().screenshot({ path: '/tmp/knowra-bold-annotation.png' });
});

test('V4-07 重点重要等级在正文和检查器中有对应颜色', async ({ page }) => {
  await mockEditorWorkspace(page, [], [], '# 等级颜色\n\n普通段落\n\n重要段落\n\n核心段落\n\n未评级段落');
  const annotations = [
    ['normal', '普通段落', 'normal'],
    ['important', '重要段落', 'important'],
    ['core', '核心段落', 'core'],
    ['unrated', '未评级段落', null]
  ].map(([id, quoteText, importance], index) => ({
    id, spaceId: 'space-1', noteId: 'note-1', noteVersionId: null,
    kind: 'important', importance, sourceMode: 'manual', scopeType: 'selection', quoteText,
    headingPath: ['等级颜色'], fromPosition: index * 20, toPosition: index * 20 + String(quoteText).length,
    prefixText: '', suffixText: '', anchorFingerprint: id, noteContentHash: 'same-version',
    idempotencyKey: id, status: 'active', lifecycleStatus: 'active', anchorStatus: 'resolved'
  }));
  await page.route('**/api/knowledge/annotations**', route => route.fulfill({ json: { data: annotations } }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#/materials/notes/note-1');
  await page.getByRole('button', { name: '切换文档检查器' }).click();
  const inspector = page.getByRole('complementary', { name: '文档检查器' });
  await inspector.getByRole('tab', { name: '标注' }).click();
  const editor = page.locator('.ProseMirror');
  for (const [id, label, color] of [
    ['normal', '普通', 'rgb(37, 99, 235)'],
    ['important', '重点', 'rgb(194, 65, 12)'],
    ['core', '核心', 'rgb(124, 58, 237)']
  ]) {
    const card = inspector.locator(`article[data-annotation-card-id="${id}"]`);
    await expect(card).toHaveAttribute('data-importance', id);
    await expect(card.getByText(label, { exact: true })).toHaveCSS('color', color);
    expect(await card.evaluate(element => getComputedStyle(element).boxShadow)).toContain(color);
    const mark = editor.locator(`[data-annotation-id="${id}"]`);
    await expect(mark).toHaveAttribute('data-importance', id);
    await expect(mark).toHaveCSS('color', color);
  }
  await expect(inspector.locator('article[data-annotation-card-id="unrated"]')).not.toHaveAttribute('data-importance');
  await expect(inspector.getByText('待评级')).toHaveCount(0);
  await expect(editor.locator('[data-annotation-id="unrated"]')).toHaveCSS('color', 'rgb(37, 99, 235)');
  await inspector.screenshot({ path: '/tmp/knowra-importance-colors.png' });
});

test('V4-07 重复文字不会让代码块重点越过代码块边界', async ({ page }) => {
  await mockEditorWorkspace(page, [], [], '## 示例\n\n```\n测试\n测试\n测试\n```\n\n测试测试测试\n\n```\n测试\n测试\n测试\n```');
  const created: Array<Record<string, unknown>> = [];
  await page.route('**/api/knowledge/annotations**', async (route) => {
    if (route.request().method() === 'POST') {
      const annotation = { ...route.request().postDataJSON(), id: 'code-annotation', status: 'active', lifecycleStatus: 'active', anchorStatus: 'resolved', revision: 1 };
      created.push(annotation);
      await route.fulfill({ json: { data: annotation } });
      return;
    }
    await route.fulfill({ json: { data: created } });
  });
  await page.goto('/#/materials/notes/note-1');
  const editor = page.locator('.ProseMirror');
  await editor.locator('p').first().click();
  await editor.locator('pre').last().hover();
  const box = await editor.locator('pre').last().boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2 + 1, box!.y + box!.height / 2);
  await page.getByRole('button', { name: '内容块重点菜单' }).click();
  await page.getByRole('menuitem', { name: '标记此块为重点', exact: true }).hover();
  await page.getByRole('menuitem', { name: '普通', exact: true }).click();
  await expect.poll(() => created.length).toBe(1);
  expect(created[0].scopeType).toBe('blocks');
  expect(created[0].quoteText).toBe('测试\n测试\n测试');
  const anchor = created[0].anchor as { structurePath: string; segments: Array<{ path: string }> };
  expect(anchor.segments.every(segment => segment.path === anchor.structurePath)).toBe(true);
  await expect(editor.locator('pre').first().locator('.editor-annotation')).toHaveCount(0);
  await expect(editor.locator('p .editor-annotation')).toHaveCount(0);
  await expect(editor.locator('pre').last().locator('.editor-annotation')).toContainText('测试\n测试\n测试');
  await page.reload();
  await expect(editor.locator('p .editor-annotation')).toHaveCount(0);
  await expect(editor.locator('pre').first().locator('.editor-annotation')).toHaveCount(0);
  await expect(editor.locator('pre').last().locator('.editor-annotation')).toContainText('测试\n测试\n测试');
  await editor.screenshot({ path: '/tmp/knowra-code-annotation.png' });
});

test('标注渐进披露：正文三种创建入口与紧凑检查器', async ({ page }) => {
  await mockEditorWorkspace(page, [], [], '# 第一节\n\n需要标记的正文内容\n\n## 第二节\n\n其他正文');
  const created: Array<Record<string, unknown>> = [];
  await page.route('**/api/knowledge/annotations**', async (route) => {
    if (route.request().method() === 'POST') {
      const input = route.request().postDataJSON();
      const annotation = { ...input, id: `a-${created.length}`, status: 'active', lifecycleStatus: 'active', anchorStatus: 'resolved', revision: 1 };
      created.push(annotation);
      await route.fulfill({ json: { data: annotation } });
    } else if (route.request().method() === 'DELETE') {
      const id = route.request().url().split('/').at(-1);
      const index = created.findIndex((annotation) => annotation.id === id);
      if (index < 0) throw new Error(`Missing annotation ${id}`);
      created[index] = { ...created[index], status: 'deleted', lifecycleStatus: 'deleted', revision: Number(created[index].revision ?? 1) + 1, deletedAt: new Date().toISOString() };
      await route.fulfill({ json: { data: created[index] } });
    } else await route.fulfill({ json: { data: created } });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#/materials/notes/note-1');
  const editor = page.locator('.ProseMirror');
  await expect(editor).toContainText('需要标记的正文内容');
  await editor.locator('p').first().click({ clickCount: 3 });
  const selectionTools = page.getByRole('toolbar', { name: '选区工具' });
  await expect(selectionTools.getByRole('button')).toHaveCount(6);
  await selectionTools.getByRole('button', { name: '加粗', exact: true }).click();
  await expect(editor.locator('strong')).toContainText('需要标记的正文内容');
  expect(Number(await editor.locator('strong').first().evaluate(element => getComputedStyle(element).fontWeight))).toBeGreaterThan(400);
  await selectionTools.getByRole('button', { name: '斜体', exact: true }).click();
  await expect(editor.locator('em')).toContainText('需要标记的正文内容');
  await selectionTools.getByRole('button', { name: '行内代码', exact: true }).click();
  await expect(editor.locator('p code')).toContainText('需要标记的正文内容');
  expect(await selectionTools.evaluate(element => element.getBoundingClientRect().height)).toBeLessThanOrEqual(40);
  await selectionTools.screenshot({ path: '/tmp/knowra-selection-tools-v2.png' });
  await selectionTools.getByRole('button', { name: '标记重点（普通）', exact: true }).click();
  await expect.poll(() => created.length).toBe(1);
  const highlight = editor.locator('.editor-annotation').first();
  await expect(highlight).toHaveCSS('color', 'rgb(37, 99, 235)');
  await expect(highlight).toHaveCSS('border-bottom-style', 'none');
  await expect(highlight).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(highlight).toHaveCSS('outline-style', 'none');
  expect(created[0].scopeType).toBe('selection');
  expect(created[0].importance).toBe('normal');
  await editor.locator('p').last().click();
  await editor.locator('p').first().hover();
  await page.getByRole('button', { name: '内容块重点菜单' }).click();
  await page.getByRole('menuitem', { name: '标记此块为重点', exact: true }).hover();
  await page.getByRole('menuitem', { name: '普通', exact: true }).click();
  await expect.poll(() => created.length).toBe(2);
  expect(created[1].scopeType).toBe('blocks');
  expect(created[1].quoteText).toContain('需要标记的正文内容');
  await editor.locator('h1').hover();
  const headingBox = await editor.locator('h1').boundingBox();
  const blockButtonBox = await page.getByRole('button', { name: '标题重点菜单' }).boundingBox();
  expect(headingBox).not.toBeNull();
  expect(blockButtonBox).not.toBeNull();
  if (headingBox && blockButtonBox) {
    expect(Math.abs(blockButtonBox.y + blockButtonBox.height / 2 - (headingBox.y + headingBox.height / 2))).toBeLessThan(2);
    expect(headingBox.x - (blockButtonBox.x + blockButtonBox.width)).toBeGreaterThanOrEqual(14);
  }
  await page.getByRole('button', { name: '标题重点菜单' }).click();
  await page.getByRole('menuitem', { name: '标记本节为重点', exact: true }).hover();
  await page.getByRole('menuitem', { name: '普通', exact: true }).click();
  await expect.poll(() => created.length).toBe(3);
  expect(created[2].scopeType).toBe('section');
  expect(created[2].quoteText).toContain('第一节');
  const overlappingHighlight = editor.locator('[data-annotation-count]:not([data-annotation-count="1"])').first();
  await expect(overlappingHighlight).toBeVisible();
  await expect(overlappingHighlight).toHaveCSS('text-decoration-line', 'none');
  await overlappingHighlight.click();
  const inspector = page.getByRole('complementary', { name: '文档检查器' });
  await expect(inspector.getByRole('tab', { name: '标注' })).toHaveAttribute('aria-selected', 'true');
  await expect(inspector.getByText(/此处有 \d 条重点，已在下方标出/)).toBeVisible();
  await expect(inspector.locator('article[data-overlap-focused]')).toHaveCount(3);
  const sortButtonBox = await inspector.getByRole('button', { name: '排序重点' }).boundingBox();
  const filterButtonBox = await inspector.getByRole('button', { name: '筛选重点' }).boundingBox();
  expect(sortButtonBox && filterButtonBox && sortButtonBox.x < filterButtonBox.x).toBeTruthy();
  await inspector.getByRole('button', { name: '排序重点' }).click();
  await expect(page.getByRole('dialog', { name: '排序重点' }).getByRole('button', { name: '重要级：高到低' })).toBeVisible();
  await page.getByRole('dialog', { name: '排序重点' }).getByRole('button', { name: '正文顺序' }).click();
  await expect(inspector.getByRole('checkbox')).toHaveCount(3);
  await expect(inspector.getByRole('button', { name: '提炼知识' })).toHaveCount(0);
  await expect(inspector.getByRole('button', { name: '分析整篇' })).toHaveCount(0);
  await inspector.getByRole('button', { name: '块 1', exact: true }).click();
  await expect(inspector.getByRole('checkbox')).toHaveCount(1);
  await inspector.getByRole('button', { name: '全部 3', exact: true }).click();
  await inspector.getByRole('checkbox').first().check({ force: true });
  await expect(inspector.getByRole('button', { name: '提炼知识' })).toBeVisible();
  await inspector.getByRole('button', { name: '筛选重点' }).click();
  await expect(page.getByRole('dialog', { name: '筛选重点' }).getByRole('button', { name: /全部章节/ })).toBeVisible();
  await expect(page.getByRole('dialog', { name: '筛选重点' }).getByRole('button', { name: /全部类型/ })).toBeVisible();
  await page.getByRole('button', { name: '关闭筛选' }).click();
  const selectionCard = inspector.locator('article').filter({ hasText: '文字选区' });
  await selectionCard.getByRole('button', { name: /更多操作/ }).click();
  await expect(page.getByRole('menuitem', { name: '重新选择来源' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('[role=menu]')).toHaveCount(0);
  await selectionCard.getByRole('button', { name: /更多操作/ }).click();
  await page.getByRole('menuitem', { name: '取消重点' }).click();
  await expect(inspector.getByRole('button', { name: '撤销' })).toBeVisible();
  await expect(inspector.getByRole('checkbox')).toHaveCount(2);
  await expect(inspector.getByRole('button', { name: '全部 2', exact: true })).toBeVisible();
  await expect(inspector.getByText('重点标记', { exact: true }).locator('..')).toContainText('2');
  await expect(editor.locator('[data-annotation-id="a-0"]')).toHaveCount(0);
  await page.screenshot({ path: '/tmp/knowra-annotations-final.png' });
  await inspector.getByRole('tab', { name: 'AI', exact: true }).click();
  await expect(inspector.getByRole('button', { name: '分析整篇' })).toBeVisible();
  created[1] = { ...created[1], anchorStatus: 'stale' };
  await page.reload();
  await page.getByRole('button', { name: '切换文档检查器' }).click();
  await inspector.getByRole('tab', { name: '标注' }).click();
  await expect(inspector.getByRole('checkbox')).toHaveCount(2);
  await expect(inspector.getByRole('button', { name: '全部 2', exact: true })).toBeVisible();
  await inspector.screenshot({ path: '/tmp/knowra-annotation-panel-v2.png' });
  await inspector.getByRole('button', { name: '筛选重点' }).click();
  const filters = page.getByRole('dialog', { name: '筛选重点' });
  await expect(filters).toBeVisible();
  await expect(filters.getByRole('button', { name: '已取消' })).toHaveCount(0);
  await filters.screenshot({ path: '/tmp/knowra-annotation-filters-v2.png' });
  await filters.getByRole('button', { name: '原文待核对', exact: true }).click();
  await filters.getByRole('button', { name: '完成', exact: true }).click();
  await expect(inspector.getByRole('checkbox')).toHaveCount(1);
  await inspector.getByRole('button', { name: '清除', exact: true }).click();
  for (let index = 3; index < 30; index++) created.push({ ...created[2], id: `a-${index}` });
  await page.reload();
  await page.getByRole('button', { name: '切换文档检查器' }).click();
  await inspector.getByRole('tab', { name: '标注' }).click();
  await expect(inspector.getByRole('checkbox')).toHaveCount(29);
  await inspector.getByRole('checkbox').nth(1).check({ force: true });
  const footerBefore = await inspector.getByRole('button', { name: '提炼知识' }).boundingBox();
  await inspector.getByRole('checkbox').last().scrollIntoViewIfNeeded();
  const footerAfter = await inspector.getByRole('button', { name: '提炼知识' }).boundingBox();
  expect(footerAfter?.y).toBe(footerBefore?.y);
  await expect(inspector.getByRole('button', { name: '筛选重点' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(inspector.getByRole('button', { name: '筛选重点' })).toBeVisible();
  expect(await inspector.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await inspector.getByRole('button', { name: '筛选重点' }).click();
  await expect(page.getByRole('dialog', { name: '筛选重点' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '筛选重点' })).toBeHidden();
  await expect(inspector.getByRole('button', { name: '筛选重点' })).toBeFocused();
});

test('V4-07 浏览器保留编辑区内的原标签行', async ({ page }) => {
  await mockEditorWorkspace(page, [], [], '浏览器正文');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/#/materials/notes/note-1');
  const editor = page.getByLabel('笔记编辑页面骨架');
  const tabs = editor.getByRole('tablist', { name: '打开的笔记' });
  await expect(tabs.getByRole('tab', { name: '编辑器验收笔记' })).toBeVisible();
  await expect(page.getByLabel('Mac 窗口标题栏')).toHaveCount(0);
  await expect(editor).not.toHaveAttribute('data-window-tabs', 'true');
  expect(Math.round((await tabs.boundingBox())!.height)).toBe(36);
  await expect(page.locator('.ProseMirror')).toContainText('浏览器正文');
});


for (const stale of [false, true]) {
  test(`V4-07 图片上传${stale ? '过期选区不覆盖正文且保留附件' : '正常插入可撤销并保留附件'}`, async ({ page }) => {
    const saved: string[] = [];
    await mockEditorWorkspace(page, saved, [], '保留正文');
    let finishUpload: (() => Promise<void>) | undefined;
    const attachment = { id: 'uploaded-image', noteId: 'note-1', fileName: 'paste.png', mimeType: 'image/png', size: 1, status: 'ready' };
    const shared = { ...attachment, id: 'other-note-resource', noteId: 'note-2', fileName: '共享资源.png' };
    const retained = [shared];
    const deleted: string[] = [];
    await page.route('**/api/storage/attachments**', async route => {
      const request = route.request();
      if (request.method() === 'POST') {
        finishUpload = async () => { retained.push(attachment); await route.fulfill({ json: { data: attachment } }); };
        return;
      }
      if (request.method() === 'DELETE') deleted.push(request.url());
      if (request.url().includes('/cleanup')) await route.fulfill({ json: { data: { items: [], pending: 0 } } });
      else if (request.url().includes('/content')) await route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9WQAAAAASUVORK5CYII=', 'base64') });
      else await route.fulfill({ json: { data: retained.filter(item => item.noteId === new URL(request.url()).searchParams.get('noteId')) } });
    });
    await page.goto('/#/materials/notes/note-1');
    const editor = page.locator('.ProseMirror');
    await expect(page.locator('[data-editor-ready]')).toHaveAttribute('data-editor-ready', 'true');
    await editor.locator('p').click();
    await page.keyboard.press('End');
    await expect.poll(() => page.evaluate(() => window.getSelection()?.anchorOffset)).toBe(4);
    await editor.evaluate(element => {
      const clipboardData = new DataTransfer();
      clipboardData.items.add(new File(['bytes'], 'paste.png', { type: 'image/png' }));
      element.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData }));
    });
    await expect.poll(() => Boolean(finishUpload)).toBe(true);
    if (stale) {
      await editor.locator('p').click({ clickCount: 3 });
      await expect.poll(() => page.evaluate(() => window.getSelection()?.toString().trim())).toBe('保留正文');
    }
    await finishUpload!();
    if (stale) {
      await expect(page.getByText('图片已上传，正文、选区或编辑状态已变化，未插入正文，可从附件列表再次插入')).toBeVisible();
      await expect(editor.locator('img:not(.ProseMirror-separator)')).toHaveCount(0);
      await expect(editor).toHaveText('保留正文');
    } else {
      await expect(editor.locator('img:not(.ProseMirror-separator)')).toHaveCount(1);
      await expect.poll(() => saved.at(-1) ?? '').toContain('uploaded-image');
      await page.keyboard.press('ControlOrMeta+z');
      await expect(editor.locator('img:not(.ProseMirror-separator)')).toHaveCount(0);
      await expect(editor).toHaveText('保留正文');
    }
    if (!await page.getByRole('complementary', { name: '文档检查器' }).isVisible()) await page.getByRole('button', { name: '切换文档检查器' }).click();
    await page.getByRole('tab', { name: '信息', exact: true }).click();
    await expect(page.getByText('paste.png', { exact: true })).toBeVisible();
    expect(retained).toContainEqual(shared);
    expect(deleted).toEqual([]);
  });
}

test('V4-07 章节重点保存等待后不抢走搜索框焦点', async ({ page }) => {
  await mockEditorWorkspace(page, [], [], '# 第一节\n\n章节正文');
  let finishSave: (() => Promise<void>) | undefined;
  let saveReleased = false;
  const created: Array<Record<string, unknown>> = [];
  await page.route('**/api/knowledge/notes/note-1', async route => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    const markdown = route.request().postDataJSON().rawMarkdown;
    const respond = () => route.fulfill({ json: { data: createNote(markdown, true) } });
    if (saveReleased) return respond();
    finishSave = () => { saveReleased = true; return respond(); };
  });
  await page.route('**/api/knowledge/annotations**', async route => {
    if (route.request().method() === 'POST') {
      const item = { ...route.request().postDataJSON(), id: 'section-focus', status: 'active', lifecycleStatus: 'active', anchorStatus: 'resolved', revision: 1 };
      created.push(item);
      return route.fulfill({ json: { data: item } });
    }
    return route.fulfill({ json: { data: created } });
  });
  await page.goto('/#/materials/notes/note-1');
  const heading = page.locator('.ProseMirror h1');
  await expect(page.locator('[data-editor-ready]')).toHaveAttribute('data-editor-ready', 'true');
  await heading.click();
  await page.keyboard.press('End');
  await page.keyboard.insertText('新增');
  await heading.hover();
  await page.getByRole('button', { name: '标题重点菜单' }).click();
  await page.getByRole('menuitem', { name: '标记本节为重点', exact: true }).hover();
  await page.getByRole('menuitem', { name: '普通', exact: true }).click();
  await expect.poll(() => Boolean(finishSave)).toBe(true);
  const search = page.getByRole('searchbox', { name: '搜索笔记目录' });
  await search.fill('查找');
  await finishSave!();
  await expect.poll(() => created.length).toBe(1);
  await expect(search).toBeFocused();
  await page.keyboard.insertText('继续');
  await expect(search).toHaveValue('查找继续');
  await expect(heading).toHaveText('第一节新增');
});

test('V4-07 表格行列菜单支持结构编辑、对齐、保存与撤销', async ({ page }) => {
  const saved: string[] = [];
  await mockEditorWorkspace(page, saved, [], '| 名称 | 数量 |\n| --- | --- |\n| 苹果 | 2 |\n| 梨 | 3 |');
  await page.goto('/#/materials/notes/note-1');
  const table = page.locator('.ProseMirror table');
  await expect(table).toBeVisible();
  await table.locator('td').first().click();
  const open = async () => { await page.getByRole('button', { name: '表格操作', exact: true }).click(); };
  await expect(page.getByRole('button', { name: '表格操作', exact: true })).toBeVisible();
  await open();
  await page.getByRole('menuitem', { name: '在下方插入行', exact: true }).click();
  await expect(table.locator('tr')).toHaveCount(4);
  await open();
  await page.getByRole('menuitem', { name: '在右侧插入列', exact: true }).click();
  await expect(table.locator('tr').first().locator('th')).toHaveCount(3);
  await open();
  await page.getByRole('menuitem', { name: '当前列居中', exact: true }).click();
  await expect(table.locator('th').first()).toHaveCSS('text-align', 'center');
  await expect.poll(() => saved.at(-1) ?? '').toContain(':');
  await page.reload();
  await expect(table.locator('tr')).toHaveCount(4);
  await expect(table.locator('th').first()).toHaveCSS('text-align', 'center');
  await table.locator('td').first().click();
  await open();
  await page.getByRole('menuitem', { name: '选择当前行', exact: true }).click();
  await expect(table.locator('tr').nth(1).locator('.selectedCell')).toHaveCount(3);
  await open();
  await page.getByRole('menuitem', { name: '删除当前行', exact: true }).click();
  await expect(table.locator('tr')).toHaveCount(3);
  await expect(page.locator('.ProseMirror')).toBeFocused();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(table.locator('tr')).toHaveCount(4);
  await table.locator('th').first().click();
  await open();
  await expect(page.getByRole('menuitem', { name: '删除当前行', exact: true })).toBeDisabled();
  await expect(page.getByRole('menuitem', { name: '在上方插入行', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
});

test('V4-07 窄屏表格菜单可由键盘访问，阅读模式不显示写入控件', async ({ page }) => {
  await mockEditorWorkspace(page, [], [], '| 名称 |\n| --- |\n| 苹果 |');
  await page.setViewportSize({ width: 700, height: 700 });
  await page.goto('/#/materials/notes/note-1');
  await page.locator('.ProseMirror td').first().click();
  const trigger = page.getByRole('button', { name: '表格操作', exact: true });
  await expect(trigger).toBeVisible();
  const rect = await trigger.boundingBox();
  expect(rect!.x).toBeGreaterThanOrEqual(0); expect(rect!.x + rect!.width).toBeLessThanOrEqual(700);
  await trigger.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('menu', { name: '表格操作', exact: true })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: '删除当前列', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await page.getByRole('button', { name: '视图', exact: true }).click();
  await page.getByRole('menuitem', { name: '阅读模式', exact: true }).click();
  await expect(trigger).toHaveCount(0);
});

test('V4-07 长表滚动后操作栏避开固定格式栏', async ({ page }) => {
  const rows = Array.from({ length: 45 }, (_, index) => `| 第${index + 1}行 |`).join('\n');
  await mockEditorWorkspace(page, [], [], `| 名称 |\n| --- |\n${rows}`);
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.goto('/#/materials/notes/note-1');
  await page.locator('.ProseMirror td').first().click();
  const controls = page.getByRole('toolbar', { name: '表格操作工具栏', exact: true });
  await expect(controls).toBeVisible();
  await page.locator('[data-editor-scroll-root]').evaluate(stage => { stage.scrollTop = 500; });
  await expect.poll(async () => {
    const table = await page.locator('.ProseMirror table').boundingBox();
    const format = await page.getByRole('toolbar', { name: '笔记格式工具栏', exact: true }).boundingBox();
    const operations = await controls.boundingBox();
    return Boolean(table && format && operations && table.y < format.y && table.y + table.height > format.y + format.height
      && operations.y >= format.y + format.height + 8);
  }).toBe(true);
  await page.getByRole('button', { name: '表格操作', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: '在下方插入行', exact: true })).toBeVisible();
});

test('V4-07 图片比例预设保留说明、附件地址并可独立撤销与重载', async ({ page }) => {
  const saved: string[] = [];
  await mockEditorWorkspace(page, saved, [], '之前正文\n\n![替代说明](/api/attachments/image-1/content "图片标题")\n\n之后正文');
  await page.route('**/api/attachments/image-1/content', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><rect width="800" height="400" fill="blue"/></svg>' }));
  await page.goto('/#/materials/notes/note-1');
  const image = page.locator('.ProseMirror img:not(.ProseMirror-separator)');
  await expect(image).toBeVisible();
  await image.click();
  const controls = page.getByRole('toolbar', { name: '图片尺寸工具栏', exact: true });
  await expect(controls).toBeVisible();
  const original = await image.boundingBox();
  await controls.getByRole('button', { name: '小图', exact: true }).click();
  await expect.poll(async () => (await image.boundingBox())!.width / original!.width).toBeCloseTo(0.4, 1);
  await expect(image).toHaveAttribute('alt', '替代说明');
  await expect(image).toHaveAttribute('title', '图片标题');
  await expect.poll(() => saved.at(-1) ?? '').toContain('knowra-image-ratio=0.40');
  const small = await image.boundingBox();
  expect(small!.width / small!.height).toBeCloseTo(2, 2);
  await expect(page.locator('.ProseMirror')).toBeFocused();
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(async () => (await image.boundingBox())!.width).toBeCloseTo(original!.width, 1);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect.poll(async () => (await image.boundingBox())!.width / original!.width).toBeCloseTo(0.4, 1);
  await expect.poll(() => saved.at(-1) ?? '').toContain('knowra-image-ratio=0.40');
  await page.reload();
  await expect(image).toHaveAttribute('alt', '替代说明');
  await expect(image).toHaveAttribute('title', '图片标题');
  await expect.poll(async () => (await image.boundingBox())!.width / original!.width).toBeCloseTo(0.4, 1);
  expect(saved.at(-1)).toContain('/api/attachments/image-1/content');
  await expect(page.locator('.ProseMirror')).toContainText('之前正文');
  await expect(page.locator('.ProseMirror')).toContainText('之后正文');
});

test('V4-07 图片拖拽等比缩放可撤销，取消或切换选区不提交', async ({ page }) => {
  const saved: string[] = [];
  await mockEditorWorkspace(page, saved, [], '![说明](/api/attachments/image-1/content)\n\n保留正文');
  await page.route('**/api/attachments/image-1/content', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><rect width="800" height="400" fill="blue"/></svg>' }));
  await page.goto('/#/materials/notes/note-1');
  const image = page.locator('.ProseMirror img[data-editor-image]');
  await image.click();
  const original = (await image.boundingBox())!;
  const beginDrag = async () => {
    const grip = (await page.getByRole('button', { name: '拖动缩放图片', exact: true }).boundingBox())!;
    const x = grip.x + grip.width / 2; const y = grip.y + grip.height / 2;
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x - 140, y);
  };
  await beginDrag();
  expect((await image.boundingBox())!.width).toBeLessThan(original.width - 100);
  await page.keyboard.press('Escape'); await page.mouse.up();
  await expect.poll(async () => (await image.boundingBox())!.width).toBeCloseTo(original.width, 1);
  expect(saved.some(markdown => markdown.includes('knowra-image-ratio'))).toBe(false);
  await beginDrag();
  await page.locator('.ProseMirror p').last().evaluate(paragraph => {
    const range = document.createRange(); range.selectNodeContents(paragraph); range.collapse(false);
    const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range);
  });
  await expect(page.getByRole('toolbar', { name: '图片尺寸工具栏', exact: true })).toHaveCount(0);
  await page.mouse.up();
  await expect.poll(async () => (await image.boundingBox())!.width).toBeCloseTo(original.width, 1);
  expect(saved.some(markdown => markdown.includes('knowra-image-ratio'))).toBe(false);
  await image.dblclick(); await beginDrag(); await page.mouse.up();
  await expect.poll(() => saved.at(-1) ?? '').toContain('knowra-image-ratio');
  const resized = (await image.boundingBox())!;
  expect(resized.width / resized.height).toBeCloseTo(2, 2);
  expect(resized.width).toBeLessThan(original.width - 100);
  await expect(page.locator('.ProseMirror')).toBeFocused();
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(async () => (await image.boundingBox())!.width).toBeCloseTo(original.width, 1);
  await expect(page.locator('.ProseMirror')).toContainText('保留正文');
});

test('V4-07 旧比例长图保持等比与窄屏键盘预设，阅读模式隐藏写入控件', async ({ page }) => {
  const saved: string[] = [];
  await mockEditorWorkspace(page, saved, [], '![0.66](/api/attachments/image-1/content "长图标题")');
  await page.route('**/api/attachments/image-1/content', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="3000"><rect width="500" height="3000" fill="blue"/></svg>' }));
  await page.setViewportSize({ width: 700, height: 700 });
  await page.goto('/#/materials/notes/note-1');
  const image = page.locator('.ProseMirror img[data-editor-image]');
  await expect(image).toBeVisible();
  const rect = (await image.boundingBox())!;
  expect(rect.width / rect.height).toBeCloseTo(1 / 6, 3);
  expect(rect.x + rect.width).toBeLessThanOrEqual(700);
  await image.click({ position: { x: 10, y: 10 } });
  const controls = page.getByRole('toolbar', { name: '图片尺寸工具栏', exact: true });
  await expect(controls).toBeVisible();
  const box = (await controls.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(700);
  await controls.getByRole('button', { name: '小图', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => saved.at(-1) ?? '').toContain('![0.40]');
  expect(saved.at(-1)).toContain('长图标题');
  expect(saved.at(-1)).not.toContain('knowra-image-ratio');
  await expect.poll(async () => (await image.boundingBox())!.width / rect.width).toBeCloseTo(0.4 / 0.66, 1);
  await page.getByRole('button', { name: '视图', exact: true }).click();
  await page.getByRole('menuitem', { name: '阅读模式', exact: true }).click();
  await expect(controls).toHaveCount(0);
  await expect(page.getByRole('button', { name: '拖动缩放图片', exact: true })).toHaveCount(0);
});

test('V4-07 原生图片复制剪切保留同附件各实例的实际像素尺寸', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await mockEditorWorkspace(page, [], [], '![第一张](/api/attachments/image-1/content "标题 {knowra-image-ratio=0.40}")\n\n![第二张](/api/attachments/image-1/content "标题 {knowra-image-ratio=0.66}")\n\n保留正文');
  await page.route('**/api/attachments/image-1/content', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><rect width="100" height="50" fill="blue"/></svg>' }));
  await page.goto('/#/materials/notes/note-1');
  const images = page.locator('.ProseMirror img[data-editor-image]');
  await expect(images).toHaveCount(2);
  const readCopied = () => page.evaluate(async () => {
    const item = (await navigator.clipboard.read()).find(value => value.types.includes('text/html'));
    if (!item) return [];
    const parsed = new DOMParser().parseFromString(await (await item.getType('text/html')).text(), 'text/html');
    return Array.from(parsed.body.querySelectorAll('img')).map(image => ({ alt: image.alt, title: image.title, width: image.style.width }));
  });
  await images.first().click(); await page.keyboard.press('ControlOrMeta+c');
  await expect.poll(readCopied).toEqual([{ alt: '第一张', title: '标题', width: '40px' }]);
  await images.nth(1).click(); await page.keyboard.press('ControlOrMeta+x');
  await expect.poll(readCopied).toEqual([{ alt: '第二张', title: '标题', width: '66px' }]);
  await expect(images).toHaveCount(1);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(images).toHaveCount(2);
  await expect(page.locator('.ProseMirror')).toContainText('保留正文');
});

test('V4-07 表格删列后复用图片节点仍按局部容器宽度等比调整', async ({ page }) => {
  await mockEditorWorkspace(page, [], [], '| 图片 | 其他 |\n| --- | --- |\n| ![说明](/api/attachments/image-1/content "{knowra-image-ratio=0.40}") | 文字 |');
  await page.route('**/api/attachments/image-1/content', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="500"><rect width="1000" height="500" fill="blue"/></svg>' }));
  await page.goto('/#/materials/notes/note-1');
  const image = page.locator('.ProseMirror img[data-editor-image]');
  await expect(image).toBeVisible();
  await page.locator('.ProseMirror').evaluate(root => { (root as HTMLElement).style.height = '2500px'; });
  const original = await image.elementHandle();
  const originalWidth = (await image.boundingBox())!.width;
  await page.locator('.ProseMirror td').nth(1).click();
  await page.getByRole('button', { name: '表格操作', exact: true }).click();
  await page.getByRole('menuitem', { name: '删除当前列', exact: true }).click();
  await expect(page.locator('.ProseMirror th')).toHaveCount(1);
  expect(await image.evaluate((node, previous) => node === previous, original)).toBe(true);
  await expect.poll(async () => (await image.boundingBox())!.width).toBeGreaterThan(originalWidth + 10);
  await expect.poll(() => image.evaluate(node => Math.abs(node.getBoundingClientRect().width - node.parentElement!.clientWidth * 0.4))).toBeLessThan(1);
});
