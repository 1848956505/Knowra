import { expect, test, type Page } from '@playwright/test';

test('笔记和文件夹可在索引、侧栏及根目录之间拖动', async ({ page }) => {
  const workspace = await mockMoveWorkspace(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '笔记工作台' })).toBeVisible();
  await page.goto('/#/materials');
  await expect(page.getByRole('article', { name: '笔记索引' })).toBeVisible();

  const index = page.getByRole('article', { name: '笔记索引' });
  const noteTile = index.locator('[data-entry-item]').filter({ hasText: '待移动笔记' }).locator('button[draggable="true"]');
  const sidebarFolder = page.locator('[data-folder-id="folder-b"]');
  await noteTile.dragTo(sidebarFolder);
  await expect.poll(() => workspace.notes[0].folderId).toBe('folder-b');
  expect(workspace.patchCalls).toContainEqual({ kind: 'note', id: 'note-1', parentId: 'folder-b' });

  await page.getByRole('button', { name: '展开甲目录' }).click();
  const folderTile = index.locator('[data-entry-item]').filter({ hasText: '甲目录' }).locator('button[draggable="true"]');
  await folderTile.dragTo(page.locator('[data-folder-id="folder-child"]'));
  expect(workspace.patchCalls).toHaveLength(1);

  const targetTile = index.locator('[data-entry-item]').filter({ hasText: '乙目录' }).locator('button[draggable="true"]');
  await folderTile.dragTo(targetTile);
  await expect.poll(() => workspace.folders[0].parentId).toBe('folder-b');
  expect(workspace.patchCalls).toContainEqual({ kind: 'folder', id: 'folder-a', parentId: 'folder-b' });

  await page.getByRole('button', { name: '列表视图' }).click();
  const noteRow = index.locator('tr[data-entry-item]').filter({ hasText: '待移动笔记' }).locator('button[draggable="true"]');
  await noteRow.dragTo(page.locator('[class*="libraryRow"]'));
  await expect.poll(() => workspace.notes[0].folderId).toBeNull();
  expect(workspace.patchCalls).toContainEqual({ kind: 'note', id: 'note-1', parentId: null });
});

test('从侧栏移走笔记后，当前文件夹的服务端索引立即刷新', async ({ page }) => {
  const workspace = await mockMoveWorkspace(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '笔记工作台' })).toBeVisible();
  await page.goto('/#/materials?folder=folder-a');
  await expect(page.getByRole('article', { name: '笔记索引' })).toBeVisible();
  await page.getByRole('button', { name: '展开甲目录' }).click();
  const indexContent = page.getByTestId('notes-index-scroll');
  await expect(indexContent.getByText('待移动笔记')).toBeVisible();

  await page.locator('[data-note-id="note-1"]').dragTo(page.locator('[class*="libraryRow"]'));
  await expect.poll(() => workspace.notes[0].folderId).toBeNull();
  await expect(indexContent.getByText('待移动笔记')).toHaveCount(0);
});

test('悬停文件夹会展开目录，空白区域可接收移动到当前文件夹', async ({ page }) => {
  const workspace = await mockMoveWorkspace(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '笔记工作台' })).toBeVisible();
  await page.goto('/#/materials');
  const index = page.getByRole('article', { name: '笔记索引' });
  await expect(index).toBeVisible();

  const source = index.locator('[data-entry-item]').filter({ hasText: '乙目录' }).locator('button[draggable="true"]');
  const target = page.locator('[data-folder-id="folder-a"]');
  await source.evaluate((element) => {
    const transfer = new DataTransfer();
    (window as typeof window & { __entryDragTransfer?: DataTransfer }).__entryDragTransfer = transfer;
    element.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  });
  await target.evaluate((element) => {
    const transfer = (window as typeof window & { __entryDragTransfer?: DataTransfer }).__entryDragTransfer;
    element.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  });
  await expect(target).toHaveAttribute('data-drop-active', 'true');
  await expect(page.locator('[data-folder-id="folder-child"]')).toBeVisible();
  await source.evaluate((element) => element.dispatchEvent(new DragEvent('dragend', { bubbles: true })));

  await page.goto('/#/materials?folder=folder-b');
  await expect(index).toBeVisible();
  if (await page.getByRole('button', { name: '展开甲目录' }).count()) {
    await page.getByRole('button', { name: '展开甲目录' }).click();
  }
  const noteSource = page.locator('[data-note-id="note-1"]');
  await noteSource.dragTo(page.getByTestId('notes-index-scroll'), { targetPosition: { x: 400, y: 300 } });
  await expect.poll(() => workspace.notes[0].folderId).toBe('folder-b');
  await expect(page.getByTestId('notes-index-scroll').getByText('待移动笔记')).toBeVisible();
});

