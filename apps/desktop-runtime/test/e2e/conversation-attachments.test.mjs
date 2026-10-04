import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium, expect } from '@playwright/test';
import { createR07Fixture, inspectR07FixtureState } from '../fixtures/ai-r07-runtime.mjs';
import { withPageFailureDiagnostics } from '../fixtures/page-failure-diagnostics.mjs';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==', 'base64');

for (const driver of ['json', 'sqlite', 'postgres']) test(`对话附件 ${driver} 真实页面：未解析存储、DOC拒绝、粘贴图片、重启恢复与移除`, {
  timeout: 60000, skip: driver === 'postgres' && !process.env.KNOWRA_SYNC_TEST_DATABASE_URL
}, async t => {
  const fixture = await createR07Fixture(driver); let browser;
  t.after(async () => { try { await browser?.close(); } finally { await fixture.close(); } });
  browser = await chromium.launch(); const page = await browser.newPage(); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await withPageFailureDiagnostics(page, async () => {
    await page.route('**/*', route => new URL(route.request().url()).origin === fixture.origin ? route.continue() : route.abort());
    await page.goto(fixture.launchUrl);
    const headers = driver === 'sqlite' ? { 'X-Knowra-Dataset': (await fixture.store.identity()).datasetId } : {};
    const space = await page.request.post(`${fixture.origin}/api/knowledge/spaces/default`, { headers, data: {} }); assert(space.ok());
    await page.goto(`${fixture.origin}/#/assistant?new=1`);
    const picker = page.getByRole('region', { name: '对话附件', exact: true });
    await picker.locator('summary').click();
    await picker.getByLabel('添加对话附件').setInputFiles({ name: '合成资料.txt', mimeType: 'text/plain', buffer: Buffer.from('附件合成文本，尚未传入模型。') });
    await expect(picker.getByText('已保存到此对话；尚未发送给 AI', { exact: true })).toHaveCount(1);
    await picker.getByRole('button', { name: '预览 合成资料.txt', exact: true }).click();
    await expect(picker.getByText('仅显示附件信息，当前不提供文档正文预览。', { exact: true })).toBeVisible();
    await expect(picker.getByText('附件合成文本，尚未传入模型。', { exact: true })).toHaveCount(0);
    const conversationId = new URLSearchParams(page.url().split('?')[1]).get('conversationId'); assert(conversationId);
    const stored = (await (await page.request.get(`${fixture.origin}/api/ai/conversations/${conversationId}/attachments`, { headers })).json()).data.attachments;
    assert.equal(stored[0].parseStatus, 'not_parsed'); assert.equal(stored[0].errorCode, 'AI_ATTACHMENT_NOT_PARSED');
    assert.equal(stored[0].parserVersion, null); assert.equal(stored[0].parsedTextHash, null); assert.equal(stored[0].imageMetadata, null);
    await expect(picker.getByText('未解析，不能用于附件问答；尚未发送给 AI。', { exact: true })).toHaveCount(2);
    await picker.getByLabel('添加对话附件').setInputFiles({ name: '合成提纲.md', mimeType: 'text/markdown', buffer: Buffer.from('# 合成 Markdown\n仅在附件预览显示。') });
    await expect(picker.getByText('已保存到此对话；尚未发送给 AI', { exact: true })).toHaveCount(2);
    await picker.getByRole('button', { name: '预览 合成提纲.md', exact: true }).click();
    const markdownPreview = picker.getByRole('region', { name: '附件预览', exact: true });
    await expect(markdownPreview.getByText('合成提纲.md', { exact: true })).toBeVisible();
    await expect(markdownPreview.getByText('仅显示附件信息，当前不提供文档正文预览。', { exact: true })).toBeVisible();
    await expect(picker.getByLabel('添加对话附件')).toBeEnabled();
    await expect(picker.getByText('# 合成 Markdown\n仅在附件预览显示。', { exact: true })).toHaveCount(0);
    await picker.getByLabel('添加对话附件').setInputFiles({ name: '旧版资料.doc', mimeType: 'application/msword', buffer: Buffer.from('unsupported') });
    await expect(picker.getByRole('alert')).toContainText('旧版 DOC 暂不支持');
    await picker.getByRole('button', { name: '移除待上传文件', exact: true }).click();
    await picker.focus();
    await picker.evaluate((element, bytes) => {
      const transfer = new DataTransfer(); transfer.items.add(new File([new Uint8Array(bytes)], 'clipboard.png', { type: 'image/png' }));
      element.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: transfer }));
    }, Array.from(png));
    await expect(picker.getByText('已保存到此对话；尚未发送给 AI', { exact: true })).toHaveCount(3);
    await expect(picker.getByText('当前模型尚不支持图片理解。', { exact: true })).toBeVisible();
    await picker.getByRole('button', { name: '预览 粘贴图片.png', exact: true }).click();
    await expect(picker.getByRole('img')).toBeVisible();
    await expect.poll(() => picker.getByRole('img').evaluate(image => image.naturalWidth)).toBe(1);
    let loseUploadResponse = true; const retriedUploads = [];
    await page.route('**/api/ai/conversations/*/attachments', async route => {
      if (route.request().method() !== 'POST') return route.continue();
      retriedUploads.push(route.request().postDataJSON());
      if (!loseUploadResponse) return route.continue();
      const response = await route.fetch(); assert(response.ok()); loseUploadResponse = false; await route.abort();
    });
    await picker.getByLabel('添加对话附件').setInputFiles({ name: '丢响应资料.txt', mimeType: 'text/plain', buffer: Buffer.from('已保存在会话的合成内容。') });
    await expect(picker.getByRole('alert')).toBeVisible(); await expect(picker.getByText(/上传未完成；尚未发送给 AI/)).toBeVisible();
    await picker.getByRole('button', { name: '重试上传', exact: true }).click();
    await expect(picker.getByText('已保存到此对话；尚未发送给 AI', { exact: true })).toHaveCount(4);
    assert.equal(retriedUploads.length, 2); assert.deepEqual(retriedUploads[0], retriedUploads[1], '重试复用上传幂等键与原payload');
    assert.equal(fixture.adapter.calls.length, 0, '附件保存和信息预览不得触发模型调用');
    assert.equal((await fixture.store.listMessages(conversationId, 0, 100)).length, 0, '附件不得暗中成为聊天消息');
    await page.goto(await fixture.restart());
    await page.goto(`${fixture.origin}/#/assistant?conversationId=${encodeURIComponent(conversationId)}`);
    await picker.locator('summary').click();
    await expect(picker.getByText('已保存到此对话；尚未发送给 AI', { exact: true })).toHaveCount(4);
    await expect(picker.getByRole('button', { name: '预览 丢响应资料.txt', exact: true })).toBeVisible();
    await picker.getByRole('button', { name: '预览 合成资料.txt', exact: true }).click();
    await expect(picker.getByText('仅显示附件信息，当前不提供文档正文预览。', { exact: true })).toBeVisible();
    await expect(picker.getByText('附件合成文本，尚未传入模型。', { exact: true })).toHaveCount(0);
    await picker.getByRole('button', { name: '移除 合成资料.txt', exact: true }).click();
    await expect(picker.getByRole('button', { name: '预览 合成资料.txt', exact: true })).toHaveCount(0);
    await picker.getByRole('button', { name: '预览 粘贴图片.png', exact: true }).click(); await expect(picker.getByRole('img')).toBeVisible();
    await picker.getByRole('button', { name: '移除 粘贴图片.png', exact: true }).click(); await expect(picker.getByRole('img')).toHaveCount(0);
    assert.equal(fixture.adapter.calls.length, 0); assert.deepEqual(errors, []);
  }, () => inspectR07FixtureState(fixture));
});
