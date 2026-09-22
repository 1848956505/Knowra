import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const source = path.join(repo, 'dist/mac/知境·Knowra-darwin-arm64/知境·Knowra.app');
const installed = '/Applications/知境·Knowra.app';
const trash = path.join(os.homedir(), '.Trash');
const expectedId = 'com.knowra.personal';
const expectedVersion = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8')).version;

if (process.platform !== 'darwin') throw new Error('个人 Mac APP 安装仅支持 macOS。');
if (process.argv.slice(2).length) throw new Error('此脚本不接受额外路径参数。');
if (!fs.existsSync(path.join(repo, 'dist/mac/知境·Knowra-Mac-arm64.zip'))) throw new Error('缺少已打包的 APP 压缩包。');
assertKnowraBundle(source, expectedVersion);
if (isKnowraRunning()) throw new Error('知境·Knowra 正在运行，请先正常退出并确认草稿已保存，再重新运行 npm run build:mac。');
if (fs.existsSync(installed)) assertKnowraBundle(installed);

const staged = `/Applications/.知境·Knowra-installing-${process.pid}.app`;
if (fs.existsSync(staged)) throw new Error(`临时安装位置已存在：${staged}`);
execFileSync('/usr/bin/ditto', [source, staged]);
try {
  assertKnowraBundle(staged, expectedVersion);
  const previous = fs.existsSync(installed) ? moveToTrash(installed) : null;
  try {
    fs.renameSync(staged, installed);
  } catch (error) {
    if (previous && !fs.existsSync(installed)) fs.renameSync(previous, installed);
    throw error;
  }
} finally {
  if (fs.existsSync(staged)) moveToTrash(staged, { verify: false });
}

const oldApps = [
  source,
  path.join(repo, '知境·Knowra .app'),
  '/Applications/知境·Knowra .app',
  path.join(os.homedir(), 'Applications/知境·Knowra.app'),
  path.join(os.homedir(), 'Applications/知境·Knowra .app'),
  ...backupApps(path.join(repo, 'dist/mac-backups')),
  ...backupApps(path.join(repo, 'dist/app-upgrade-backups'))
];
let cleaned = 0;
for (const candidate of new Set(oldApps)) {
  if (candidate === installed || !fs.existsSync(candidate)) continue;
  assertKnowraBundle(candidate);
  moveToTrash(candidate);
  cleaned += 1;
}
console.log(`已安装唯一正式 APP：${installed}（v${expectedVersion}）；${cleaned} 个旧/重复 Knowra APP 已移入废纸篓。`);

function backupApps(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .flatMap(entry => fs.readdirSync(path.join(directory, entry.name), { withFileTypes: true })
      .filter(child => child.isDirectory() && child.name.endsWith('.app'))
      .map(child => path.join(directory, entry.name, child.name)));
}

function assertKnowraBundle(application, version) {
  if (!fs.lstatSync(application).isDirectory()) throw new Error(`不是 APP 目录：${application}`);
  const plist = path.join(application, 'Contents/Info.plist');
  const bundleId = execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleIdentifier', plist], { encoding: 'utf8' }).trim();
  if (bundleId !== expectedId) throw new Error(`APP 标识不符，拒绝覆盖或清理：${application}`);
  const actualVersion = execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', plist], { encoding: 'utf8' }).trim();
  if (version && actualVersion !== version) throw new Error(`APP 版本不符：预期 ${version}，实际 ${actualVersion}（${application}）`);
  if (version) execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', application]);
}

function isKnowraRunning() {
  try {
    execFileSync('/usr/bin/pgrep', ['-f', '/知境·Knowra[^/]*\\.app/Contents/MacOS/Knowra'], { stdio: 'ignore' });
    return true;
  } catch (error) {
    if (error.status === 1) return false;
    throw error;
  }
}

function moveToTrash(application, { verify = true } = {}) {
  if (verify) assertKnowraBundle(application);
  fs.mkdirSync(trash, { recursive: true });
  const name = `${path.basename(application, '.app')}-${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2, 8)}.app`;
  const destination = path.join(trash, name);
  fs.renameSync(application, destination);
  return destination;
}
