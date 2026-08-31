import { expect, test, type Locator, type Page } from '@playwright/test';

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
  await expect(page.getByRole('toolbar', { name: '笔记格式工具栏' })).toHaveCSS('margin-top', '24px');
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
  await expect(alert).toContainText('自动保存已暂停');
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

test('V4-07 段落菜单复用编辑器命令并通过现有保存链路持久化', async ({ page }) => {
  test.setTimeout(60_000);
  const savedMarkdown: string[] = [];
  await mockEditorWorkspace(page, savedMarkdown);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/#/materials/notes/note-1');

  const editor = page.locator('.ProseMirror');
  await expect(editor).toContainText('已有正文');
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
  await expect(editor.locator('p code').first()).toHaveCSS('background-color', 'rgb(224, 242, 254)');
  await pinEditorToolbar(page);
  await page.getByRole('button', { name: '格式', exact: true }).click();
  await page.getByRole('menuitem', { name: /^行内代码/ }).click();
  await expect.poll(() => savedMarkdown.at(-1) ?? '').not.toMatch(/^`缩进验收已有正文`/);

  await selectFirstParagraph();
  await chooseParagraphAction('无序列表');
  await expect.poll(() => savedMarkdown.at(-1) ?? '').toMatch(/^[*-] 缩进验收已有正文/);
  await expect(editor.locator('ul').first()).toHaveCSS('list-style-type', 'disc');

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
  await expect.poll(() => savedMarkdown.at(-1) ?? '').toContain('```\n代码验收\n```');
  await expect(editor.locator('pre').first()).toHaveCSS('display', 'block');
  await expect(editor.locator('pre').first()).toHaveCSS('background-color', 'rgb(244, 241, 234)');
  await expect(editor.locator('pre code').first()).toHaveCSS('padding', '0px');

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
  await page.keyboard.press('Tab');
  await expect(editor).toBeFocused();
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
  await expect(page.getByRole('menuitem', { name: '图片', exact: true })).toBeDisabled();
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
  await expect.poll(() => savedMarkdown.at(-1) ?? '').toMatch(/^\[\[已有正文\]\]/);
  await expect(editor.locator('[data-internal-link]').first()).toHaveText('已有正文');
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
  await expect(insertMenu.getByRole('menuitem', { name: '图片（待附件适配）' })).toBeDisabled();
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

  await page.getByRole('button', { name: '切换文档检查器' }).click();
  const inspector = page.getByRole('complementary', { name: '文档检查器' });
  await expect(inspector).toBeVisible();
  const contextSidebar = page.getByRole('complementary', { name: '笔记上下文导航' });
  await expect.poll(async () => ({
    inspector: (await inspector.boundingBox())?.width ?? 0,
    context: (await contextSidebar.boundingBox())?.width ?? 0
  })).toEqual({ inspector: 224, context: 224 });
  await expect.poll(async () => ({
    inspector: await inspector.evaluate((element) => getComputedStyle(element).backgroundColor),
    header: await inspector.locator('header').evaluate((element) => getComputedStyle(element).backgroundColor)
  })).toEqual({ inspector: 'rgb(249, 247, 242)', header: 'rgb(249, 247, 242)' });
  await expect(inspector.getByRole('tablist', { name: '检查器视图' })).toBeVisible();
  for (const name of ['信息', '大纲', '链接', 'AI']) {
    await expect(inspector.getByRole('tab', { name, exact: true })).toBeVisible();
  }
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

async function mockEditorWorkspace(
  page: Page,
  savedMarkdown: string[],
  savedRequests: Array<{ noteId: string; markdown: string }> = []
): Promise<void> {
  let sourceMarkdown = ['已有正文', ...Array.from({ length: 64 }, (_, index) => `验收段落 ${index + 1}`)].join('\n\n');
  let relatedMarkdown = '第二篇正文';
  let copiedNote: ReturnType<typeof createNote> | null = null;
  let importedNotes: ReturnType<typeof createNote>[] = [];
  await page.route('**/api/knowledge/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    let data: unknown = [];
    if (url.pathname.endsWith('/spaces')) data = [{ id: 'space-1', name: '主空间' }];
    else if (url.pathname.endsWith('/folders/tree')) data = [{ id: 'folder-1', name: '工作', parentId: null, children: [] }];
    else if (url.pathname.endsWith('/notes/note-1')) {
      if (request.method() === 'PATCH') {
        sourceMarkdown = String((request.postDataJSON() as { rawMarkdown?: string }).rawMarkdown ?? '');
        savedMarkdown.push(sourceMarkdown);
        savedRequests.push({ noteId: 'note-1', markdown: sourceMarkdown });
      }
      data = createNote(sourceMarkdown, true);
    } else if (url.pathname.endsWith('/notes/note-2')) {
      if (request.method() === 'PATCH') {
        relatedMarkdown = String((request.postDataJSON() as { rawMarkdown?: string }).rawMarkdown ?? '');
        savedRequests.push({ noteId: 'note-2', markdown: relatedMarkdown });
      }
      data = createNote(relatedMarkdown, true, 'note-2', '关联验收笔记');
    } else if (url.pathname.endsWith('/notes/note-copy')) {
      data = copiedNote;
    } else if (url.pathname.includes('/notes/note-import-')) {
      data = importedNotes.find((note) => url.pathname.endsWith(note.id)) ?? null;
    } else if (url.pathname.endsWith('/notes/import-markdown-batch')) {
      const items = (request.postDataJSON() as { items: Array<{ title: string; rawMarkdown: string; folderId: string | null }> }).items;
      importedNotes = items.map((item, index) => createNote(
        item.rawMarkdown,
        true,
        `note-import-${index + 1}`,
        item.title,
        item.folderId
      ));
      data = importedNotes;
    } else if (url.pathname.endsWith('/notes')) {
      if (request.method() === 'POST') {
        const input = request.postDataJSON() as { title: string; rawMarkdown: string; folderId: string | null };
        copiedNote = createNote(input.rawMarkdown, true, 'note-copy', input.title, input.folderId);
        data = copiedNote;
      } else {
        data = [
          createNote('', false),
          createNote('', false, 'note-2', '关联验收笔记'),
          ...(copiedNote ? [{ ...copiedNote, rawMarkdown: '', contentLoaded: false }] : []),
          ...importedNotes.map((note) => ({ ...note, rawMarkdown: '', contentLoaded: false }))
        ];
      }
    }
    else if (url.pathname.endsWith('/tags')) data = [
      { id: 'tag-study', name: '学习' },
      { id: 'tag-ai', name: 'AI' }
    ];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
  });
}

async function pinEditorToolbar(page: Page): Promise<void> {
  const toolbar = page.getByRole('toolbar', { name: '笔记格式工具栏' });
  await toolbar.evaluate((toolbarElement) => {
    const stage = toolbarElement.closest('article')?.parentElement;
    if (!stage) return;
    stage.scrollTop = stage.scrollHeight;
    stage.dispatchEvent(new Event('scroll'));
  });
  await expect(toolbar).toHaveAttribute('data-pinned');
  await expect(toolbar.getByRole('button', { name: '段落', exact: true })).toBeVisible();
}

async function replaceEditorParagraph(page: Page, editor: Locator, text: string): Promise<void> {
  await editor.locator(':scope > p').first().click({ clickCount: 3 });
  await page.keyboard.type(text);
}

function createNote(
  rawMarkdown: string,
  contentLoaded: boolean,
  id = 'note-1',
  title = '编辑器验收笔记',
  folderId: string | null = 'folder-1'
) {
  return {
    id,
    title,
    folderId,
    tagIds: id === 'note-1' ? ['tag-study', 'tag-ai'] : [],
    internalLinks: id === 'note-1' ? ['note-2'] : [],
    rawMarkdown,
    contentLoaded,
    favorite: false,
    deleted: false,
    status: 'draft',
    sourceType: 'manual',
    createdAt: '2026-08-12T13:14:00.000Z',
    updatedAt: '2026-08-31T02:32:00.000Z'
  };
}
