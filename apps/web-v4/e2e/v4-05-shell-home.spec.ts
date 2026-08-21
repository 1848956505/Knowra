import { expect, test, type Page } from '@playwright/test';

test.describe('V4-05 公共 Shell 与主页', () => {
  test.beforeEach(async ({ page }) => {
    await mockWorkspace(page);
  });

  test('1024 / 1280 / 1440 / 2048 均无页面级横向滚动', async ({ page }) => {
    for (const width of [1024, 1280, 1440, 2048]) {
      await page.setViewportSize({ width, height: width === 1280 ? 720 : 1024 });
      await page.goto('/');
      await expect(page.getByRole('heading', { name: '笔记工作台' })).toBeVisible();
      const overflow = await page.evaluate(() => (
        document.documentElement.scrollWidth - document.documentElement.clientWidth
      ));
      expect(overflow, `${width}px 视口出现横向滚动`).toBeLessThanOrEqual(2);
      await expect(page.getByRole('contentinfo', { name: '状态栏' })).toBeVisible();
    }
  });

  test('全局搜索支持快捷键、过滤、清空、Enter、Escape 与焦点归还', async ({ page }) => {
    await page.goto('/');
    const trigger = page.getByRole('button', { name: '全局搜索' });
    await trigger.focus();
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+K' : 'Control+K');

    const dialog = page.getByRole('dialog', { name: '全局搜索' });
    await expect(dialog).toBeVisible();
    const input = dialog.getByRole('combobox');
    await expect(input).toBeFocused();
    await input.fill('设计');
    await expect(dialog.getByRole('option', { name: /设计复盘/ })).toBeVisible();
    await dialog.getByRole('button', { name: '清除搜索关键字' }).click();
    await expect(input).toHaveValue('');

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();

    await trigger.click();
    await input.fill('设计复盘');
    await page.keyboard.press('Enter');
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('status')).toContainText('设计复盘');
  });

  test('未上线工作域与入口使用真实禁用/门禁语义', async ({ page }) => {
    await page.goto('/');
    const rail = page.getByRole('navigation', { name: '工作域导航' });
    await expect(rail.getByRole('button', { name: /知识/ })).toBeDisabled();
    await expect(rail.getByRole('button', { name: '设置（尚未上线）' })).toBeDisabled();
    await expect(page.getByRole('button', { name: '通知（尚未上线）' })).toBeDisabled();
    await expect(rail.getByRole('button', { name: '组件库' })).toBeEnabled();
    await expect(page.getByRole('button', { name: '新建笔记（Ctrl+N）' })).toBeEnabled();

    await rail.getByRole('button', { name: '组件库' }).click();
    await expect(page).toHaveURL(/#\/showcase$/);
    await expect(page.getByRole('heading', { name: 'Knowra V4 组件展台' })).toBeVisible();
    await expect(rail.getByRole('button', { name: '组件库' })).toHaveAttribute('aria-current', 'page');
    await expect(rail.getByRole('button', { name: '资料', exact: true })).not.toHaveAttribute('aria-current', 'page');
    await rail.getByRole('button', { name: '知境工作区' }).click();
    await expect(page).toHaveURL(/#\/$/);

    await page.goto('/#/knowledge');
    await expect(page.getByRole('heading', { name: '知识库' })).toBeVisible();
    await expect(page.getByText('该工作域尚未上线')).toBeVisible();
    await page.getByRole('main').getByRole('button', { name: '返回主页' }).click();
    await expect(page).toHaveURL(/#\/$/);
  });

  test('移动端与 200% 缩放保留核心入口且无横向滚动', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 843 });
    await page.goto('/');
    await expect(page.getByRole('navigation', { name: '移动端模块导航' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: '工作域导航' })).toBeHidden();
    await expect(page.getByRole('button', { name: '打开全局搜索' })).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(2);

    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(2);
  });

  test('最近资料可通过键盘聚焦并触发可感知反馈', async ({ page }) => {
    await page.goto('/');
    const note = page.getByRole('button', { name: '设计复盘', exact: true });
    await note.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status')).toContainText('设计复盘');
  });

  test('桌面与移动端视觉证据无 console warning/error', async ({ page }) => {
    const consoleProblems: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') {
        consoleProblems.push(`${message.type()}: ${message.text()}`);
      }
    });

    await page.setViewportSize({ width: 1440, height: 1024 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '笔记工作台' })).toBeVisible();
    await page.screenshot({
      path: 'e2e/visual-baseline/screenshots/v4-05-home-1440.png',
      fullPage: false
    });

    await page.setViewportSize({ width: 390, height: 843 });
    await page.goto('/');
    await expect(page.getByRole('navigation', { name: '移动端模块导航' })).toBeVisible();
    await page.screenshot({
      path: 'e2e/visual-baseline/screenshots/v4-05-home-390.png',
      fullPage: false
    });

    expect(consoleProblems).toEqual([]);
  });
});

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

async function mockWorkspace(page: Page): Promise<void> {
  await page.route('**/api/knowledge/**', async (route) => {
    const url = new URL(route.request().url());
    let data: unknown = [];
    if (url.pathname.endsWith('/spaces')) {
      data = [{ id: 'space-1', name: '主空间' }];
    } else if (url.pathname.endsWith('/folders/tree')) {
      data = [{ id: 'folder-1', name: '工作', parentId: null, children: [] }];
    } else if (url.pathname.endsWith('/notes')) {
      data = [{
        id: 'note-1',
        title: '设计复盘',
        folderId: 'folder-1',
        tagIds: ['tag-1'],
        internalLinks: [],
        rawMarkdown: '',
        contentLoaded: false,
        favorite: true,
        deleted: false,
        createdAt: '2026-08-18T08:00:00.000Z',
        updatedAt: '2026-08-20T08:00:00.000Z'
      }];
    } else if (url.pathname.endsWith('/tags')) {
      data = [{ id: 'tag-1', name: '设计' }];
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data })
    });
  });
}
