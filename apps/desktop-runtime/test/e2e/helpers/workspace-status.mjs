import { expect } from '@playwright/test';

/** V5 的保存与同步详情从顶栏进入；每次读取都显式打开，避免依赖常驻页脚。 */
export async function openWorkspaceStatus(page) {
  const dialog = page.getByRole('dialog', { name: '工作区状态', exact: true });
  if (!await dialog.isVisible()) {
    await page.getByRole('button', { name: '工作区状态', exact: true }).click();
  }
  await expect(dialog).toBeVisible();
  const status = dialog.getByRole('contentinfo', { name: '状态栏', exact: true });
  await expect(status).toBeVisible();
  return status;
}

/** 先关子对话框再调用；关闭状态弹层后才继续编辑，验证焦点已经回到顶栏。 */
export async function closeWorkspaceStatus(page) {
  const dialog = page.getByRole('dialog', { name: '工作区状态', exact: true });
  if (await dialog.isVisible()) {
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', { name: '工作区状态', exact: true })).toBeFocused();
  }
}

export async function withWorkspaceStatus(page, assertion) {
  const status = await openWorkspaceStatus(page);
  try {
    return await assertion(status);
  } finally {
    await closeWorkspaceStatus(page);
  }
}

export async function openLocalSync(page, name) {
  // 同步控件必须常驻，轮询与事件监听不能依赖详情弹层是否打开。
  await page.getByRole('button', { name, exact: typeof name === 'string' }).click();
  const dialog = page.getByRole('dialog', { name: '云端同步', exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

export async function closeLocalSync(page) {
  const dialog = page.getByRole('dialog', { name: '云端同步', exact: true });
  await dialog.getByRole('button', { name: '关闭对话框', exact: true }).click();
  await expect(dialog).toBeHidden();
}
