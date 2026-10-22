#!/usr/bin/env node
// 用法：node scripts/lint/run.mjs <eslint|prettier> [参数...] [--report]
// 首次运行时在本目录安装独立工具链；--report 只输出结果，始终以 0 退出。
import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const toolsDir = path.dirname(fileURLToPath(import.meta.url));
const tools = new Set(['eslint', 'prettier']);
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
    stdio: 'inherit'
  });
  if (install.status !== 0) process.exit(install.status ?? 1);
}

const bin = path.join(toolsDir, 'node_modules', '.bin', tool);
const result = spawnSync(bin, args, { stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(report ? 0 : (result.status ?? 1));
