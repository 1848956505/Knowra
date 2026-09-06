# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: v4-07-editor.spec.ts >> V4-07 编辑器右键面板复用命令并处理二级菜单跨越与底部碰撞
- Location: ../../../../apps/web-v4/e2e/v4-07-editor.spec.ts:450:1

# Error details

```
Error: expect(locator).toBeDisabled() failed

Locator: getByRole('menu', { name: '插入', exact: true }).getByRole('menuitem', { name: '图片（待附件适配）' })
Expected: disabled
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeDisabled" with timeout 5000ms
  - waiting for getByRole('menu', { name: '插入', exact: true }).getByRole('menuitem', { name: '图片（待附件适配）' })

```

```yaml
- link "跳到主内容":
  - /url: "#feature-stage"
- navigation "工作域导航":
  - button "知境工作区"
  - group "全局操作":
    - button "全局搜索"
    - button "新建笔记"
  - group "主要工作域":
    - button "资料"
    - button "知识（尚未上线）" [disabled]
    - button "试题（尚未上线）" [disabled]
    - button "执行（尚未上线）" [disabled]
  - group "工具":
    - button "通知（尚未上线）" [disabled]
    - button "设置（尚未上线）" [disabled]
    - button "组件库"
    - button "我的（尚未上线）" [disabled]
- complementary "笔记上下文导航":
  - text: 笔记
  - button "笔记更多操作"
  - button "新建笔记"
  - searchbox "搜索笔记目录"
  - region "快速入口":
    - heading "快速入口" [level=2]
    - button "全部笔记 2"
    - button "最近编辑 2"
    - button "收藏 0"
    - button "未整理 0"
  - region "文件夹":
    - heading "文件夹" [level=2]
    - button "新建文件夹"
    - button "笔记库 1"
    - tree "笔记文件夹":
      - treeitem "展开工作 工作 2" [level=1]:
        - button "展开工作"
        - button "工作 2"
  - region "标签":
    - heading "标签" [level=2]:
      - button "标签" [expanded]: 标签 2
    - button "新建标签"
    - button "标签更多操作"
    - button "学习"
    - button "AI"
  - button "回收站 0"
- main:
  - region "笔记编辑页面骨架":
    - tablist "打开的笔记":
      - tab "编辑器验收笔记" [selected]: 01 编辑器验收笔记
      - button "关闭编辑器验收笔记"
      - button "查看全部标签页"
      - button "新建笔记"
    - article "编辑器验收笔记":
      - text: NOTE · DRAFT
      - heading "编辑器验收笔记" [level=1]:
        - textbox "笔记标题": 编辑器验收笔记
      - paragraph: draft 工作 更新于 08/31
      - toolbar "笔记格式工具栏":
        - button "文件"
        - button "段落"
        - button "编辑"
        - button "格式"
        - button "视图"
        - button "一级标题":
          - strong: H1
        - button "二级标题":
          - strong: H2
        - button "三级标题":
          - strong: H3
        - button "加粗":
          - strong: B
        - button "斜体":
          - emphasis: I
        - button "行内代码"
        - button "无序列表"
        - button "引用"
        - button "插入表格"
        - button "插入图片"
        - button "收藏当前笔记"
        - button "打开插入菜单"
        - button "切换文档检查器"
        - button "更多文档操作（尚未接入）" [disabled]
      - button "选择要插入的图片"
      - textbox "笔记正文":
        - heading "正文" [level=2]
        - paragraph: 验收段落 1
        - paragraph: 验收段落 2
        - paragraph: 验收段落 3
        - paragraph: 验收段落 4
        - paragraph: 验收段落 5
        - paragraph: 验收段落 6
        - paragraph: 验收段落 7
        - paragraph: 验收段落 8
        - paragraph: 验收段落 9
        - paragraph: 验收段落 10
        - paragraph: 验收段落 11
        - paragraph: 验收段落 12
        - paragraph: 验收段落 13
        - paragraph: 验收段落 14
        - paragraph: 验收段落 15
        - paragraph: 验收段落 16
        - paragraph: 验收段落 17
        - paragraph: 验收段落 18
        - paragraph: 验收段落 19
        - paragraph: 验收段落 20
        - paragraph: 验收段落 21
        - paragraph: 验收段落 22
        - paragraph: 验收段落 23
        - paragraph: 验收段落 24
        - paragraph: 验收段落 25
        - paragraph: 验收段落 26
        - paragraph: 验收段落 27
        - paragraph: 验收段落 28
        - paragraph: 验收段落 29
        - paragraph: 验收段落 30
        - paragraph: 验收段落 31
        - paragraph: 验收段落 32
        - paragraph: 验收段落 33
        - paragraph: 验收段落 34
        - paragraph: 验收段落 35
        - paragraph: 验收段落 36
        - paragraph: 验收段落 37
        - paragraph: 验收段落 38
        - paragraph: 验收段落 39
        - paragraph: 验收段落 40
        - paragraph: 验收段落 41
        - paragraph: 验收段落 42
        - paragraph: 验收段落 43
        - paragraph: 验收段落 44
        - paragraph: 验收段落 45
        - paragraph: 验收段落 46
        - paragraph: 验收段落 47
        - paragraph: 验收段落 48
        - paragraph: 验收段落 49
        - paragraph: 验收段落 50
        - paragraph: 验收段落 51
        - paragraph: 验收段落 52
        - paragraph: 验收段落 53
        - paragraph: 验收段落 54
        - paragraph: 验收段落 55
        - paragraph: 验收段落 56
        - paragraph: 验收段落 57
        - paragraph: 验收段落 58
        - paragraph: 验收段落 59
        - paragraph: 验收段落 60
        - paragraph: 验收段落 61
        - paragraph: 验收段落 62
        - paragraph: 验收段落 63
        - paragraph: 验收段落 64
      - button "编辑器右键快捷功能"
- contentinfo "状态栏":
  - button "跳转到「笔记库」": 笔记库
  - text: 编辑器验收笔记 已保存
  - time: 10:32
  - text: 已同步
  - button "切换侧栏" [pressed]
  - button "切换检查器"
  - button "切换专注模式"
- status
- dialog "编辑器右键快捷功能":
  - button "Dismiss"
  - menu "编辑器右键快捷功能":
    - group "编辑":
      - text: 编辑
      - menuitem "剪切"
      - menuitem "复制"
      - menuitem "粘贴"
      - menuitem "删除"
    - group "格式":
      - text: 格式
      - menuitem "加粗"
      - menuitem "斜体"
      - menuitem "高亮"
      - menuitem "行内代码"
      - menuitem "删除线"
      - menuitem "引用"
    - group "列表":
      - text: 列表
      - menuitem "有序"
      - menuitem "无序"
      - menuitem "任务"
      - menuitem "减少缩进"
      - menuitem "增加缩进"
    - separator
    - menuitem "标记为重要内容"
    - menuitem "标题"
    - menuitem "插入" [expanded]
  - button "Dismiss"
- dialog "插入":
  - menu "插入":
    - menuitem "表格"
    - menuitem "水平分割线"
    - menuitem "代码块"
    - menuitem "引用"
    - menuitem "图片"
    - separator
    - menuitem "在上方插入段落"
    - menuitem "在下方插入段落"
  - button "Dismiss"
```

