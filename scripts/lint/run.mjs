#!/usr/bin/env node
// 用法：node scripts/lint/run.mjs <eslint|prettier> [参数...] [--report]
// 首次运行时在本目录安装独立工具链；--report 不阻塞扫描结果，安装/启动失败仍返回非零。
import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const toolsDir = path.dirname(fileURLToPath(import.meta.url));
const tools = new Map([
  ['eslint', 'eslint/bin/eslint.js'],
  ['prettier', 'prettier/bin/prettier.cjs']
]);
const [tool, ...rest] = process.argv.slice(2);
if (!tools.has(tool)) {
  console.error('用法：node scripts/lint/run.mjs <eslint|prettier> [参数...] [--report]');
  process.exit(2);
}
const report = rest.includes('--report');
const args = rest.filter(arg => arg !== '--report');

const installed = path.join(toolsDir, 'node_modules', '.package-lock.json');
const lockfile = path.join(toolsDir, 'package-lock.json');
if (!existsSync(installed) || statSync(installed).mtimeMs < statSync(lockfile).mtimeMs) {
  const install = spawnSync('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], {
    cwd: toolsDir,
    // Windows 的 npm 是 .cmd；这里只传固定的安装参数，不传用户输入。
    shell: process.platform === 'win32',
    stdio: 'inherit'
  });
  if (install.error) console.error('工具链安装未启动：', install.error.message);
  if (install.status !== 0) process.exit(install.status ?? 1);
}

// 直接用 Node 执行入口，避免 Windows 无法 spawn .bin 中的 shell/.cmd shim。
const bin = path.join(toolsDir, 'node_modules', tools.get(tool));
const result = spawnSync(process.execPath, [bin, ...args], { stdio: 'inherit' });
if (result.error) throw result.error;
if (report && (result.status === null || result.status > 1)) {
  console.error(
    `[${tool}] 检查未完成（${result.signal ? `信号 ${result.signal}` : `退出码 ${result.status}`}）；报告模式不阻塞，请检查上方错误。`
  );
}
process.exit(report ? 0 : (result.status ?? 1));
