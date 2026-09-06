# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: v4-07-editor.spec.ts >> V4-07 格式菜单复用编辑器与内部链接保存链路
- Location: ../../../../apps/web-v4/e2e/v4-07-editor.spec.ts:388:1

# Error details

```
Error: expect(locator).toBeDisabled() failed

Locator:  getByRole('menuitem', { name: '图片', exact: true })
Expected: disabled
Received: enabled
Timeout:  5000ms

Call log:
  - Expect "toBeDisabled" with timeout 5000ms
  - waiting for getByRole('menuitem', { name: '图片', exact: true })
    14 × locator resolved to <div data-rac="" tabindex="-1" role="menuitem" data-key="image" class="_item_r0p5q_244" id="react-aria4387743686-_r_2c_" data-react-aria-pressable="true" data-collection="react-aria4387743686-_r_27_">…</div>
       - unexpected value "enabled"

```

```yaml
- menuitem "图片"
```

# Test source

```ts
  318 |     const selection = window.getSelection();
  319 |     const range = document.createRange();
  320 |     range.selectNodeContents(paragraph);
  321 |     selection?.removeAllRanges();
  322 |     selection?.addRange(range);
  323 |   });
  324 |   await pinEditorToolbar(page);
  325 |   await page.getByRole('button', { name: '格式', exact: true }).click();
  326 |   await page.getByRole('menuitem', { name: /^行内代码/ }).click();
  327 |   await expect.poll(() => savedMarkdown.at(-1) ?? '').toMatch(/^`缩进验收已有正文`/);
  328 |   await expect(editor.locator('p code').first()).toHaveCSS('background-color', 'rgb(224, 242, 254)');
  329 |   await pinEditorToolbar(page);
  330 |   await page.getByRole('button', { name: '格式', exact: true }).click();
  331 |   await page.getByRole('menuitem', { name: /^行内代码/ }).click();
  332 |   await expect.poll(() => savedMarkdown.at(-1) ?? '').not.toMatch(/^`缩进验收已有正文`/);
  333 | 
  334 |   await selectFirstParagraph();
  335 |   await chooseParagraphAction('无序列表');
  336 |   await expect.poll(() => savedMarkdown.at(-1) ?? '').toMatch(/^[*-] 缩进验收已有正文/);
  337 |   await expect(editor.locator('ul').first()).toHaveCSS('list-style-type', 'disc');
  338 | 
  339 |   await chooseParagraphAction('有序列表');
  340 |   await expect.poll(() => savedMarkdown.at(-1) ?? '').toMatch(/^1\. 缩进验收已有正文/);
  341 |   await expect(editor.locator('ol > li').first()).toHaveCSS('counter-increment', 'knowra-ordered-item 1');
  342 |   await expect.poll(() => editor.locator('ol > li').first().evaluate((item) => (
  343 |     getComputedStyle(item, '::before').content
  344 |   ))).not.toBe('none');
  345 | 
  346 |   await chooseParagraphAction('有序列表');
  347 |   await expect.poll(() => savedMarkdown.at(-1) ?? '').not.toMatch(/^1\. /);
  348 | 
  349 |   await selectFirstParagraph();
  350 |   await chooseParagraphAction('任务列表');
  351 |   await expect.poll(() => savedMarkdown.at(-1) ?? '').toMatch(/^[*-] \[ \] 缩进验收已有正文/);
  352 |   await page.locator('li[data-item-type="task"]').first().click({ position: { x: 8, y: 8 } });
  353 |   await expect.poll(() => savedMarkdown.at(-1) ?? '').toMatch(/^[*-] \[x\] 缩进验收已有正文/i);
  354 | 
  355 |   await replaceEditorParagraph(page, editor, '引用验收');
  356 |   await chooseParagraphAction('引用块');
  357 |   await expect.poll(() => savedMarkdown.at(-1) ?? '').toContain('> 引用验收');
  358 | 
  359 |   await replaceEditorParagraph(page, editor, '代码验收');
  360 |   await chooseParagraphAction('代码块');
  361 |   await expect(editor.locator(':scope > p').first()).toHaveText('代码验收');
  362 |   await expect.poll(() => savedMarkdown.at(-1) ?? '').toContain('代码验收\n\n```');
  363 |   await expect(editor.locator('pre').first()).toHaveText('');
  364 |   await expect(editor.locator('pre').first()).toHaveCSS('display', 'block');
  365 |   await expect(editor.locator('pre').first()).toHaveCSS('background-color', 'rgb(244, 241, 234)');
  366 |   await expect(editor.locator('pre code').first()).toHaveCSS('padding', '0px');
  367 | 
  368 |   await replaceEditorParagraph(page, editor, '分割线验收');
  369 |   await chooseParagraphAction('分割线');
  370 |   await expect.poll(() => savedMarkdown.at(-1) ?? '').toMatch(/(?:^|\n)(?:---|\*\*\*)(?:\n|$)/);
  371 | 
  372 |   await replaceEditorParagraph(page, editor, '表格验收');
  373 |   await chooseParagraphAction('表格');
  374 |   await expect.poll(() => savedMarkdown.at(-1) ?? '').toMatch(/\|.*\|/);
  375 |   const firstTableCell = editor.locator('td, th').first();
  376 |   await firstTableCell.locator('p').click({ position: { x: 4, y: 4 } });
  377 |   await expect.poll(() => editor.evaluate(() => {
  378 |     const anchor = window.getSelection()?.anchorNode;
  379 |     const element = anchor instanceof Element ? anchor : anchor?.parentElement;
  380 |     return element?.closest('td, th')?.cellIndex ?? -1;
  381 |   })).toBe(0);
  382 |   await page.keyboard.press('Tab');
  383 |   await expect(editor).toBeFocused();
  384 |   await page.keyboard.type('单元格导航');
  385 |   await expect(editor.locator('td, th').nth(1)).toContainText('单元格导航');
  386 | });
  387 | 
  388 | test('V4-07 格式菜单复用编辑器与内部链接保存链路', async ({ page }) => {
  389 |   test.setTimeout(60_000);
  390 |   const savedMarkdown: string[] = [];
  391 |   await mockEditorWorkspace(page, savedMarkdown);
  392 |   await page.setViewportSize({ width: 1280, height: 800 });
  393 |   await page.goto('/#/materials/notes/note-1');
  394 | 
  395 |   const editor = page.locator('.ProseMirror');
  396 |   await expect(editor).toContainText('已有正文');
  397 |   const selectFirstParagraph = async () => {
  398 |     await editor.locator(':scope > p').first().evaluate((paragraph) => {
  399 |       const selection = window.getSelection();
  400 |       const range = document.createRange();
  401 |       range.selectNodeContents(paragraph);
  402 |       selection?.removeAllRanges();
  403 |       selection?.addRange(range);
  404 |     });
  405 |   };
  406 |   const openFormatMenu = async () => {
  407 |     await pinEditorToolbar(page);
  408 |     await page.getByRole('button', { name: '格式', exact: true }).click();
  409 |     await expect(page.getByRole('menu', { name: '格式', exact: true })).toBeVisible();
  410 |   };
  411 |   const runFormatAction = async (name: string | RegExp) => {
  412 |     await selectFirstParagraph();
  413 |     await openFormatMenu();
  414 |     await page.getByRole('menuitem', { name }).click();
  415 |   };
  416 | 
  417 |   await openFormatMenu();
> 418 |   await expect(page.getByRole('menuitem', { name: '图片', exact: true })).toBeDisabled();
      |                                                                         ^ Error: expect(locator).toBeDisabled() failed
  419 |   for (const name of ['内部链接', '斜体', '删除线']) {
  420 |     await expect(page.getByRole('menuitem', { name, exact: true })).toBeEnabled();
  421 |   }
  422 |   for (const name of [/^加粗/, /^行内代码/, /^高亮/]) {
  423 |     await expect(page.getByRole('menuitem', { name })).toBeEnabled();
  424 |   }
  425 |   await page.keyboard.press('Escape');
  426 | 
  427 |   await runFormatAction(/^加粗/);
  428 |   await expect.poll(() => savedMarkdown.at(-1) ?? '').toMatch(/^\*\*已有正文\*\*/);
  429 |   await runFormatAction(/^加粗/);
  430 | 
  431 |   await runFormatAction('斜体');
  432 |   await expect.poll(() => savedMarkdown.at(-1) ?? '').toMatch(/^\*已有正文\*/);
  433 |   await runFormatAction('斜体');
  434 | 
  435 |   await runFormatAction('删除线');
  436 |   await expect.poll(() => savedMarkdown.at(-1) ?? '').toMatch(/^~~已有正文~~/);
  437 |   await expect(editor.locator('del').first()).toHaveCSS('text-decoration-line', 'line-through');
  438 |   await runFormatAction('删除线');
  439 | 
  440 |   await runFormatAction(/^高亮/);
  441 |   await expect.poll(() => savedMarkdown.at(-1) ?? '').toMatch(/^==已有正文==/);
  442 |   await expect(editor.locator('mark').first()).toBeVisible();
  443 |   await runFormatAction(/^高亮/);
  444 | 
  445 |   await runFormatAction('内部链接');
  446 |   await expect.poll(() => savedMarkdown.at(-1) ?? '').toMatch(/^\[\[已有正文\]\]/);
  447 |   await expect(editor.locator('[data-internal-link]').first()).toHaveText('已有正文');
  448 | });
  449 | 
  450 | test('V4-07 编辑器右键面板复用命令并处理二级菜单跨越与底部碰撞', async ({ page }) => {
  451 |   test.setTimeout(60_000);
  452 |   const savedMarkdown: string[] = [];
  453 |   const browserProblems: string[] = [];
  454 |   page.on('console', (message) => {
  455 |     if (['warning', 'error'].includes(message.type())) browserProblems.push(`${message.type()}: ${message.text()}`);
  456 |   });
  457 |   page.on('pageerror', (error) => browserProblems.push(`pageerror: ${error.message}`));
  458 |   await mockEditorWorkspace(page, savedMarkdown);
  459 |   await page.setViewportSize({ width: 1280, height: 640 });
  460 |   await page.goto('/#/materials/notes/note-1');
  461 | 
  462 |   const editor = page.locator('.ProseMirror');
  463 |   const firstParagraph = editor.locator(':scope > p').first();
  464 |   await firstParagraph.scrollIntoViewIfNeeded();
  465 |   await firstParagraph.evaluate((paragraph) => {
  466 |     const selection = window.getSelection();
  467 |     const range = document.createRange();
  468 |     const text = paragraph.firstChild;
  469 |     if (!text) return;
  470 |     range.setStart(text, 0);
  471 |     range.setEnd(text, Math.min(2, text.textContent?.length ?? 0));
  472 |     selection?.removeAllRanges();
  473 |     selection?.addRange(range);
  474 |   });
  475 |   await firstParagraph.click({ button: 'right', position: { x: 20, y: 10 } });
  476 | 
  477 |   const contextMenu = page.getByRole('menu', { name: '编辑器右键快捷功能' });
  478 |   await expect(contextMenu).toBeVisible();
  479 |   await expect(contextMenu).toHaveCSS('border-top-width', '4px');
  480 |   for (const label of ['剪切', '复制', '粘贴', '删除', '加粗', '斜体', '高亮', '行内代码', '有序', '无序', '任务']) {
  481 |     await expect(contextMenu.getByRole('menuitem', { name: label, exact: true })).toBeEnabled();
  482 |   }
  483 |   await contextMenu.getByRole('menuitem', { name: '删除', exact: true }).click();
  484 |   await expect.poll(() => savedMarkdown.at(-1) ?? '').toMatch(/^正文/);
  485 | 
  486 |   await firstParagraph.evaluate((paragraph) => {
  487 |     const rect = paragraph.getBoundingClientRect();
  488 |     paragraph.dispatchEvent(new MouseEvent('contextmenu', {
  489 |       bubbles: true,
  490 |       cancelable: true,
  491 |       button: 2,
  492 |       clientX: rect.left + 20,
  493 |       clientY: rect.top + 10
  494 |     }));
  495 |   });
  496 |   const headingTrigger = contextMenu.getByRole('menuitem', { name: '标题', exact: true });
  497 |   await headingTrigger.hover();
  498 |   const headingMenu = page.getByRole('menu', { name: '标题', exact: true });
  499 |   await expect(headingMenu).toBeVisible();
  500 | 
  501 |   const headingTriggerBox = await headingTrigger.boundingBox();
  502 |   const headingMenuBox = await headingMenu.boundingBox();
  503 |   expect(headingTriggerBox).not.toBeNull();
  504 |   expect(headingMenuBox).not.toBeNull();
  505 |   if (headingTriggerBox && headingMenuBox) {
  506 |     await page.mouse.move(headingTriggerBox.x + headingTriggerBox.width - 2, headingTriggerBox.y + headingTriggerBox.height / 2);
  507 |     await page.mouse.move(
  508 |       headingMenuBox.x + (headingMenuBox.x >= headingTriggerBox.x ? 2 : headingMenuBox.width - 2),
  509 |       headingMenuBox.y + 20,
  510 |       { steps: 8 }
  511 |     );
  512 |   }
  513 |   await expect(headingMenu).toBeVisible();
  514 |   await headingMenu.getByRole('menuitem', { name: /^H2/ }).click();
  515 |   await expect.poll(() => savedMarkdown.at(-1) ?? '').toMatch(/^## 正文/);
  516 | 
  517 |   const viewport = page.viewportSize();
  518 |   expect(viewport).not.toBeNull();
```