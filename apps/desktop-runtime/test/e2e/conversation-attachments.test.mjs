import assert from 'node:assert/strict';
import { test } from 'node:test';
import { crc32, deflateSync } from 'node:zlib';
import { chromium, expect } from '@playwright/test';
import { createR07Fixture, inspectR07FixtureState } from '../fixtures/ai-r07-runtime.mjs';
import { withPageFailureDiagnostics } from '../fixtures/page-failure-diagnostics.mjs';

const pngChunk = (type, data) => {
  const name = Buffer.from(type), length = Buffer.alloc(4), checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length); checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
};
const imageHeader = Buffer.alloc(13); imageHeader.writeUInt32BE(1, 0); imageHeader.writeUInt32BE(1, 4); imageHeader[8] = 8; imageHeader[9] = 6;
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', imageHeader),
  pngChunk('IDAT', deflateSync(Buffer.from([0, 255, 0, 0, 255]))), pngChunk('IEND', Buffer.alloc(0))]);
const invalidPixels = Buffer.concat([png.subarray(0, 8), pngChunk('IHDR', imageHeader),
  pngChunk('FAIL', Buffer.from('unsupported critical image chunk')),
  pngChunk('IDAT', deflateSync(Buffer.from([0, 255, 0, 0, 255]))), pngChunk('IEND', Buffer.alloc(0))]);

for (const driver of ['json', 'sqlite', 'postgres']) test(`对话附件 ${driver} 真实页面：文本上传预览、DOC拒绝、粘贴图片、重启恢复与移除`, {
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
    await expect(picker.getByText('附件合成文本，尚未传入模型。', { exact: true })).toBeVisible();
    const conversationId = new URLSearchParams(page.url().split('?')[1]).get('conversationId'); assert(conversationId);
    await picker.getByLabel('添加对话附件').setInputFiles({ name: '合成提纲.md', mimeType: 'text/markdown', buffer: Buffer.from('# 合成 Markdown\n仅在附件预览显示。') });
    await expect(picker.getByText('已保存到此对话；尚未发送给 AI', { exact: true })).toHaveCount(2);
    await picker.getByRole('button', { name: '预览 合成提纲.md', exact: true }).click();
    await expect(picker.getByText('# 合成 Markdown\n仅在附件预览显示。', { exact: true })).toBeVisible();
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
    await picker.getByLabel('添加对话附件').setInputFiles({ name: '像素损坏.png', mimeType: 'image/png', buffer: invalidPixels });
    await expect(picker.getByText('已保存到此对话；尚未发送给 AI', { exact: true })).toHaveCount(4);
    await picker.getByRole('button', { name: '预览 像素损坏.png', exact: true }).click();
    await expect(picker.getByRole('alert')).toContainText('图片内容无法显示'); await expect(picker.getByRole('img')).toHaveCount(0);
    await picker.getByRole('button', { name: '移除 像素损坏.png', exact: true }).click();
    await expect(picker.getByText('已保存到此对话；尚未发送给 AI', { exact: true })).toHaveCount(3);
    let loseUploadResponse = true;
    await page.route('**/api/ai/conversations/*/attachments', async route => {
      if (route.request().method() !== 'POST' || !loseUploadResponse) return route.continue();
      const response = await route.fetch(); assert(response.ok()); loseUploadResponse = false; await route.abort();
    });
    await picker.getByLabel('添加对话附件').setInputFiles({ name: '丢响应资料.txt', mimeType: 'text/plain', buffer: Buffer.from('已保存在会话的合成内容。') });
    await expect(picker.getByRole('alert')).toBeVisible(); await expect(picker.getByText(/上传未完成；尚未发送给 AI/)).toBeVisible();
    assert.equal(fixture.adapter.calls.length, 0, '附件上传、解析和预览不得触发模型调用');
    assert.equal((await fixture.store.listMessages(conversationId, 0, 100)).length, 0, '附件不得暗中成为聊天消息');
    await page.goto(await fixture.restart());
    await page.goto(`${fixture.origin}/#/assistant?conversationId=${encodeURIComponent(conversationId)}`);
    await picker.locator('summary').click();
    await expect(picker.getByText('已保存到此对话；尚未发送给 AI', { exact: true })).toHaveCount(4);
    await expect(picker.getByRole('button', { name: '预览 丢响应资料.txt', exact: true })).toBeVisible();
    await picker.getByRole('button', { name: '预览 合成资料.txt', exact: true }).click();
    await expect(picker.getByText('附件合成文本，尚未传入模型。', { exact: true })).toBeVisible();
    await picker.getByRole('button', { name: '移除 合成资料.txt', exact: true }).click();
    await expect(picker.getByRole('button', { name: '预览 合成资料.txt', exact: true })).toHaveCount(0);
    await picker.getByRole('button', { name: '预览 粘贴图片.png', exact: true }).click(); await expect(picker.getByRole('img')).toBeVisible();
    await picker.getByRole('button', { name: '移除 粘贴图片.png', exact: true }).click(); await expect(picker.getByRole('img')).toHaveCount(0);
    assert.equal(fixture.adapter.calls.length, 0); assert.deepEqual(errors, []);
  }, () => inspectR07FixtureState(fixture));
});
