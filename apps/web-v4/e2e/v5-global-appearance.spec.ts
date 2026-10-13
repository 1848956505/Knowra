import { test } from './fixtures/syntheticTest';
import { expect } from '@playwright/test';
import { createNote, mockEditorWorkspace } from './fixtures/editorWorkspace';

test('全局定稿外观跨页面和浮层生效，明暗切换在刷新后保留', async ({ page }, info) => {
  await mockEditorWorkspace(page, []);
  await page.route('**/api/ai/model-settings', route => route.fulfill({ json: { data: { configured: false, modelId: 'deepseek-flash', modelSupported: true, supportedModelIds: ['deepseek-flash'] } } }));
  await page.addInitScript(() => {
    if (!localStorage.getItem('knowra:notes-index-appearance:v1')) {
      localStorage.setItem('knowra:notes-index-appearance:v1', JSON.stringify({ mode: 'light', theme: 'mono', shape: 'rounded', deco: 'off' }));
    }
  });
  await page.goto('/');
  const shell = page.locator('[data-ni-mode]:has(> #feature-stage)');
  const mode = page.getByRole('button', { name: '切换深色模式' });
  await expect(mode).toBeVisible();
  for (const name of ['素', '完整', '圆角', '胶囊', '黑白配色', '橙色配色']) {
    await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
  }
  await mode.click();
  for (const route of ['/', '/materials', '/materials/notes/note-1', '/knowledge', '/training', '/settings']) {
    await page.goto(`/#${route}`);
    await expect(shell).toHaveAttribute('data-ni-mode', 'dark');
    await expect(shell).toHaveAttribute('data-ni-shape', 'pill');
    await expect(shell).not.toHaveAttribute('data-ni-deco');
    await expect(shell).toHaveAttribute('data-ni-theme', 'orange');
    await expect(page.getByRole('button', { name: '切换浅色模式' })).toBeVisible();
    await expect(page.locator('#feature-stage')).toHaveCSS('background-color', 'rgb(24, 25, 29)');
    const radius = await shell.evaluate(element => getComputedStyle(element).getPropertyValue('--radius-control').trim());
    expect(radius).toBe('999px');
  }
  await page.reload();
  await expect(shell).toHaveAttribute('data-ni-mode', 'dark');
  await page.screenshot({ path: info.outputPath('settings-dark.png'), animations: 'disabled' });
  await page.goto('/#/materials');
  await page.getByRole('button', { name: '更多新建选项' }).click();
  const menu = page.getByRole('menu', { name: '更多新建选项', exact: true });
  await expect(menu).toBeVisible();
  await expect(menu.locator('..')).toHaveAttribute('data-ni-mode', 'dark');
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await page.getByRole('button', { name: '切换浅色模式' }).click();
  await expect(shell).toHaveAttribute('data-ni-mode', 'light');
  await expect(page.locator('#feature-stage')).toHaveCSS('background-color', 'rgb(251, 252, 253)');
  await page.screenshot({ path: info.outputPath('notes-light.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: '切换深色模式' })).toBeVisible();
});

test('默认图标布局与卡片文件夹按原型展示，放大的类型筛选保留切换行为', async ({ page }, info) => {
  await mockEditorWorkspace(page, []);
  const folders = ['工作', '灵感箱', '学习资料', '生活'].map((name, index) => ({ id: `folder-${index + 1}`, name, parentId: null, children: [] }));
  const notes = [14, 7, 10, 3].flatMap((count, index) => Array.from({ length: count }, (_, number) => createNote('', false, `note-${index}-${number}`, `资料 ${index + 1}-${number + 1}`, folders[index].id)));
  await page.route(url => url.pathname === '/api/knowledge/folders/tree', route => route.fulfill({ json: { data: folders } }));
  await page.route(url => url.pathname === '/api/knowledge/notes', route => route.fulfill({ json: { data: notes } }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#/materials');
  const index = page.getByRole('article', { name: '笔记索引' });
  const toolbar = index.getByRole('toolbar', { name: '笔记索引工具栏' });
  await expect(toolbar.getByRole('button', { name: '图标视图' })).toHaveAttribute('aria-pressed', 'true');
  const types = toolbar.getByRole('group', { name: '类型筛选' });
  await expect(types.getByRole('button', { name: '全部', exact: true })).toHaveCSS('min-height', '28px');
  await expect(toolbar.getByRole('button', { name: '图标视图' })).toHaveCSS('min-height', '22px');
  await types.getByRole('button', { name: '文件夹', exact: true }).click();
  await expect(index.locator('[data-entry-item]')).toHaveCount(4);
  await expect(index.locator('[data-folder-style="illustrated"]')).toHaveCount(4);
  await expect(index.locator('[data-kind="folder"]').filter({ hasText: '工作' }).locator('[data-folder-paper]')).toHaveCount(3);
  const heading = index.getByRole('button', { name: /^文件夹\s*4$/ });
  await expect(heading.locator('span > i')).toHaveCount(0);
  await heading.click();
  await expect(index.locator('[data-entry-item]')).toHaveCount(0);
  await heading.click();
  await page.screenshot({ path: info.outputPath('folder-icons.png'), animations: 'disabled' });
  await toolbar.getByRole('button', { name: '卡片视图' }).click();
  const badge = index.locator('[data-folder-style="badge"]');
  await expect(badge).toHaveCount(4);
  await expect(badge.first()).toHaveCSS('width', '40px');
  await expect(badge.first()).toHaveCSS('border-radius', '12px');
  await page.screenshot({ path: info.outputPath('folder-cards.png'), animations: 'disabled' });
  await page.getByRole('button', { name: '切换深色模式' }).click();
  await expect(badge.first()).toHaveCSS('color', 'rgb(242, 107, 29)');
  await page.screenshot({ path: info.outputPath('folder-cards-dark.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  // 窄屏：标题与工具合为一行，类型筛选与布局切换收进“显示选项”。
  await expect(toolbar.getByRole('group', { name: '类型筛选' })).toHaveCount(0);
  const displayOptions = toolbar.getByRole('button', { name: /^显示选项/ });
  await expect(displayOptions).toHaveCSS('min-height', '44px');
  await expect(badge.first()).toBeInViewport();
  await page.screenshot({ path: info.outputPath('folder-cards-mobile.png'), animations: 'disabled' });
  await page.reload();
  await toolbar.getByRole('button', { name: /^显示选项/ }).click();
  await expect(page.getByRole('group', { name: '类型' }).getByRole('button', { name: /^全部/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('group', { name: '布局' }).getByRole('button', { name: '图标' })).toHaveAttribute('aria-pressed', 'true');
});

test('热力图随标签区域滚动，新建按钮两半在桌面和窄屏保持等高', async ({ page }, info) => {
  await mockEditorWorkspace(page, []);
  await page.route(url => url.pathname === '/api/knowledge/folders/tree', route => route.fulfill({ json: { data: Array.from({ length: 30 }, (_, index) => ({ id: `folder-${index + 1}`, name: `目录 ${index + 1}`, parentId: null, children: [] })) } }));
  await page.setViewportSize({ width: 1440, height: 700 });
  await page.goto('/#/materials');
  const sidebar = page.getByRole('complementary', { name: '笔记上下文导航' });
  const distribution = sidebar.getByRole('region', { name: '已加载笔记 · 最近更新时间分布' });
  const scroll = sidebar.locator('[class*="scrollBody"]');
  const trash = sidebar.getByRole('button', { name: /回收站/ });
  await expect(distribution).toHaveCount(1);
  await expect(sidebar.getByRole('treeitem')).toHaveCount(30);
  const position = await distribution.boundingBox();
  const trashBefore = await trash.boundingBox();
  await scroll.evaluate(element => { element.scrollTop = element.scrollHeight; });
  const moved = await distribution.boundingBox();
  expect(position!.y - moved!.y).toBeGreaterThan(100);
  expect((await trash.boundingBox())!.y).toBe(trashBefore!.y);
  await expect(distribution).toBeInViewport();
  await page.screenshot({ path: info.outputPath('sidebar-scroll.png') });
  await page.setViewportSize({ width: 1440, height: 844 });
  const actions = page.getByRole('article', { name: '笔记索引' }).getByLabel('笔记操作', { exact: true });
  const create = actions.getByRole('button', { name: '新建笔记', exact: true });
  const more = actions.getByRole('button', { name: '更多新建选项' });
  const left = await create.boundingBox();
  const right = await more.boundingBox();
  expect(left!.height).toBe(28);
  expect(right!.height).toBe(left!.height);
  expect(right!.y).toBe(left!.y);
  await more.click();
  await expect(page.getByRole('menu', { name: '更多新建选项', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');

  // 窄屏：新建收成圆形“+”，菜单里含新建笔记、新建文件夹、导入 Markdown。
  await page.setViewportSize({ width: 390, height: 844 });
  const compactCreate = page.getByRole('article', { name: '笔记索引' }).getByRole('button', { name: '新建', exact: true });
  await expect(compactCreate).toBeVisible();
  await compactCreate.click();
  const menu = page.getByRole('menu', { name: '新建', exact: true });
  await expect(menu.getByRole('menuitem')).toHaveText(['新建笔记', '新建文件夹', '导入 Markdown']);
  await page.keyboard.press('Escape');
});
