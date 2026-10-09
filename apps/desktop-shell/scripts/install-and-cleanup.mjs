import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertBuildInfo, resolveBuildInfo } from '../../../scripts/build-info.mjs';
import { assertDesktopBuild } from '../../../scripts/release-artifact.mjs';
import { isDirectExecution } from '../../../scripts/cli-entry.mjs';
import { APPLICATION_NAME, ARCHIVE_NAME, assertMacBundle, verifyDistribution } from './verify-distribution.mjs';

// 只替换指定目标。保留源 APP、旧 APP 备份和其他副本；不访问资料库或设置目录。
// 备份与目标处于同一文件系统，替换失败时使用 rename 恢复旧 APP。
export function replaceApplication({ source, installed, staged, backup, copy, verify, verifyPrevious, rename = fs.renameSync }) {
  if (new Set([source, installed, staged, backup].map(value => path.resolve(value))).size !== 4) throw new Error('安装路径必须互不相同。');
  if (fs.existsSync(staged) || fs.existsSync(backup)) throw new Error('安装临时路径或备份路径已存在，拒绝覆盖。');
  const hasPrevious = fs.existsSync(installed);
  if (hasPrevious) verifyPrevious(installed);
  copy(source, staged);
  verify(staged);
  if (hasPrevious) rename(installed, backup);
  try {
    rename(staged, installed);
    verify(installed);
  } catch (error) {
    // 保留失败候选以供检查；旧 APP 从未删除。
    try {
      if (fs.existsSync(installed)) rename(installed, staged);
      if (hasPrevious) rename(backup, installed);
    } catch (recoveryError) {
      throw new AggregateError([error, recoveryError], `安装和自动恢复失败；旧 APP 保留位置：${backup}`);
    }
    throw error;
  }
  return hasPrevious ? backup : null;
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

export function installMac() {
  if (process.platform !== 'darwin') throw new Error('个人 Mac APP 安装仅支持 macOS。');
  if (process.argv.slice(2).length) throw new Error('此脚本不接受额外路径参数。');
  const repo = fileURLToPath(new URL('../../../', import.meta.url));
  const expected = assertBuildInfo(resolveBuildInfo(repo), { requireClean: true });
  const expectedIdentity = { version: expected.version, commit: expected.commit, state: 'clean', requireClean: true };
  if (isKnowraRunning()) throw new Error('知境·Knowra 正在运行，请先正常退出并确认草稿已保存，再重新运行 npm run install:mac。');
  const installed = path.join('/Applications', APPLICATION_NAME);
  // 独立的同磁盘工作目录，保留以前各次备份，不清理任何其他 APP。
  let previous;
  verifyDistribution(path.join(repo, 'dist/mac', ARCHIVE_NAME), expectedIdentity, { inspectApplication: source => {
    const workspace = fs.mkdtempSync('/Applications/.knowra-install-');
    const staged = path.join(workspace, 'candidate.app');
    const backup = path.join(workspace, APPLICATION_NAME);
    previous = replaceApplication({ source, installed, staged, backup,
      copy: (from, to) => execFileSync('/usr/bin/ditto', [from, to]),
      verify: application => { assertMacBundle(application, expectedIdentity); assertDesktopBuild(application, expectedIdentity); },
      verifyPrevious: application => assertMacBundle(application)
    });
  } });
  console.log(`已安装：${installed}（v${expected.version}，${expected.commit}，clean）。`);
  console.log('该候选包采用 ad-hoc 签名，未公证；安装不修改用户资料库或设置。');
  if (previous) console.log(`上一版 APP 已保留：${previous}\n需要回退时，先退出 Knowra，再将此备份恢复至 ${installed}；应用回退不等于数据格式回退。`);
}

if (isDirectExecution(import.meta.url)) installMac();