# Test source

```ts
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
  519 |   await editor.locator(':scope > p').last().evaluate((paragraph, viewportHeight) => {
  520 |     const rect = paragraph.getBoundingClientRect();
  521 |     paragraph.dispatchEvent(new MouseEvent('contextmenu', {
  522 |       bubbles: true,
  523 |       cancelable: true,
  524 |       button: 2,
  525 |       clientX: rect.left + 24,
  526 |       clientY: Number(viewportHeight) - 3
  527 |     }));
  528 |   }, viewport?.height ?? 640);
  529 |   await expect(contextMenu).toBeVisible();
  530 |   const bottomMenuBox = await contextMenu.boundingBox();
  531 |   expect(bottomMenuBox).not.toBeNull();
  532 |   if (bottomMenuBox && viewport) {
  533 |     expect(bottomMenuBox.y).toBeGreaterThanOrEqual(11);
  534 |     expect(bottomMenuBox.y + bottomMenuBox.height).toBeLessThanOrEqual(viewport.height - 11);
  535 |   }
  536 | 
  537 |   const insertTrigger = contextMenu.getByRole('menuitem', { name: '插入', exact: true });
  538 |   await insertTrigger.hover();
  539 |   const insertMenu = page.getByRole('menu', { name: '插入', exact: true });
  540 |   await expect(insertMenu).toBeVisible();
> 541 |   await expect(insertMenu.getByRole('menuitem', { name: '图片（待附件适配）' })).toBeDisabled();
      |                                                                         ^ Error: expect(locator).toBeDisabled() failed
  542 |   const insertMenuBox = await insertMenu.boundingBox();
  543 |   expect(insertMenuBox).not.toBeNull();
  544 |   if (insertMenuBox && viewport) {
  545 |     expect(insertMenuBox.y).toBeGreaterThanOrEqual(11);
  546 |     expect(insertMenuBox.y + insertMenuBox.height).toBeLessThanOrEqual(viewport.height - 11);
  547 |   }
  548 |   await page.screenshot({ path: 'e2e/visual-baseline/screenshots/v4-07-editor-context-menu-1280.png', fullPage: false });
  549 |   await insertMenu.getByRole('menuitem', { name: '水平分割线', exact: true }).click();
  550 |   await expect.poll(() => savedMarkdown.at(-1) ?? '').toMatch(/(?:^|\n)(?:---|\*\*\*)(?:\n|$)/);
  551 |   expect(browserProblems).toEqual([]);
  552 | });
  553 | 
  554 | test('V4-07 编辑菜单完成剪贴板、查找替换与历史命令闭环', async ({ page, context }) => {
  555 |   test.setTimeout(60_000);
  556 |   const savedMarkdown: string[] = [];
  557 |   const baseUrl = process.env.V4_BASE_URL ?? 'http://127.0.0.1:5173';
  558 |   await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(baseUrl).origin });
  559 |   await mockEditorWorkspace(page, savedMarkdown);
  560 |   await page.setViewportSize({ width: 1280, height: 600 });
  561 |   await page.goto('/#/materials/notes/note-1');
  562 | 
  563 |   const editor = page.locator('.ProseMirror');
  564 |   const openEditMenu = async () => {
  565 |     await pinEditorToolbar(page);
  566 |     await page.getByRole('button', { name: '编辑', exact: true }).click();
  567 |     await expect(page.getByRole('menu', { name: '编辑', exact: true })).toBeVisible();
  568 |   };
  569 | 
  570 |   await openEditMenu();
  571 |   for (const label of ['撤销', '重做', '剪切', '复制', '粘贴', '查找', '替换', '全选']) {
  572 |     await expect(page.getByRole('menuitem', { name: label, exact: true })).toBeEnabled();
  573 |   }
  574 |   await page.getByRole('menuitem', { name: '全选', exact: true }).click();
  575 |   await openEditMenu();
  576 |   await page.getByRole('menuitem', { name: '复制', exact: true }).click();
  577 |   await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('验收段落 48');
  578 | 
  579 |   await page.evaluate(() => navigator.clipboard.writeText('\n粘贴验收'));
  580 |   await editor.locator(':scope > p').last().click();
  581 |   await page.keyboard.press('End');
  582 |   await openEditMenu();
  583 |   await page.getByRole('menuitem', { name: '粘贴', exact: true }).click();
  584 |   await expect.poll(() => savedMarkdown.at(-1) ?? '').toContain('粘贴验收');
  585 | 
  586 |   await editor.locator(':scope > p').first().evaluate((paragraph) => {
  587 |     const selection = window.getSelection();
  588 |     const range = document.createRange();
  589 |     range.selectNodeContents(paragraph);
  590 |     selection?.removeAllRanges();
  591 |     selection?.addRange(range);
  592 |   });
  593 |   await openEditMenu();
  594 |   await page.getByRole('menuitem', { name: '剪切', exact: true }).click();
  595 |   await expect.poll(() => savedMarkdown.at(-1) ?? '').not.toMatch(/^已有正文/);
  596 | 
  597 |   await openEditMenu();
  598 |   await page.getByRole('menuitem', { name: '撤销', exact: true }).click();
  599 |   await expect.poll(() => savedMarkdown.at(-1) ?? '').toMatch(/^已有正文/);
  600 |   await openEditMenu();
  601 |   await page.getByRole('menuitem', { name: '重做', exact: true }).click();
  602 |   await expect.poll(() => savedMarkdown.at(-1) ?? '').not.toMatch(/^已有正文/);
  603 |   await openEditMenu();
  604 |   await page.getByRole('menuitem', { name: '撤销', exact: true }).click();
  605 | 
  606 |   await openEditMenu();
  607 |   await page.getByRole('menuitem', { name: '查找', exact: true }).click();
  608 |   const findPanel = page.getByRole('region', { name: '查找面板' });
  609 |   await findPanel.getByRole('textbox', { name: '查找内容' }).fill('验收段落 10');
  610 |   await findPanel.getByRole('button', { name: '下一处' }).click();
  611 |   await expect(findPanel.getByRole('status')).toHaveText('第 1 / 1 处');
  612 |   await expect(editor.locator('.editor-find-match-active')).toHaveCount(1);
  613 |   await page.keyboard.press('Escape');
  614 |   await expect(findPanel).toBeHidden();
  615 | 
  616 |   await openEditMenu();
  617 |   await page.getByRole('menuitem', { name: '替换', exact: true }).click();
  618 |   const replacePanel = page.getByRole('region', { name: '替换面板' });
  619 |   await replacePanel.getByRole('textbox', { name: '查找内容' }).fill('验收段落 10');
  620 |   await replacePanel.getByRole('textbox', { name: '替换为' }).fill('已替换段落');
  621 |   await replacePanel.getByRole('button', { name: '全部替换' }).click();
  622 |   await expect.poll(() => savedMarkdown.at(-1) ?? '').toContain('已替换段落');
  623 |   await expect(editor).not.toContainText('验收段落 10');
  624 | });
  625 | 
  626 | test('V4-07 原生粘贴保留语义并清理外部样式与不安全图片', async ({ page }) => {
  627 |   const savedMarkdown: string[] = [];
  628 |   await mockEditorWorkspace(page, savedMarkdown);
  629 |   await page.goto('/#/materials/notes/note-1');
  630 | 
  631 |   const editor = page.locator('.ProseMirror');
  632 |   const lastParagraph = editor.locator(':scope > p').last();
  633 |   await lastParagraph.click();
  634 |   await page.keyboard.press('End');
  635 |   await dispatchPaste(page, {
  636 |     html: '<p style="color: red; font-size: 40px"><strong>富文本验收</strong></p>',
  637 |     text: '富文本验收'
  638 |   });
  639 |   const richText = editor.locator('strong', { hasText: '富文本验收' });
  640 |   await expect(richText).toBeVisible();
  641 |   await expect(richText).not.toHaveAttribute('style');
```