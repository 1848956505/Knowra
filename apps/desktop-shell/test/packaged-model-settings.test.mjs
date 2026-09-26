import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron, expect } from '@playwright/test';
import { executablePath } from './packaged-app-path.mjs';

test('打包 Mac 应用设置页显示原生模型接入状态且不暴露保存的密钥', { timeout: 30000 }, async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'knowra-packaged-ai-'));
  let app;
  t.after(async () => { if (app) await app.close().catch(() => {}); fs.rmSync(directory, { recursive: true, force: true }); });
  app = await electron.launch({ executablePath, env: { ...process.env, KNOWRA_DESKTOP_SMOKE_DIR: directory }, timeout: 20000 });
  const page = await app.firstWindow();
  await page.goto(`${new URL(page.url()).origin}/#/settings`);
  await expect(page.getByRole('heading', { name: '模型接入' })).toBeVisible();
  await expect(page.getByText('尚未配置')).toBeVisible();
  assert.equal(await page.evaluate(() => typeof window.knowraDesktop?.modelSettings), 'function');
  await expect(page.getByRole('button', { name: '检查连接' })).toBeDisabled();
});
