import { expect, test } from '@playwright/test';

test('助手真实页面展示执行位置、预览外发范围并在门禁关闭时禁用生成', async ({ page }) => {
  let previewRequest: unknown = null;
  await page.route('**/api/ai/assistant/**', async route => {
    const url = new URL(route.request().url());
    let data: unknown = null;
    if (url.pathname.endsWith('/status')) data = { provider: 'deepseek', modelId: 'deepseek-flash',
      configured: true, executionLocation: 'server', generationAvailable: false,
      unavailableReason: '价格与真实外发验收尚未完成，当前只能预览发送范围。' };
    else if (url.pathname.endsWith('/jobs')) data = [];
    else if (url.pathname.endsWith('/preview')) {
      previewRequest = route.request().postDataJSON();
      data = { previewId: 'preview-1', expiresAt: '2030-01-01T00:00:00.000Z', scopeHash: 'scope-1',
        payloadHash: 'payload-1', recipient: 'deepseek', spaceId: 'space-1', estimatedInputTokens: 180,
        omissions: [], sources: [{ sourceId: 'source-1', noteId: 'note-1', noteVersionId: 'version-1',
          start: 0, end: 8, text: 'alpha 正文' }] };
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
  });
  await page.route('**/api/knowledge/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (pathname.endsWith('/spaces')) data = [{ id: 'space-1', name: '主空间' }];
    else if (pathname.endsWith('/notes')) data = [{ id: 'note-1', title: '笔记 A',
      spaceId: 'space-1', folderId: null, tagIds: [], internalLinks: [], rawMarkdown: '',
      contentLoaded: false, favorite: false, deleted: false }];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
  });
  await page.goto('/#/assistant?noteId=note-1');
  await expect(page.getByRole('heading', { name: 'AI 助手', exact: true })).toBeVisible();
  await expect(page.getByText('服务器执行')).toBeVisible();
  await page.getByRole('textbox', { name: '问题' }).fill('alpha 是什么？');
  await page.getByRole('button', { name: '预览发送范围' }).click();
  await expect(page.getByText('alpha 正文')).toBeVisible();
  expect(previewRequest).toMatchObject({ spaceId: 'space-1', question: 'alpha 是什么？',
    scope: { kind: 'note', noteId: 'note-1' } });
  await expect(page.getByRole('button', { name: '确认范围并提问' })).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 843 });
  await expect(page.getByRole('navigation', { name: '移动端模块导航' }).getByRole('button', { name: 'AI 助手' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(2);
});

test('助手模块加载失败只影响助手页面，仍可返回笔记', async ({ page }) => {
  await page.route('**/src/features/assistant/AssistantView.tsx*', route => route.abort());
  await page.route('**/api/knowledge/**', async route => {
    const data = new URL(route.request().url()).pathname.endsWith('/spaces')
      ? [{ id: 'space-1', name: '主空间' }] : [];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
  });
  await page.goto('/#/assistant');
  await expect(page.getByRole('heading', { name: 'AI 助手暂时不可用' })).toBeVisible();
  await page.getByRole('button', { name: '返回笔记' }).click();
  await expect(page).toHaveURL(/#\/materials$/);
  await expect(page.getByRole('navigation', { name: '工作域导航' })).toBeVisible();
});