test('目标目录拒绝移动时保留原位置并显示原因', async ({ page }) => {
  const workspace = await mockMoveWorkspace(page);
  workspace.rejectNextMove();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '笔记工作台' })).toBeVisible();
  await page.goto('/#/materials');
  const note = page.getByRole('article', { name: '笔记索引' })
    .locator('[data-entry-item]').filter({ hasText: '待移动笔记' }).locator('button[draggable="true"]');
  await note.dragTo(page.locator('[data-folder-id="folder-b"]'));
  await expect(page.getByRole('alert')).toContainText('目标目录已有同名笔记');
  expect(workspace.notes[0].folderId).toBe('folder-a');
  await page.getByRole('button', { name: '关闭移动错误提示' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('全部笔记空白处不代表根目录，笔记库页面空白处可移入根目录', async ({ page }) => {
  const workspace = await mockMoveWorkspace(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '笔记工作台' })).toBeVisible();
  await page.goto('/#/materials');
  const index = page.getByRole('article', { name: '笔记索引' });
  const content = page.getByTestId('notes-index-scroll');
  await index.locator('[data-entry-item]').filter({ hasText: '待移动笔记' })
    .locator('button[draggable="true"]').dragTo(content, { targetPosition: { x: 400, y: 300 } });
  expect(workspace.patchCalls).toHaveLength(0);

  await page.goto('/#/materials?scope=root');
  await expect(index).toBeVisible();
  if (await page.getByRole('button', { name: '展开甲目录' }).count()) {
    await page.getByRole('button', { name: '展开甲目录' }).click();
  }
  await page.locator('[data-note-id="note-1"]').dragTo(content, { targetPosition: { x: 400, y: 300 } });
  await expect.poll(() => workspace.notes[0].folderId).toBeNull();
  await expect(content.getByText('待移动笔记')).toBeVisible();
});

async function mockMoveWorkspace(page: Page) {
  const folders = [
    { id: 'folder-a', name: '甲目录', parentId: null as string | null },
    { id: 'folder-child', name: '子目录', parentId: 'folder-a' as string | null },
    { id: 'folder-b', name: '乙目录', parentId: null as string | null }
  ];
  const notes = [{
    id: 'note-1', title: '待移动笔记', folderId: 'folder-a' as string | null,
    tagIds: [], internalLinks: [], rawMarkdown: '', contentLoaded: false,
    favorite: false, deleted: false, status: 'draft',
    createdAt: '2026-08-18T08:00:00.000Z', updatedAt: '2026-08-20T08:00:00.000Z'
  }];
  const patchCalls: Array<{ kind: 'folder' | 'note'; id: string; parentId: string | null }> = [];
  let rejectNextMove = false;
  const tree = (parentId: string | null): unknown[] => folders.filter((folder) => folder.parentId === parentId)
    .map((folder) => ({ ...folder, children: tree(folder.id) }));

  await page.route('**/api/knowledge/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    let data: unknown = [];
    if (request.method() === 'PATCH' && rejectNextMove) {
      rejectNextMove = false;
      await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: { code: 'ENTRY_NAME_CONFLICT', message: '目标目录已有同名笔记' } }) });
      return;
    }
    if (request.method() === 'PATCH' && path.includes('/folders/')) {
      const id = path.split('/').pop()!;
      const body = request.postDataJSON() as { parentId: string | null };
      const folder = folders.find((item) => item.id === id)!;
      folder.parentId = body.parentId;
      patchCalls.push({ kind: 'folder', id, parentId: body.parentId });
      data = folder;
    } else if (request.method() === 'PATCH' && path.includes('/notes/')) {
      const id = path.split('/').pop()!;
      const body = request.postDataJSON() as { folderId: string | null };
      const note = notes.find((item) => item.id === id)!;
      note.folderId = body.folderId;
      patchCalls.push({ kind: 'note', id, parentId: body.folderId });
      data = note;
    } else if (path.endsWith('/spaces')) {
      data = [{ id: 'space-1', name: '主空间' }];
    } else if (path.endsWith('/folders/tree')) {
      data = tree(null);
    } else if (path.endsWith('/notes')) {
      data = notes.filter((note) => {
        if (url.searchParams.get('folderId') && note.folderId !== url.searchParams.get('folderId')) return false;
        if (url.searchParams.get('deletedOnly') === 'true') return note.deleted;
        return !note.deleted;
      });
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
  });
  return { folders, notes, patchCalls, rejectNextMove: () => { rejectNextMove = true; } };
}
