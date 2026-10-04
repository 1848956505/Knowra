import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium, expect } from '@playwright/test';
import { createR07Fixture } from '../fixtures/ai-r07-runtime.mjs';

const createdAt = '2026-10-04T00:00:00.000Z';
const conversation = { conversationId: 'synthetic-conversation-a', spaceId: 'space-demo', createdAt, updatedAt: createdAt,
  historicalDataset: false, readOnly: false };
const message = (id, role, sequence) => ({ messageId: `${id}-${role}`, turnId: id, sequence, role,
  content: role === 'assistant' ? `${id} 已生成` : `${id} 请求`, sourceRefs: [], citations: [], sourceFree: true, createdAt });
const turn = (id, actionId) => ({ turnId: id, conversationId: conversation.conversationId, requestedPolicyId: null,
  status: 'succeeded', phase: 'finished', errorCode: null, modelAttempts: [], toolCalls: [{ callId: `call-${id}`, ordinal: 1,
    toolName: 'notes_create', argumentsJson: {}, resultJson: { actionId }, status: 'succeeded', sourceRefs: [], errorCode: null }] });
const action = (actionId, requestId, text) => ({ actionId, requestId, status: 'awaitingApproval', errorCode: null,
  expiresAt: '2030-01-01T00:00:00Z', receipt: null, grant: { originTurnId: requestId, revoked: false }, inboxEvents: [],
  plan: { planHash: `hash-${requestId}`, toolName: 'notes_create', items: [{ before: null,
    after: { id: `note-${actionId}`, spaceId: 'space-demo', title: `成果 ${actionId}`, rawMarkdown: text,
      folderId: null, tagIds: [] } }] } });

async function pageWithSyntheticState(t, state) {
  const fixture = await createR07Fixture('json'); let browser;
  t.after(async () => { try { await browser?.close(); } finally { await fixture.close(); } });
  browser = await chromium.launch(); const page = await browser.newPage(); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const json = (route, data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
  await page.route('**/api/**', route => {
    const { pathname } = new URL(route.request().url()), method = route.request().method();
    if (pathname === '/api/knowledge/spaces') return json(route, [{ id: 'space-demo', name: '合成空间' }]);
    if (pathname.startsWith('/api/knowledge/')) return json(route, []);
    if (pathname === '/api/ai/assistant/status') return json(route, { provider: 'mock', modelId: 'synthetic', configured: true,
      executionLocation: 'server', generationAvailable: true, unavailableReason: null, budget: null, simulation: true });
    if (pathname === '/api/ai/inbox') return json(route, state.actions);
    if (pathname === '/api/ai/access-policies') return json(route, []);
    if (pathname.endsWith('/attachments')) return json(route, { attachments: [] });
    if (pathname.endsWith('/messages') && method === 'POST') return json(route, state.send(route.request().postDataJSON()));
    if (pathname.endsWith('/messages')) return json(route, state.messages);
    if (pathname.includes('/turns/')) return json(route, state.turns.get(pathname.split('/').at(-1)));
    if (pathname.startsWith('/api/ai/conversations')) return json(route, [conversation]);
    return route.continue();
  });
  await page.goto(`${fixture.origin}/#/assistant?conversationId=${conversation.conversationId}`);
  await expect(page.getByRole('textbox', { name: '消息' })).toBeVisible();
  return { page, errors };
}

test('成果选择关闭与受控关闭后重开，不保留旧稿误改入口', { timeout: 30000 }, async t => {
  const older = action('draft-old', 'turn-old', '旧稿正文');
  const state = { actions: [older], messages: [message('turn-old', 'user', 1), message('turn-old', 'assistant', 2),
    message('turn-current', 'user', 3), message('turn-current', 'assistant', 4)],
  turns: new Map([['turn-current', turn('turn-current', 'draft-other')]]), sendCount: 0,
  send() { this.sendCount++; return turn('turn-current', 'draft-other'); } };
  const { page, errors } = await pageWithSyntheticState(t, state);
  const send = page.getByRole('button', { name: '发送消息' });
  await page.getByRole('textbox', { name: '消息' }).fill('改这份');
  await page.getByRole('button', { name: 'AI 成果收件箱' }).click();
  await page.getByRole('button', { name: '审阅成果' }).click();
  await expect(send).toBeDisabled();
  await page.getByRole('button', { name: '关闭成果' }).click();
  await page.getByRole('button', { name: 'AI 成果收件箱' }).click();
  await expect(page.getByRole('heading', { name: '成果 draft-old' })).toHaveCount(0);
  await expect(send).toBeEnabled();
  await page.getByRole('button', { name: '审阅成果' }).click();
  await expect(send).toBeDisabled();
  await page.getByRole('button', { name: '对话', exact: true }).click();
  await page.getByRole('button', { name: 'AI 成果收件箱' }).click();
  await expect(page.getByRole('heading', { name: '成果 draft-old' })).toHaveCount(0);
  assert.equal(state.sendCount, 0); assert.deepEqual(errors, []);
});

test('A 建稿到 B 同 action 续改，右侧显示新 plan 后继续发送 C', { timeout: 30000 }, async t => {
  const first = action('draft-a', 'turn-a', '第一版');
  const revised = { ...first, inboxEvents: [{ kind: 'revise', requestId: 'turn-b', originTurnId: 'turn-b', resultPlanHash: 'hash-b' }],
    plan: { ...first.plan, planHash: 'hash-b', items: [{ ...first.plan.items[0],
      after: { ...first.plan.items[0].after, rawMarkdown: '第二版' } }] } };
  const state = { actions: [first], messages: [message('turn-a', 'user', 1), message('turn-a', 'assistant', 2)],
    turns: new Map([['turn-a', turn('turn-a', 'draft-a')], ['turn-b', turn('turn-b', 'draft-a')]]), sent: [],
    send(input) { this.sent.push(input); if (this.sent.length === 1) {
      this.actions = [revised]; this.messages = [...this.messages, message('turn-b', 'user', 3), message('turn-b', 'assistant', 4)];
      return this.turns.get('turn-b');
    } return { ...turn('turn-c', 'draft-a'), status: 'running' }; } };
  const { page, errors } = await pageWithSyntheticState(t, state);
  await page.getByRole('button', { name: 'AI 成果收件箱' }).click();
  await page.getByRole('button', { name: '审阅成果' }).click();
  await expect(page.getByText('第一版')).toBeVisible();
  await page.getByRole('textbox', { name: '消息' }).fill('短一点');
  await page.getByRole('button', { name: '发送消息' }).click();
  await expect(page.getByText('第二版')).toBeVisible();
  await expect(page.getByText('第一版')).toHaveCount(0);
  await page.getByRole('textbox', { name: '消息' }).fill('再改得完整些');
  await expect(page.getByRole('button', { name: '发送消息' })).toBeEnabled();
  await page.getByRole('button', { name: '发送消息' }).click();
  await expect.poll(() => state.sent.length).toBe(2);
  assert.equal(state.sent[0].content, '短一点'); assert.equal(state.sent[1].content, '再改得完整些');
  assert.deepEqual(errors, []);
});
