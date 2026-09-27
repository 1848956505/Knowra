import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { chromium, expect } from '@playwright/test';
import { startLocalRuntime } from '../../src/runtime-server.mjs';

test('桌面真实页面声明本机只读助手、预览来源，并在云端预算不可用时禁止付费', { timeout: 60000 }, async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'knowra-ai-desktop-page-'));
  const credentialSource = {
    credentialReference: async () => ({ provider: 'deepseek', modelId: 'deepseek-flash', credentialRef: 'synthetic-ref' }),
    resolveCredential: async () => { throw new Error('页面合成验收不得读取真实密钥'); }
  };
  const runtime = await startLocalRuntime({ dataDirectory: directory,
    distRoot: fileURLToPath(new URL('../../../web-v4/dist/', import.meta.url)),
    credentialSource, syncOptions: { autoSync: false } });
  const browser = await chromium.launch();
  t.after(async () => { await browser.close(); await runtime.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(runtime.launchUrl);
  const space = (await (await page.request.post(`${runtime.origin}/api/knowledge/spaces/default`, { data: {} })).json()).data;
  const note = (await (await page.request.post(`${runtime.origin}/api/knowledge/notes`, { data: {
    spaceId: space.id, title: '合成会议笔记', rawMarkdown: '合成事实：会议定在十月三日。'
  } })).json()).data;
  await page.goto(`${runtime.origin}/#/assistant?noteId=${encodeURIComponent(note.id)}`);
  await expect(page.getByRole('heading', { name: 'AI 助手', exact: true })).toBeVisible();
  await expect(page.getByText('本机执行')).toBeVisible();
  await expect(page.getByText('云端预算服务不可用，已阻止模型调用。')).toBeVisible();
  await page.getByRole('textbox', { name: '问题' }).fill('会议日期是什么？');
  await page.getByRole('button', { name: '预览发送范围' }).click();
  await expect(page.getByText('合成事实：会议定在十月三日。')).toBeVisible();
  await expect(page.getByRole('button', { name: '确认范围并提问' })).toBeDisabled();
  assert.equal((await runtime.store.aiRepository.list('aiJob')).length, 0);
  assert.deepEqual(errors, []);
});
