import { expect, type Page } from '@playwright/test';
import { test } from './fixtures/syntheticTest';
import { mockEditorWorkspace } from './fixtures/editorWorkspace';

const markdown = '| 名称 | 数量 |\n| --- | --- |\n| 苹果 | 2 |\n| 梨 | 3 |';

async function open(page: Page, saved: string[] = []) {
  await mockEditorWorkspace(page, saved, [], markdown);
  await page.goto('/#/materials/notes/note-1');
  await expect(page.locator('[data-editor-ready="true"]')).toBeVisible();
  return page.locator('.ProseMirror table');
}
const rowTexts = (page: Page) => page.locator('.ProseMirror tr').evaluateAll(rows => rows.map(row => row.textContent));

test('悬停单元格显示行列手柄，点击行手柄打开行菜单并可插入、删除与撤销', async ({ page }) => {
  const table = await open(page);
  await table.locator('td').first().hover();
  await expect(page.getByRole('button', { name: '第 2 行操作' })).toBeVisible();
  await expect(page.getByRole('button', { name: '第 1 列操作' })).toBeVisible();
  await page.getByRole('button', { name: '第 2 行操作' }).click();
  await expect(table.locator('tr').nth(1).locator('.selectedCell')).toHaveCount(2);
  await page.getByRole('menuitem', { name: '在下方插入行', exact: true }).click();
  await expect(table.locator('tr')).toHaveCount(4);
  await table.locator('td').first().hover();
  await page.getByRole('button', { name: '第 2 行操作' }).click();
  await page.getByRole('menuitem', { name: '删除行', exact: true }).click();
  await expect(table.locator('tr')).toHaveCount(3);
  await expect(page.locator('.ProseMirror')).toBeFocused();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(table.locator('tr')).toHaveCount(4);
});

test('表头行不可上移、不可在上方插入，列菜单支持对齐与左右移动并保存', async ({ page }) => {
  const saved: string[] = [];
  const table = await open(page, saved);
  await table.locator('th').first().hover();
  await page.getByRole('button', { name: '第 1 行操作' }).click();
  await expect(page.getByRole('menuitem', { name: '在上方插入行', exact: true })).toBeDisabled();
  await expect(page.getByRole('menuitem', { name: '删除行', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '第 1 列操作' }).click();
  await page.getByRole('menuitem', { name: '居中', exact: true }).click();
  await expect(table.locator('th').first()).toHaveCSS('text-align', 'center');
  await table.locator('th').first().hover();
  await page.getByRole('button', { name: '第 1 列操作' }).click();
  await page.getByRole('menuitem', { name: '右移一列', exact: true }).click();
  expect(await rowTexts(page)).toEqual(['数量名称', '2苹果', '3梨']);
  await expect.poll(() => saved.at(-1) ?? '').toContain('数量');
});

test('拖拽行手柄移动数据行，表头保持在首行', async ({ page }) => {
  const saved: string[] = [];
  const table = await open(page, saved);
  await table.locator('td').first().hover();
  const handle = page.getByRole('button', { name: '第 2 行操作' });
  const from = (await handle.boundingBox())!;
  const target = (await table.locator('tr').nth(2).boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 + 10, { steps: 3 });
  await page.mouse.move(from.x + from.width / 2, target.y + target.height - 4, { steps: 5 });
  await page.mouse.up();
  expect(await rowTexts(page)).toEqual(['名称数量', '梨3', '苹果2']);
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect.poll(() => saved.at(-1) ?? '').toMatch(/梨[\s\S]*苹果/);
  await page.keyboard.press('ControlOrMeta+z');
  expect(await rowTexts(page)).toEqual(['名称数量', '苹果2', '梨3']);
});

test('末尾加号快速追加行列，表头行手柄不可拖拽', async ({ page }) => {
  const table = await open(page);
  await table.locator('td').first().hover();
  await page.getByRole('button', { name: '在表格末尾添加行' }).click();
  await expect(table.locator('tr')).toHaveCount(4);
  await table.locator('td').first().hover();
  await page.getByRole('button', { name: '在表格末尾添加列' }).click();
  await expect(table.locator('tr').first().locator('th')).toHaveCount(3);
  await table.locator('th').first().hover();
  const handle = page.getByRole('button', { name: '第 1 行操作' });
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + 8, box.y + 8);
  await page.mouse.down();
  await page.mouse.move(box.x + 8, box.y + 80, { steps: 5 });
  await page.mouse.up();
  expect((await rowTexts(page))[0]).toBe('名称数量');
});

