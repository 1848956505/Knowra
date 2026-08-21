import { expect, test, type Page } from '@playwright/test';

test.describe('V4-06 资料索引', () => {
  test.beforeEach(async ({ page }) => {
    await mockLibraryWorkspace(page);
  });

  test('资料目录、主页入口与响应式外壳可用', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/#/materials');

    await expect(page.getByRole('heading', { name: '全部笔记', level: 1 })).toBeVisible();
    await expect(page.getByRole('treegrid', { name: '笔记目录' })).toBeVisible();
    await expect(page.getByRole('treegrid', { name: '笔记目录' }).getByRole('row', { name: /项目/ })).toBeVisible();
    await expect(page.getByRole('button', { name: '资料', exact: true })).toHaveAttribute('aria-current', 'page');
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(2);
    await page.screenshot({ path: 'test-results/v4-06-library-index-1280.png', fullPage: false });

    await page.getByRole('button', { name: '知境工作区' }).click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(page.getByRole('heading', { name: '早安，创造者。' })).toBeVisible();
  });

  test('目录范围、局部搜索、筛选和视图模式互不干扰', async ({ page }) => {
    await page.goto('/#/materials');

    const indexMain = page.getByRole('main', { name: '全部笔记' });
    const search = page.getByRole('searchbox', { name: /在当前笔记中搜索/ });
    await search.fill('学习');
    await expect(indexMain.getByRole('row', { name: /学习笔记/ })).toBeVisible();
    await expect(indexMain.getByRole('row', { name: /项目计划/ })).toHaveCount(0);

    await page.getByRole('button', { name: '清除搜索' }).click();
    await page.getByRole('button', { name: /类型筛选/ }).click();
    await page.getByRole('menuitem', { name: '文稿' }).click();
    await expect(page.getByRole('button', { name: '类型筛选：文稿' })).toBeVisible();
    await expect(page.getByRole('treegrid', { name: '笔记目录' }).getByRole('row', { name: /项目/ })).toBeVisible();
    await expect(indexMain.getByRole('row', { name: /文件夹/ })).toHaveCount(0);

    await page.getByRole('button', { name: '网格视图' }).click();
    await expect(page.getByRole('list', { name: '资料网格' })).toBeVisible();
    await expect(page.getByRole('button', { name: '网格视图' })).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('tab', { name: /收藏/ }).click();
    await expect(page.getByRole('tab', { name: /收藏/ })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('button', { name: /文稿 收藏摘录/ })).toBeVisible();
  });

  test('资料选择、检查器收起与分页提供可感知状态', async ({ page }) => {
    await page.goto('/#/materials');

    await page.getByRole('button', { name: '5', exact: true }).click();
    await expect(page.getByLabel('资料分页').getByText('第 1 / 2 页 · 共 7 条')).toBeVisible();
    await page.getByRole('button', { name: '2', exact: true }).click();
    await expect(page.getByLabel('资料分页').getByText('第 2 / 2 页 · 共 7 条')).toBeVisible();

    await page.getByRole('button', { name: '1', exact: true }).click();
    const selectedRow = page.getByRole('row', { name: /学习笔记/ });
    await selectedRow.click();
    await expect(page.getByRole('heading', { name: '学习笔记', level: 3 })).toBeVisible();
    await expect(page.getByRole('button', { name: '加入收藏' })).toBeVisible();

    await selectedRow.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status')).toContainText('V4-07');

    await page.getByRole('button', { name: '收起资料详情' }).first().click();
    await expect(page.getByRole('button', { name: '展开资料详情' }).first()).toBeVisible();
    await expect(page.getByRole('complementary', { name: '资料详情' })).toBeVisible();
  });

  test('桌面、窄屏与 200% 缩放保持索引可达且无横向滚动', async ({ page }) => {
    const consoleProblems: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') {
        consoleProblems.push(`${message.type()}: ${message.text()}`);
      }
    });
    page.on('pageerror', (error) => consoleProblems.push(`pageerror: ${error.message}`));

    for (const width of [1024, 1280, 1440, 2048]) {
      await page.setViewportSize({ width, height: width === 1280 ? 720 : 1024 });
      await page.goto('/#/materials');
      await expect(page.getByRole('heading', { name: '全部笔记', level: 1 })).toBeVisible();
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(2);
    }

    await page.setViewportSize({ width: 390, height: 843 });
    await page.goto('/#/materials');
    await expect(page.getByRole('navigation', { name: '移动端模块导航' })).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(2);

    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/#/materials');
    await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(2);
    expect(consoleProblems).toEqual([]);
  });
});

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

async function mockLibraryWorkspace(page: Page): Promise<void> {
  const activeNotes = [
    createNote('note-1', '项目计划', 'folder-1', true, 'active', '2026-08-20T08:00:00.000Z'),
    createNote('note-2', '学习笔记', 'folder-1', false, 'draft', '2026-08-19T08:00:00.000Z'),
    createNote('note-3', '未整理记录', null, false, 'draft', '2026-08-18T08:00:00.000Z'),
    createNote('note-4', '收藏摘录', null, true, 'published', '2026-08-17T08:00:00.000Z'),
    createNote('note-5', '五年规划', null, false, 'archived', '2026-08-16T08:00:00.000Z'),
    createNote('note-6', '第六篇', null, false, 'draft', '2026-08-15T08:00:00.000Z')
  ];
  const deletedNote = createNote('note-7', '已删除资料', null, false, 'draft', '2026-08-14T08:00:00.000Z');
  deletedNote.deleted = true;

  await page.route('**/api/knowledge/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    let data: unknown = [];

    if (url.pathname.endsWith('/spaces')) {
      data = [{ id: 'space-1', name: '主空间' }];
    } else if (url.pathname.endsWith('/folders/tree')) {
      data = [{
        id: 'folder-1',
        name: '项目',
        parentId: null,
        children: [{ id: 'folder-2', name: '子目录', parentId: 'folder-1', children: [] }]
      }];
    } else if (url.pathname.endsWith('/notes')) {
      data = [...activeNotes, deletedNote];
    } else if (url.pathname.endsWith('/tags')) {
      data = [{ id: 'tag-1', name: '工作' }];
    } else if (request.method() !== 'GET') {
      data = { id: 'mutation-1' };
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data })
    });
  });
}

function createNote(
  id: string,
  title: string,
  folderId: string | null,
  favorite: boolean,
  status: string,
  updatedAt: string
) {
  return {
    id,
    title,
    folderId,
    tagIds: [],
    internalLinks: [],
    rawMarkdown: `# ${title}\n\n正文`,
    contentLoaded: false,
    favorite,
    deleted: false,
    status,
    sourceType: 'manual',
    createdAt: updatedAt,
    updatedAt
  };
}
