import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium, expect } from '@playwright/test';
import { createR07Fixture, inspectR07FixtureState } from '../fixtures/ai-r07-runtime.mjs';
import { withPageFailureDiagnostics } from '../fixtures/page-failure-diagnostics.mjs';

for (const driver of ['json', 'sqlite', 'postgres']) {
  test(`真实 ${driver} 消息快照之后后台完成：终态补读显示笔记计划`, {
    timeout: 60000, skip: driver === 'postgres' && !process.env.KNOWRA_SYNC_TEST_DATABASE_URL
  }, async t => {
    const fixture = await createR07Fixture(driver);
    let browser, releaseModel;
    const barrier = new Promise(resolve => { releaseModel = resolve; });
    t.after(async () => { releaseModel(); try { await browser?.close(); } finally { await fixture.close(); } });
    const complete = fixture.adapter.complete.bind(fixture.adapter);
    fixture.adapter.complete = async request => { await barrier; return complete(request); };
    browser = await chromium.launch();
    const page = await browser.newPage();
    await withPageFailureDiagnostics(page, async () => {
      let oldSnapshot = false, racedTurn;
      await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin !== fixture.origin) return route.abort();
        if (!oldSnapshot && route.request().method() === 'GET' && /\/api\/ai\/conversations\/[^/]+\/messages$/.test(url.pathname)) {
          const response = await route.fetch();
          const messages = (await response.json()).data;
          if (messages.length === 1 && messages[0].role === 'user') {
            oldSnapshot = true;
            racedTurn = messages[0].turnId;
            // 保存真实旧响应，再允许真实执行器提交答案和计划。
            releaseModel();
            await expect.poll(async () => (await fixture.store.getTurn(racedTurn)).status, { timeout: 15000 }).toBe('succeeded');
            const turn = await fixture.store.getTurn(racedTurn);
            const current = await fixture.store.listMessages(turn.conversationId);
            assert(current.some(message => message.messageId === turn.assistantMessageId));
            assert(!messages.some(message => message.messageId === turn.assistantMessageId));
          }
          return route.fulfill({ response });
        }
        return route.continue();
      });
      await page.goto(fixture.launchUrl);
      const headers = driver === 'sqlite' ? { 'X-Knowra-Dataset': (await fixture.store.identity()).datasetId } : {};
      const spaceResponse = await page.request.post(`${fixture.origin}/api/knowledge/spaces/default`, { headers, data: {} });
      assert(spaceResponse.ok());
      await page.goto(`${fixture.origin}/#/assistant?new=1`);
      await expect(page.getByText('离线模拟响应，未调用真实供应商。')).toBeVisible();
      await page.getByRole('button', { name: /本轮用途/ }).click();
      await page.getByRole('option', { name: '生成新笔记计划', exact: true }).click();
      await page.getByRole('textbox', { name: '消息', exact: true }).fill('生成合成笔记');
      await page.getByRole('button', { name: '发送消息', exact: true }).click();
      await expect(page.getByText('已生成笔记计划，尚未写入。请在执行记录中查看差异并确认。', { exact: true })).toBeVisible({ timeout: 15000 });
      assert(oldSnapshot, '必须实际返回消息旧快照，不能跳过竞态屏障');
      assert(racedTurn);
      await expect(page.getByText('执行记录（1）', { exact: true })).toBeVisible();
    }, () => inspectR07FixtureState(fixture));
  });
}
