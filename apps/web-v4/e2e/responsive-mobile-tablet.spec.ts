import { expect, test, type Locator, type Page } from '@playwright/test';
import { mockEditorWorkspace } from './fixtures/editorWorkspace';
import { mockAssistantWorkspace } from './fixtures/assistantWorkspace';

const viewports = [
  { width: 360, height: 800 }, { width: 390, height: 843 }, { width: 412, height: 915 },
  { width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 1024, height: 1366 },
  { width: 1366, height: 1024 }, { width: 843, height: 390 }, { width: 1440, height: 900 }
];
const markdown = '# 手机与平板阅读\n\n合成资料：编辑、保存、返回与长文滚动。\n\n## 重点回顾\n\n' +
  Array.from({ length: 40 }, (_, i) => `第 ${i + 1} 段：保持内容可读，面板独立滚动，核心操作可以触达。`).join('\n\n');

async function expectShellContained(page: Page) {
  const bounds = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth - window.innerWidth,
    height: document.documentElement.scrollHeight - window.innerHeight,
    windowY: window.scrollY, stageY: document.querySelector('#feature-stage')!.scrollTop
  }));
  expect(bounds).toEqual({ width: 0, height: 0, windowY: 0, stageY: 0 });
}
async function expectTouchTarget(locator: Locator) {
  const rect = (await locator.boundingBox())!;
  expect(rect.width).toBeGreaterThanOrEqual(44);
  expect(rect.height).toBeGreaterThanOrEqual(44);
}
async function expectInViewport(page: Page, locator: Locator) {
  const rect = (await locator.boundingBox())!;
  const size = page.viewportSize()!;
  expect(rect.x).toBeGreaterThanOrEqual(0);
  expect(rect.y).toBeGreaterThanOrEqual(0);
  expect(rect.x + rect.width).toBeLessThanOrEqual(size.width + 1);
  expect(rect.y + rect.height).toBeLessThanOrEqual(size.height + 1);
}
async function attachScreenshot(page: Page, name: string) {
  await test.info().attach(name, { body: await page.screenshot(), contentType: 'image/png' });
}

