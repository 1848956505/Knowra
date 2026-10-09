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
    return info;
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

if (isDirectExecution(import.meta.url)) {
  const repo = fileURLToPath(new URL('../../../', import.meta.url));
  const expected = assertBuildInfo(resolveBuildInfo(repo), { requireClean: true });
  const info = verifyDistribution(path.join(repo, 'dist/mac', ARCHIVE_NAME), {
    version: expected.version, commit: expected.commit, state: 'clean', requireClean: true
  }, { inspectApplication: process.argv.includes('--test') ? application => {
    const tests = fs.readdirSync(path.join(repo, 'apps/desktop-shell/test'))
      .filter(name => name.endsWith('.test.mjs')).sort()
      .map(name => path.join(repo, 'apps/desktop-shell/test', name));
    execFileSync(process.execPath, ['--test', '--test-concurrency=1', ...tests], {
      cwd: repo, stdio: 'inherit', env: { ...process.env, KNOWRA_DESKTOP_TEST_APP: application }
    });
  } : undefined });
  console.log(`候选分发包已校验：v${info.version}，${info.commit}（ad-hoc 签名，未公证；不是正式发布）。`);
}
