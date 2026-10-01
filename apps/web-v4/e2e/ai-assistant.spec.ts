import { expect, test } from '@playwright/test';

test('对话主页面可不选笔记直接提问，并在刷新和移动端恢复消息', async ({ page }) => {
  let submitted: Record<string, unknown> | null = null;
  let messages: unknown[] = [];
  const conversation = { conversationId: 'conversation-1', spaceId: 'space-1',
    createdAt: '2026-09-27T00:00:00.000Z', updatedAt: '2026-09-27T00:00:00.000Z',
    historicalDataset: false, readOnly: false };
  const turn = { turnId: 'turn-1', conversationId: conversation.conversationId, requestedPolicyId: null,
    status: 'succeeded', phase: 'finished', errorCode: null, toolCalls: [], modelAttempts: [] };
  await page.route('**/api/ai/actions**', route => route.fulfill({ json: { data: [] } }));
  await page.route('**/api/ai/assistant/status', route => route.fulfill({ status: 200,
    contentType: 'application/json', body: JSON.stringify({ data: { provider: 'deepseek', modelId: 'deepseek-flash',
      configured: true, executionLocation: 'server', generationAvailable: true, unavailableReason: null, budget: null } }) }));
  await page.route('**/api/ai/access-policies**', route => route.fulfill({ status: 200,
    contentType: 'application/json', body: JSON.stringify({ data: [] }) }));
  await page.route('**/api/ai/conversations**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    let data: unknown;
    if (url.pathname.endsWith('/messages') && request.method() === 'POST') {
      submitted = request.postDataJSON();
      messages = [
        { messageId: 'message-1', turnId: 'turn-1', sequence: 1, role: 'user', content: '解释梯度下降',
          sourceRefs: [], sourceFree: true, createdAt: conversation.createdAt },
        { messageId: 'message-2', turnId: 'turn-1', sequence: 2, role: 'assistant', content: '梯度下降是一种优化方法。',
          sourceRefs: [], citations: [], sourceFree: true, createdAt: conversation.createdAt }
      ];
      data = turn;
    } else if (url.pathname.endsWith('/messages')) data = messages;
    else if (url.pathname.includes('/turns/')) data = turn;
    else if (request.method() === 'POST') {
      conversation.conversationId = request.postDataJSON().conversationId;
      turn.conversationId = conversation.conversationId;
      data = conversation;
    }
    else data = messages.length ? [conversation] : [];
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
  await page.goto('/#/assistant?new=1');
  await expect(page.getByRole('heading', { name: 'AI 助手', exact: true })).toBeVisible();
  await expect(page.getByText('服务器执行')).toBeVisible();
  const composer = page.getByLabel('提问区');
  const inputBounds = await page.getByRole('textbox', { name: '消息' }).boundingBox();
  const composerBounds = await composer.boundingBox();
  expect(inputBounds?.width).toBeGreaterThan(550);
  expect(composerBounds?.height).toBeLessThan(210);
  await page.getByRole('textbox', { name: '消息' }).focus();
  expect(await page.getByRole('textbox', { name: '消息' }).evaluate(element => getComputedStyle(element).boxShadow)).toBe('none');
  await page.getByRole('textbox', { name: '消息' }).fill('解释梯度下降');
  await page.getByRole('button', { name: '发送消息' }).click();
  await expect(page.getByText('梯度下降是一种优化方法。')).toBeVisible();
  expect(submitted).toMatchObject({ content: '解释梯度下降', requestedPolicyId: null, execute: true });
  await page.reload();
  await expect(page.getByText('梯度下降是一种优化方法。')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 843 });
  await expect(page.getByRole('navigation', { name: '移动端模块导航' }).getByRole('button', { name: 'AI 助手' })).toBeVisible();
  expect((await page.getByLabel('提问区').boundingBox())?.height).toBeLessThan(220);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(2);
  await page.setViewportSize({ width: 320, height: 740 });
  await expect(page.getByRole('button', { name: '普通对话 本轮用途' })).toBeVisible();
  await expect(page.getByRole('button', { name: '普通聊天 · 不读取笔记 资料范围' })).toBeVisible();
  expect((await page.getByLabel('提问区').boundingBox())?.height).toBeLessThan(220);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(2);
});

test('助手模块加载失败只影响助手页面，仍可返回笔记', async ({ page }) => {
  let blockedModules = 0;
  await page.route(/(?:\/src\/features\/assistant\/AssistantView\.tsx|\/assets\/AssistantView-[^/]+\.js)(?:\?.*)?$/, route => { blockedModules++; return route.abort(); });
  await page.route('**/api/knowledge/**', async route => {
    const data = new URL(route.request().url()).pathname.endsWith('/spaces')
      ? [{ id: 'space-1', name: '主空间' }] : [];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
  });
  await page.goto('/#/assistant');
  await expect(page.getByRole('heading', { name: 'AI 助手暂时不可用' })).toBeVisible();
  expect(blockedModules).toBeGreaterThan(0);
  await page.getByRole('button', { name: '返回笔记' }).click();
  await expect(page).toHaveURL(/#\/materials$/);
  await expect(page.getByRole('navigation', { name: '工作域导航' })).toBeVisible();
});
