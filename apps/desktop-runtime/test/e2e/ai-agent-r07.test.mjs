import { withPageFailureDiagnostics } from '../fixtures/page-failure-diagnostics.mjs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { chromium, expect } from '@playwright/test';
import { createR07Fixture, inspectR07FixtureState } from '../fixtures/ai-r07-runtime.mjs';

for (const driver of ['json', 'sqlite', ...(process.env.KNOWRA_SYNC_TEST_DATABASE_URL ? ['postgres'] : [])]) {
  test(`R07 ${driver} 实际服务/生产页面与离线模型：聊天、授权工具、追问、取消及恢复`, { timeout: 120000 }, async t => {
    const fixture = await createR07Fixture(driver);
    let browser;
    t.after(async () => { try { await browser?.close(); } finally { await fixture.close(); } });
    browser = await chromium.launch(process.env.KNOWRA_TEST_BROWSER_CHANNEL ? { channel: process.env.KNOWRA_TEST_BROWSER_CHANNEL } : {});
    const context = await browser.newContext();
    const page = await context.newPage();
    await withPageFailureDiagnostics(page, async () => {
    const errors = []; const external = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      if (new URL(route.request().url()).origin !== fixture.origin) { external.push(route.request().url()); return route.abort(); }
      return route.continue();
    });
    await page.goto(fixture.launchUrl);
    const headers = driver === 'sqlite' ? { 'X-Knowra-Dataset': (await fixture.store.identity()).datasetId } : {};
    const post = async (route, data) => {
      const response = await page.request.post(`${fixture.origin}${route}`, { headers, data });
      const result = await response.json(); assert(response.ok(), JSON.stringify(result)); return result.data;
    };
    const space = await post('/api/knowledge/spaces/default', {});
    const note = await post('/api/knowledge/notes', { id: randomUUID(), spaceId: space.id, title: '合成授权笔记', rawMarkdown: '光合作用需要阳光和水。' });
    await post('/api/knowledge/notes', { id: randomUUID(), spaceId: space.id, title: '范围外笔记', rawMarkdown: '范围外秘密绝不能进入模型。' });
    await page.goto(`${fixture.origin}/#/assistant?new=1&noteId=${encodeURIComponent(note.id)}`);
    await expect(page.getByText('离线模拟响应，未调用真实供应商。')).toBeVisible();
    const status = (await (await page.request.get(`${fixture.origin}/api/ai/assistant/status`, { headers })).json()).data;
    assert.equal(status.provider, 'mock'); assert.equal(status.capabilities.providerVerified, false);
    const send = async message => {
      await page.getByRole('textbox', { name: '消息', exact: true }).fill(message);
      await page.getByRole('button', { name: '发送消息', exact: true }).click();
    };
    await send('解释一个概念');
    await expect(page.getByText('合成聊天：可以直接提问。', { exact: true })).toBeVisible();
    assert(fixture.adapter.calls.every(call => call.tools.length === 0));
    assert(!JSON.stringify(fixture.adapter.calls).includes('光合作用需要阳光和水。'));
    await send('继续解释');
    await expect(page.getByText('合成追问：第一轮上下文仍在。', { exact: true })).toBeVisible();
    assert(fixture.adapter.calls[1].messages.some(message => message.role === 'assistant' && message.content === '合成聊天：可以直接提问。'));
    // 用实际 UI 建立固定单篇范围，避免把模型或测试响应当成授权凭据。
    await page.getByRole('button', { name: '设置读取范围', exact: true }).click();
    const grant = page.getByRole('dialog', { name: '授权助手读取资料', exact: true });
    // 首次发送改变路由后 initialNoteId 消失，显式选择一篇笔记。
    await grant.getByRole('button', { name: /授权范围/ }).click();
    await page.getByRole('option', { name: '一篇笔记', exact: true }).click();
    await grant.getByRole('button', { name: / 笔记$/ }).click();
    await page.getByRole('option', { name: '合成授权笔记', exact: true }).click();
    await grant.getByRole('button', { name: '确认授权', exact: true }).click();
    await expect(grant).toHaveCount(0);
    await send('根据笔记解释光合作用');
    await expect(page.getByText('合成资料回答：光合作用需要阳光和水。', { exact: true })).toBeVisible({ timeout: 15000 });
    assert(!JSON.stringify(fixture.adapter.calls).includes('范围外秘密绝不能进入模型。'));
    await page.getByRole('button', { name: /^来源 1 · 合成授权笔记/ }).click();
    await expect(page.getByRole('region', { name: '引用原文定位' }).locator('mark')).toHaveText('光合作用需要阳光和水。');
    const conversations = await fixture.store.listConversations({ ownerId: 'demo', spaceId: space.id });
    assert.equal(conversations.length, 1);
    const conversation = conversations[0];
    const messages = await fixture.store.listMessages(conversation.conversationId);
    const tools = await fixture.store.listToolCalls(messages.at(-1).turnId);
    assert.deepEqual(tools.map(call => call.toolName), ['notes_search', 'notes_read']);
    assert(tools.every(call => call.status === 'succeeded' && call.sourceRefs.every(ref => ref.noteId === note.id)));
    const attempts = await fixture.store.listModelAttempts(messages.at(-1).turnId);
    assert.equal(attempts.length, 2); assert(attempts.every(attempt => attempt.status === 'settled'));
    await page.reload();
    await expect(page.getByText('合成资料回答：光合作用需要阳光和水。', { exact: true })).toBeVisible();
    await send('等待取消');
    await expect.poll(() => fixture.adapter.calls.filter(call => call.messages.at(-1).content.includes('等待取消')).length).toBe(1);
    await page.getByRole('button', { name: '停止生成', exact: true }).click();
    await expect(page.getByText('已请求停止。', { exact: true })).toBeVisible();
    fixture.adapter.releaseLate();
    await expect.poll(async () => (await fixture.store.listTurns()).at(-1).status).toBe('cancelled');
    await expect.poll(async () => (await fixture.store.listModelAttempts()).at(-1).status).toBe('settled');
    assert(!(await fixture.store.listMessages(conversation.conversationId)).some(message => message.content.includes('绝不能显示')));
    await expect(page.getByText('绝不能显示的迟到回答', { exact: true })).toHaveCount(0);
    {
      const launch = await fixture.restart();
      await page.goto(launch);
      await page.goto(`${new URL(launch).origin}/#/assistant?conversationId=${encodeURIComponent(conversation.conversationId)}`);
      await expect(page.getByText('合成资料回答：光合作用需要阳光和水。', { exact: true })).toBeVisible();
      assert.equal((await fixture.store.listConversations({ ownerId: 'demo', spaceId: space.id })).length, 1);
    }
    const budget = fixture.runtime.budgetAuthority;
    const originalStatus = budget.status, originalReserve = budget.reserve;
    const budgetFailure = async () => { const error = new Error('synthetic budget unavailable'); error.code = 'AI_BUDGET_UNAVAILABLE'; throw error; };
    budget.status = budgetFailure; budget.reserve = budgetFailure;
    try {
      await page.reload();
      await expect(page.getByText('云端预算服务不可用，已阻止模型调用。', { exact: true })).toBeVisible();
      await page.getByRole('textbox', { name: '消息', exact: true }).fill('预算故障不发送');
      await expect(page.getByRole('button', { name: '发送消息', exact: true })).toBeDisabled();
      const beforeCalls = fixture.adapter.calls.length;
      const currentHeaders = driver === 'sqlite' ? { 'X-Knowra-Dataset': (await fixture.store.identity()).datasetId } : {};
      const denied = await page.request.post(`${fixture.origin}/api/ai/conversations/${conversation.conversationId}/messages`, {
        headers: { ...currentHeaders, 'X-Knowra-AI-Conversation': '1' },
        data: { content: '预算故障不发送', idempotencyKey: 'r07-budget-denied', execute: true } });
      assert.equal(denied.status(), 202);
      const deniedTurn = (await denied.json()).data;
      await expect.poll(async () => (await fixture.store.getTurn(deniedTurn.turnId)).status).toBe('failed');
      assert.equal(fixture.adapter.calls.length, beforeCalls);
    } finally { budget.status = originalStatus; budget.reserve = originalReserve; }
    const faultPage = await context.newPage();
    let blockedChunks = 0;
    await faultPage.route('**/assets/AssistantView-*.js', route => { blockedChunks++; return route.abort(); });
    await faultPage.goto(`${fixture.origin}/#/assistant`);
    await expect(faultPage.getByRole('heading', { name: 'AI 助手暂时不可用', exact: true })).toBeVisible();
    assert(blockedChunks > 0, '必须实际阻断生产助手 chunk');
    await faultPage.getByRole('button', { name: '返回笔记', exact: true }).click();
    await expect(faultPage).toHaveURL(/#\/materials$/);
    await expect(faultPage.getByText('合成授权笔记', { exact: true }).first()).toBeVisible();
    await faultPage.close();
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    }, () => inspectR07FixtureState(fixture));
  });
}