test('键盘可聚焦手柄并用菜单移动列；阅读模式不显示手柄', async ({ page }) => {
  const table = await open(page);
  await table.locator('td').first().hover();
  await page.getByRole('button', { name: '第 1 列操作' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menu', { name: '列操作' })).toBeVisible();
  await page.getByRole('menuitem', { name: '右移一列', exact: true }).click();
  expect((await rowTexts(page))[0]).toBe('数量名称');
  await page.getByRole('button', { name: '视图' }).click();
  await page.getByRole('menuitem', { name: '阅读模式', exact: true }).click();
  await expect(page.locator('[data-table-handles]').getByRole('button')).toHaveCount(0);
});

async function expectSelectedTableCellVisible(page: Page) {
  await expect.poll(() => page.locator('.ProseMirror').evaluate(editor => {
    const anchor = window.getSelection()?.anchorNode;
    const element = anchor instanceof Element ? anchor : anchor?.parentElement;
    const cell = element?.closest('td, th');
    if (!cell || !editor.contains(cell)) return false;
    // 滚动避让以光标所在文本行为准；单元格上内边距允许压在吸顶栏下。
    const rect = (cell.querySelector('p') ?? cell).getBoundingClientRect();
    const stage = editor.closest('[data-editor-scroll-root]')!.getBoundingClientRect();
    const stack = document.querySelector('[data-editor-toolbar-stack]')!.getBoundingClientRect();
    const top = stack.top <= stage.top + 1 ? stack.bottom : stage.top;
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return rect.top >= top && rect.bottom <= stage.bottom && Boolean(hit && cell.contains(hit));
  })).toBe(true);
}

test('手机宽度下手柄为触控尺寸，菜单留在视口内，整表菜单可删除表格', async ({ page }) => {
  const table = await open(page);
  await page.setViewportSize({ width: 390, height: 700 });
  await table.locator('td').first().click();
  const handle = page.getByRole('button', { name: '第 2 行操作' });
  await expect(handle).toBeVisible();
  const box = (await handle.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  await handle.click();
  const menu = page.getByRole('menu', { name: '行操作' });
  await expect(menu).toBeVisible();
  const rect = (await menu.boundingBox())!;
  expect(rect.x).toBeGreaterThanOrEqual(0);
  expect(rect.x + rect.width).toBeLessThanOrEqual(390);
  await page.keyboard.press('Escape');
  await table.locator('td').first().click();
  await page.getByRole('button', { name: '表格整体操作' }).click();
  await page.getByRole('menuitem', { name: '删除整个表格', exact: true }).click();
  await expect(table).toHaveCount(0);
  await expect(page.locator('[data-table-handles]').getByRole('button')).toHaveCount(0);
});

test('长表滚动后选区避开吸顶格式栏，滚出可视区的表格不显示手柄', async ({ page }) => {
  const rows = Array.from({ length: 45 }, (_, index) => `| 第${index + 1}行 |`).join('\n');
  await mockEditorWorkspace(page, [], [], `| 名称 |\n| --- |\n${rows}`);
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.goto('/#/materials/notes/note-1');
  await page.locator('.ProseMirror td').first().click();
  await expect(page.getByRole('button', { name: '第 2 行操作' })).toBeVisible();
  await page.locator('[data-editor-scroll-root]').evaluate(stage => { stage.scrollTop = 500; });
  const cells = page.locator('.ProseMirror td');
  const index = await cells.evaluateAll(elements => {
    const stack = document.querySelector('[data-editor-toolbar-stack]')!.getBoundingClientRect();
    const stage = document.querySelector('[data-editor-scroll-root]')!.getBoundingClientRect();
    return elements.findIndex(cell => {
      const rect = cell.getBoundingClientRect();
      return rect.top >= stack.bottom + 8 && rect.bottom <= stage.bottom - 8;
    });
  });
  expect(index).toBeGreaterThanOrEqual(0);
  await cells.nth(index).click();
  await expectSelectedTableCellVisible(page);
  await expect(page.getByRole('button', { name: '在表格末尾添加行' })).toHaveCount(0);
  await page.locator('.ProseMirror td').nth(index).hover();
  await page.getByRole('button', { name: /^第 \d+ 行操作$/ }).click();
  await page.getByRole('menuitem', { name: '在下方插入行', exact: true }).click();
  await expect(page.locator('.ProseMirror tr')).toHaveCount(47);
  await page.locator('.ProseMirror').press('ArrowDown');
  await expectSelectedTableCellVisible(page);
  for (let step = 0; step < 3; step++) {
    await page.keyboard.press('ArrowUp');
    await expectSelectedTableCellVisible(page);
  }
});

test('工具栏表格按钮用网格选择行列数，键盘可调整并插入', async ({ page }) => {
  await mockEditorWorkspace(page, [], [], '正文');
  await page.goto('/#/materials/notes/note-1');
  await expect(page.locator('[data-editor-ready="true"]')).toBeVisible();
  await page.locator('.ProseMirror p').first().click();
  await page.getByRole('button', { name: '插入表格', exact: true }).click();
  await page.getByRole('button', { name: '4 行 5 列', exact: true }).hover();
  await expect(page.getByText('4 行 × 5 列（含表头）')).toBeVisible();
  await page.getByRole('button', { name: '4 行 5 列', exact: true }).click();
  const table = page.locator('.ProseMirror table');
  await expect(table.locator('tr')).toHaveCount(4);
  await expect(table.locator('tr').first().locator('th')).toHaveCount(5);
  await expect(page.locator('.ProseMirror')).toBeFocused();
  await page.getByRole('button', { name: '插入表格', exact: true }).click();
  await page.getByRole('button', { name: '3 行 3 列', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(page.locator('.ProseMirror table')).toHaveCount(2);
  await expect(page.locator('.ProseMirror table').nth(0).locator('tr').first().locator('th')).toHaveCount(4);
});

test('拖动列边界调整列宽：仅本机保存、不改 Markdown，重载保留，双击恢复', async ({ page }) => {
  const saved: string[] = [];
  const table = await open(page, saved);
  const widths = () => table.locator('th').evaluateAll(cells => cells.map(cell => Math.round(cell.getBoundingClientRect().width)));
  const before = await widths();
  await table.locator('td').first().hover();
  const separator = page.getByRole('separator', { name: '调整第 1 列宽度' });
  const box = (await separator.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + 20, { steps: 6 });
  await page.mouse.up();
  const after = await widths();
  expect(after[0]).toBeGreaterThan(before[0] + 30);
  expect(after[1]).toBeLessThan(before[1] - 30);
  expect(saved).toEqual([]);
  await page.reload();
  await expect(page.locator('[data-editor-ready="true"]')).toBeVisible();
  expect((await widths())[0]).toBeGreaterThan(before[0] + 30);
  await table.locator('td').first().hover();
  await page.getByRole('separator', { name: '调整第 1 列宽度' }).dblclick();
  await expect.poll(async () => (await widths())[0]).toBeLessThanOrEqual(before[0] + 2);
  await table.locator('td').first().hover();
  await page.getByRole('separator', { name: '调整第 1 列宽度' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await widths())[0]).toBeGreaterThan(before[0] + 10);
});
