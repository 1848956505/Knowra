import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { _electron as electron } from '@playwright/test';
import { executablePath } from './packaged-app-path.mjs';
import { closeTestApplication, launchTestApplication } from './app-lifecycle.mjs';

test('隔离打包 APP 的原生菜单提供检查更新入口（不发起网络请求）', { timeout: 60000 }, async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'knowra-update-menu-'));
  let app;
  t.after(async () => { await closeTestApplication(app); fs.rmSync(directory, { recursive: true, force: true }); });
  app = await launchTestApplication(electron, { executablePath, env: { ...process.env, KNOWRA_DESKTOP_SMOKE_DIR: directory }, timeout: 20000 });
  await app.firstWindow();
  const item = await app.evaluate(({ Menu }) => {
    const find = menu => {
      for (const entry of menu?.items || []) {
        if (entry.label === '检查更新…') return { label: entry.label, enabled: entry.enabled, visible: entry.visible };
        const found = find(entry.submenu);
        if (found) return found;
      }
      return null;
    };
    return find(Menu.getApplicationMenu());
  });
  assert.deepEqual(item, { label: '检查更新…', enabled: true, visible: true });
});
