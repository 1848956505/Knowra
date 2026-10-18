import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stageNativeImageRuntime, verifyNativeImageRuntime } from '../scripts/native-image-runtime.mjs';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
test('图片生产闭包离开仓库仍可真实解码 PNG/JPEG/WebP，不依赖安装脚本', async t => {
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'knowra-native-image-'));
  t.after(() => fs.rmSync(staging, { recursive: true, force: true }));
  const packages = stageNativeImageRuntime({ repo, staging });
  assert.ok(packages.includes('sharp'));
  assert.ok(packages.some(name => name.startsWith('@img/sharp-')));
  assert.equal((await verifyNativeImageRuntime(staging)).arch, process.arch);
});
test('禁止复制其他操作系统或架构的原生模块冒充目标包', () => {
  assert.throws(() => stageNativeImageRuntime({ repo, staging: '/unused', platform: process.platform === 'darwin' ? 'linux' : 'darwin' }), /目标平台/);
  assert.throws(() => stageNativeImageRuntime({ repo, staging: '/unused', arch: process.arch === 'arm64' ? 'x64' : 'arm64' }), /目标平台/);
});

test('仓库内产物缺少本地图片闭包时拒绝向上解析开发依赖', async t => {
  const staging = fs.mkdtempSync(path.join(repo, '.native-image-verification-'));
  t.after(() => fs.rmSync(staging, { recursive: true, force: true }));
  await assert.rejects(verifyNativeImageRuntime(staging), /缺少打包图片依赖：sharp/);
  stageNativeImageRuntime({ repo, staging });
  fs.rmSync(path.join(staging, 'node_modules', 'semver'), { recursive: true });
  await assert.rejects(verifyNativeImageRuntime(staging), /缺少打包图片依赖：semver/);
});