for (const viewport of viewports) {
  const touch = viewport.width !== 1440;
  const compact = viewport.width <= 1100 || touch;
  const activate = (locator: Locator) => touch ? locator.tap() : locator.click();
  test.describe(`${viewport.width}×${viewport.height} ${touch ? '触摸视口' : '桌面回归'}`, () => {
    test.use({ viewport, hasTouch: touch, isMobile: viewport.width < 768 });
    test('列表到编辑、检查器与长文保存返回', async ({ page }) => {
      const saved: string[] = [];
      await mockEditorWorkspace(page, saved, [], markdown);
      await page.goto('/#/materials');
      await expect(page.getByText('笔记索引', { exact: true })).toBeVisible();
      await activate(page.getByRole('button', { name: /^编辑器验收笔记(?: \d|$)/ }).last());
      await expect(page.locator('[data-editor-ready="true"]')).toBeVisible();
      await expectShellContained(page);
      const mobileNav = page.getByRole('navigation', { name: '移动端模块导航' });
      if (viewport.width < 768) {
        const buttons = mobileNav.getByRole('button');
        await expect(buttons).toHaveCount(8);
        const first = (await buttons.first().boundingBox())!;
        for (const button of await buttons.all()) {
          await expectInViewport(page, button); await expectTouchTarget(button);
          expect((await button.boundingBox())!.y).toBe(first.y);
        }
      }
      await attachScreenshot(page, '编辑页初始态');
      const toolbar = page.getByRole('toolbar', { name: '笔记格式工具栏', exact: true });
      for (const name of ['文件', '段落', '编辑', '格式', '视图']) {
        const button = toolbar.getByRole('button', { name, exact: true });
        if (compact) { await expectInViewport(page, button); await expectTouchTarget(button); }
        await activate(button);
        await expect(page.getByRole('menu', { name, exact: true })).toBeVisible();
        await page.keyboard.press('Escape');
      }
      const inspectorTrigger = page.getByRole('button', { name: compact ? '打开文档检查器' : '切换文档检查器', exact: true });
      await activate(inspectorTrigger);
      const inspector = page.getByRole('complementary', { name: '文档检查器', exact: true });
      await expect(inspector).toBeVisible();
      await expectInViewport(page, inspector.getByRole('button', { name: '关闭文档检查器' }));
      await activate(inspector.getByRole('tab', { name: '信息', exact: true }));
      await attachScreenshot(page, '文档检查器');
      await activate(inspector.getByRole('button', { name: '关闭文档检查器' }));
      await expect(inspector).toBeHidden();
      const editor = page.locator('.ProseMirror');
      await editor.locator('p').first().click({ clickCount: 3 });
      await activate(toolbar.getByRole('button', { name: '加粗', exact: true }));
      await expect(editor.locator('strong')).toContainText('合成资料');
      await expect.poll(() => saved.at(-1) ?? '').toContain('**');
      await activate(editor.locator('p').last());
      await page.keyboard.press('End'); await page.keyboard.insertText(' 合成保存验收');
      await expect.poll(() => saved.at(-1) ?? '').toContain('合成保存验收');
      await expect.poll(() => toolbar.getAttribute('data-pinned')).toBe('true');
      await expectShellContained(page);
      const stage = page.locator('[data-editor-scroll-root]');
      expect(await stage.evaluate(element => element.scrollTop)).toBeGreaterThan(100);
      const caretBottom = await editor.evaluate(() => {
        const selection = window.getSelection();
        const range = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
        return range?.getBoundingClientRect().bottom ?? 0;
      });
      expect(caretBottom).toBeLessThanOrEqual((await stage.boundingBox())!.y + (await stage.boundingBox())!.height + 2);
      if (compact) {
        await activate(page.getByRole('button', { name: '笔记列表', exact: true }));
        await expect(page).toHaveURL(/#\/materials$/);
        await activate(page.getByRole('button', { name: /^编辑器验收笔记(?: \d|$)/ }).last());
      } else await page.reload();
      await expect(editor).toContainText('合成保存验收');
      await expectShellContained(page);
    });

    test('AI 对话、附件弹层、成果与返回焦点', async ({ page }) => {
      await mockEditorWorkspace(page, [], [], markdown);
      const mock = await mockAssistantWorkspace(page);
      await page.goto('/#/assistant?conversationId=conversation-1');
      await expect(page.getByText('先阅读笔记，再整理重点。')).toBeVisible();
      await expectShellContained(page);
      const input = page.getByRole('textbox', { name: '消息', exact: true });
      await expectInViewport(page, input);
      const messages = page.locator('[aria-live="polite"]').filter({ has: page.getByText('先阅读笔记，再整理重点。') });
      expect((await messages.boundingBox())!.height).toBeGreaterThanOrEqual(viewport.height < 500 ? 120 : 250);
      await attachScreenshot(page, 'AI 长回答');
      const attachmentTrigger = page.getByRole('button', { name: '附件（1）', exact: true });
      await activate(attachmentTrigger);
      const dialog = page.getByRole('dialog', { name: '对话附件管理' });
      await expect(dialog).toBeVisible(); await expectInViewport(page, dialog);
      await activate(dialog.getByRole('button', { name: '预览 合成资料.txt' }));
      await expect(dialog.getByRole('region', { name: '附件预览' })).toBeVisible();
      await attachScreenshot(page, '对话附件预览');
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden(); await expect(attachmentTrigger).toBeFocused();
      await activate(attachmentTrigger); await activate(dialog.getByRole('button', { name: '关闭附件', exact: true }));
      await expect(dialog).toBeHidden(); await expect(attachmentTrigger).toBeFocused();
      await activate(attachmentTrigger);
      await page.mouse.click(viewport.width - 2, 2);
      await expect(dialog).toBeHidden();
      await expectShellContained(page);
      const inboxTrigger = page.getByRole('button', { name: 'AI 成果收件箱', exact: true });
      await activate(inboxTrigger);
      const inbox = page.getByRole('complementary', { name: 'AI 成果收件箱', exact: true });
      await activate(inbox.getByRole('button', { name: '审阅成果' }));
      await expect(inbox.getByRole('region', { name: '成果预览' })).toBeVisible();
      await expectShellContained(page);
      const inboxScroll = page.locator('[data-ai-inbox-scroll]');
      await inboxScroll.evaluate(element => { element.scrollTop = element.scrollHeight; });
      await expectInViewport(page, inbox.getByRole('button', { name: '确认采纳到笔记', exact: true }));
      await attachScreenshot(page, '成果预览独立滚动');
      await activate(inbox.getByRole('button', { name: '关闭成果', exact: true }));
      await expect(inbox).toBeHidden(); await expect(inboxTrigger).toBeFocused();
      await expectShellContained(page);
      await input.fill('合成追问'); await activate(page.getByRole('button', { name: '发送消息', exact: true }));
      await expect(page.getByText('合成回答：已记录追问。')).toBeVisible();
      expect(mock.submitted).toEqual([expect.objectContaining({ content: '合成追问', requestedPolicyId: null, execute: true })]);
      await page.reload(); await expect(page.getByText('合成回答：已记录追问。')).toBeVisible();
      if (viewport.width < 768) {
        await activate(page.getByRole('button', { name: '菜单', exact: true }));
        const recent = page.getByRole('dialog', { name: '最近对话' });
        await expect(recent).toBeVisible(); await expectInViewport(page, recent);
        await page.keyboard.press('Escape'); await expect(recent).toBeHidden();
        await activate(page.getByRole('navigation', { name: '移动端模块导航' }).getByRole('button', { name: '资料', exact: true }));
        await expect(page).toHaveURL(/#\/materials$/);
      }
    });
  });
}

test('390px 键盘压缩视口保留消息输入、发送与导航', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 540 });
  await mockEditorWorkspace(page, [], [], markdown); await mockAssistantWorkspace(page);
  await page.goto('/#/assistant?conversationId=conversation-1');
  const input = page.getByRole('textbox', { name: '消息', exact: true });
  await input.fill('键盘视口模拟'); await expect(input).toBeFocused();
  await expectInViewport(page, input); await expectInViewport(page, page.getByRole('button', { name: '发送消息' }));
  await expectShellContained(page); await attachScreenshot(page, '缩短视口模拟键盘');
});
