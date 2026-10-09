import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertMacDistribution, sha256 } from '../../../scripts/release-artifact.mjs';
import { assertBuildInfo, resolveBuildInfo } from '../../../scripts/build-info.mjs';
import { isDirectExecution } from '../../../scripts/cli-entry.mjs';

export const APPLICATION_NAME = '知境·Knowra.app';
export const ARCHIVE_NAME = '知境·Knowra-Mac-arm64.zip';
export const CANDIDATE_DISTRIBUTION = Object.freeze({ channel: 'candidate', signing: 'ad-hoc', notarized: false });

// 与文件系统/操作系统无关，Linux CI 同样覆盖分发声明校验。
export function assertCandidateDistribution(manifest) {
  for (const [key, value] of Object.entries(CANDIDATE_DISTRIBUTION)) {
    if (manifest.distribution?.[key] !== value) throw new Error(`候选分发声明不符：${key}`);
  }
}

export function assertMacBundle(application, expected = {}, run = execFileSync) {
  if (!fs.lstatSync(application).isDirectory()) throw new Error(`不是 APP 目录：${application}`);
  const plist = path.join(application, 'Contents/Info.plist');
  const read = key => run('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, plist], { encoding: 'utf8' }).trim();
  if (read('CFBundleIdentifier') !== 'com.knowra.personal' || read('CFBundleExecutable') !== 'Knowra') {
    throw new Error(`APP 标识不符：${application}`);
  }
  for (const [key, value] of Object.entries({ CFBundleShortVersionString: expected.version, KnowraBuildCommit: expected.commit, KnowraBuildState: expected.state })) {
    if (value !== undefined && read(key) !== value) throw new Error(`APP 构建标识不符：${key}`);
  }
  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', application], { stdio: 'inherit' });
}

// 校验的是 zip 解压所得 APP，避免只检查打包前目录。临时目录仅用于当前校验。
export function verifyDistribution(archive, expected, { inspectApplication } = {}) {
  if (process.platform !== 'darwin') throw new Error('Mac 分发包签名校验仅支持 macOS。');
  const manifest = JSON.parse(fs.readFileSync(`${archive}.build-info.json`, 'utf8'));
  assertCandidateDistribution(manifest);
  assertBuildInfo(manifest.buildInfo, expected);
  if (manifest.archive !== path.basename(archive) || manifest.sha256 !== sha256(archive)) throw new Error('Mac 分发包校验和不符。');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'knowra-distribution-'));
  let verified = false;
  try {
    execFileSync('/usr/bin/ditto', ['-x', '-k', archive, directory]);
    const application = path.join(directory, APPLICATION_NAME);
    const info = assertMacDistribution(archive, application, expected);
    assertMacBundle(application, expected);
    const architectures = execFileSync('/usr/bin/lipo', ['-archs', path.join(application, 'Contents/MacOS/Knowra')], { encoding: 'utf8' }).trim();
    if (architectures !== 'arm64') throw new Error(`APP 架构不符：${architectures}`);
    const signature = spawnSync('/usr/bin/codesign', ['-d', '--verbose=4', application], { encoding: 'utf8' });
    if (signature.status !== 0 || !/^Signature=adhoc$/m.test(signature.stderr)) throw new Error('候选包实际签名与 ad-hoc 声明不符。');
    inspectApplication?.(application);
    verified = true;
    return info;
  } finally {
    if (verified) fs.rmSync(directory, { recursive: true, force: true });
    else console.error(`[Mac 验收] 失败现场保留在 ${directory}；不删除可能仍被测试进程使用的 APP。`);
  }
}

export function terminateRegisteredApps(registry, application, { inspect = execFileSync, kill = process.kill } = {}) {
  if (!fs.existsSync(registry)) return;
  const active = new Set();
  for (const line of fs.readFileSync(registry, 'utf8').trim().split('\n').filter(Boolean)) {
    const entry = JSON.parse(line);
    if (!Number.isSafeInteger(entry.pid) || entry.pid <= 1) throw new Error('测试进程登记无效，拒绝清理。');
    if (entry.state === 'launched') active.add(entry.pid);
    else if (entry.state === 'exited') active.delete(entry.pid);
    else throw new Error('未知测试进程状态。');
  }
  const executable = path.join(application, 'Contents/MacOS/Knowra');
  for (const pid of active) {
    let output;
    try { output = inspect('/bin/ps', ['-p', String(pid), '-o', 'pgid=', '-o', 'command='], { encoding: 'utf8' }).trim(); }
    catch (error) { if (error.status === 1) continue; throw error; }
    const match = /^(\d+)\s+(.+)$/.exec(output);
    if (!match || Number(match[1]) !== pid || !(match[2] === executable || match[2].startsWith(`${executable} `))) {
      throw new Error(`测试进程 ${pid} 归属或命令变化，拒绝清理。`);
    }
    console.error(`[Mac 验收] 清理已登记且核对命令的 APP 进程组 ${pid}`);
    try { kill(-pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  }
}

export function runPackagedTests(repo, application, { run = spawnSync, kill = process.kill, now = Date.now } = {}) {
    const tests = fs.readdirSync(path.join(repo, 'apps/desktop-shell/test'))
      .filter(name => name.endsWith('.test.mjs')).sort()
      .map(name => path.join(repo, 'apps/desktop-shell/test', name));
    const started = now();
    const budgetMs = 20 * 60 * 1000;
    for (const file of tests) {
      const remaining = budgetMs - (now() - started);
      if (remaining <= 0) throw new Error('Mac 隔离验收超过 20 分钟总预算，拒绝交付候选包。');
      const label = path.basename(file);
      const registryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'knowra-test-processes-'));
      const registry = path.join(registryDirectory, 'processes.jsonl');
      console.log(`[Mac 验收] 开始 ${label}`);
      try {
        const result = run(process.execPath, ['--test', '--test-concurrency=1', '--test-reporter=spec', file], {
          cwd: repo, stdio: 'inherit', env: { ...process.env, KNOWRA_DESKTOP_TEST_APP: application, KNOWRA_TEST_PROCESS_REGISTRY: registry },
          detached: true, timeout: Math.min(180000, remaining), killSignal: 'SIGKILL'
        });
        if (result.error || result.status !== 0) {
          // Electron 自有独立组；先按登记并核对命令清理 APP，再清理本次 node 测试组。
          terminateRegisteredApps(registry, application);
          if (result.pid) {
            try { kill(-result.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
          }
          throw result.error || new Error(`测试进程失败：${result.signal || result.status}`);
        }
      } catch (error) {
        console.error(`[Mac 验收] 失败 ${label}；${error.code || error.signal || error.status || '测试失败'}；不上传候选包。`);
        throw error;
      }
      fs.rmSync(registryDirectory, { recursive: true, force: true });
      console.log(`[Mac 验收] 完成 ${label}`);
    }
}

if (isDirectExecution(import.meta.url)) {
  const repo = fileURLToPath(new URL('../../../', import.meta.url));
  const expected = assertBuildInfo(resolveBuildInfo(repo), { requireClean: true });
  const info = verifyDistribution(path.join(repo, 'dist/mac', ARCHIVE_NAME), {
    version: expected.version, commit: expected.commit, state: 'clean', requireClean: true
  }, { inspectApplication: process.argv.includes('--test') ? application => {
    runPackagedTests(repo, application);
  } : undefined });
  console.log(`候选分发包已校验：v${info.version}，${info.commit}（ad-hoc 签名，未公证；不是正式发布）。`);
}
