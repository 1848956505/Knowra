import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createFileDataStore } from '../../../../apps/api/src/infrastructure/file-data-store.js';

const results = [];
for (const mode of ['before-rename', 'after-rename', 'fallback-gap']) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'knowra-repair1-crash-'));
  try {
    const target = path.join(dir, 'data.json');
    const store = createFileDataStore(target);
    store.state.spaces.push({ id: 'old-space', userId: 'review', name: '修复验证旧数据' });
    store.flush();
    const child = spawnSync(process.execPath, [
      fileURLToPath(new URL('../阶段5/atomic-crash-child.mjs', import.meta.url)), target, mode
    ]);
    assert.equal(child.signal, 'SIGKILL');
    if (mode === 'fallback-gap') {
      const names = fs.readdirSync(dir).sort();
      const contents = names.map(name => fs.readFileSync(path.join(dir, name)));
      assert.equal(fs.existsSync(target), false);
      assert.throws(() => createFileDataStore(target), error => error.code === 'STORAGE_RECOVERY_REQUIRED');
      assert.equal(fs.existsSync(target), false);
      assert.deepEqual(fs.readdirSync(dir).sort(), names);
      names.forEach((name, index) => assert.deepEqual(fs.readFileSync(path.join(dir, name)), contents[index]));
      const backup = names.find(name => name.endsWith('.bak'));
      assert.ok(backup);
      fs.copyFileSync(path.join(dir, backup), target);
      assert.deepEqual(createFileDataStore(target).state.spaces.map(space => space.id), ['old-space']);
    } else {
      assert.deepEqual(createFileDataStore(target).state.spaces.map(space => space.id), mode === 'before-rename' ? ['old-space'] : []);
    }
    results.push({ mode, outcome: 'pass', signal: child.signal });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
fs.writeFileSync(new URL('./进程中断恢复结果.json', import.meta.url), JSON.stringify({
  platform: process.platform, node: process.version,
  method: '真实子进程 SIGKILL；macOS 上通过适配器模拟 EPERM，未代替 Windows 实机验收；缺失主文件时停止启动，验证备份保留及人工恢复',
  results
}, null, 2) + '\n');
console.log(results);
