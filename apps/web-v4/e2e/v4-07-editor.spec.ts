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
  const savedCount = savedMarkdown.length;
  await page.getByRole('menuitem', { name: '保存' }).click();
  await expect.poll(() => savedMarkdown.length).toBeGreaterThan(savedCount);

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

test('V4-07 段落菜单复用编辑器命令并通过现有保存链路持久化', async ({ page }) => {
  test.setTimeout(60_000);
  const savedMarkdown: string[] = [];
  await mockEditorWorkspace(page, savedMarkdown);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/#/materials/notes/note-1');

  const editor = page.locator('.ProseMirror');
  await expect(editor).toContainText('已有正文');
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
  await expect.poll(() => savedMarkdown.at(-1) ?? '').toMatch(/^#### 已有正文/);

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
  await page.getByRole('menuitem', { name: '行内代码', exact: true }).click();
  await expect.poll(() => savedMarkdown.at(-1) ?? '').toMatch(/^`已有正文`/);
  await expect(editor.locator('p code').first()).toHaveCSS('background-color', 'rgb(224, 242, 254)');
  await pinEditorToolbar(page);
  await page.getByRole('button', { name: '格式', exact: true }).click();
  await page.getByRole('menuitem', { name: '行内代码', exact: true }).click();
  await expect.poll(() => savedMarkdown.at(-1) ?? '').not.toMatch(/^`已有正文`/);

  await selectFirstParagraph();
  await chooseParagraphAction('无序列表');
  await expect.poll(() => savedMarkdown.at(-1) ?? '').toMatch(/^[*-] 已有正文/);
  await expect(editor.locator('ul').first()).toHaveCSS('list-style-type', 'disc');

  await chooseParagraphAction('有序列表');
  await expect.poll(() => savedMarkdown.at(-1) ?? '').toMatch(/^1\. 已有正文/);
  await expect(editor.locator('ol > li').first()).toHaveCSS('counter-increment', 'knowra-ordered-item 1');
  await expect.poll(() => editor.locator('ol > li').first().evaluate((item) => (
    getComputedStyle(item, '::before').content
  ))).not.toBe('none');

  await chooseParagraphAction('有序列表');
  await expect.poll(() => savedMarkdown.at(-1) ?? '').not.toMatch(/^1\. /);

  await selectFirstParagraph();
  await chooseParagraphAction('任务列表');
  await expect.poll(() => savedMarkdown.at(-1) ?? '').toMatch(/^[*-] \[ \] 已有正文/);
  await page.locator('li[data-item-type="task"]').first().click({ position: { x: 8, y: 8 } });
  await expect.poll(() => savedMarkdown.at(-1) ?? '').toMatch(/^[*-] \[x\] 已有正文/i);

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
});

test('V4-07 编辑菜单完成剪贴板、查找替换与历史命令闭环', async ({ page, context }) => {
  test.setTimeout(60_000);
  const savedMarkdown: string[] = [];
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:5173' });
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
  await expect(page.getByRole('heading', { name: '导入验收一', level: 1 })).toBeVisible();
});

async function mockEditorWorkspace(page: Page, savedMarkdown: string[]): Promise<void> {
  let sourceMarkdown = ['已有正文', ...Array.from({ length: 64 }, (_, index) => `验收段落 ${index + 1}`)].join('\n\n');
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
      }
      data = createNote(sourceMarkdown, true);
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
          ...(copiedNote ? [{ ...copiedNote, rawMarkdown: '', contentLoaded: false }] : []),
          ...importedNotes.map((note) => ({ ...note, rawMarkdown: '', contentLoaded: false }))
        ];
      }
    }
    else if (url.pathname.endsWith('/tags')) data = [];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
  });
}

async function pinEditorToolbar(page: Page): Promise<void> {
  const toolbar = page.getByRole('toolbar', { name: '笔记格式工具栏' });
  await toolbar.evaluate((toolbarElement) => {
    const stage = toolbarElement.closest('article')?.parentElement;
    if (!stage) return;
    stage.scrollTop = 500;
    stage.dispatchEvent(new Event('scroll'));
  });
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
    id, title, folderId, tagIds: [], internalLinks: [],
    rawMarkdown, contentLoaded, favorite: false, deleted: false, status: 'draft'
  };
}
