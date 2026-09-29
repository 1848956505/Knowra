import assert from 'node:assert/strict';
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const script = path.join(workspaceRoot, 'scripts', 'activate-ci-release.sh');
const supported = process.platform === 'linux' && process.arch === 'x64' && process.versions.node.startsWith('24.');
const oldCommit = 'a'.repeat(40);
const nextCommit = 'b'.repeat(40);

test('CI 发布包切换后保留运行数据和旧页面资源', { skip: !supported }, () => {
  const fixture = createFixture();
  try {
    const result = run(fixture);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(fixture.gitState, 'utf8'), nextCommit);
    assert.equal(lstatSync(path.join(fixture.root, 'current')).isSymbolicLink(), true);
    const release = readlinkSync(path.join(fixture.root, 'current'));
    assert.equal(readFileSync(path.join(release, 'apps/web-v4/dist/assets/old.js'), 'utf8'), 'old asset');
    assert.equal(readlinkSync(path.join(release, 'storage')), path.join(fixture.root, 'storage'));
    assert.equal(readFileSync(path.join(release, 'apps/web-v4/dist/index.html'), 'utf8'), 'new index');
    assert.equal(readdirSync(fixture.backupRoot).length, 1);
    assert.equal(existsSync(path.join(fixture.root, '.deploy-incoming', 'candidate')), false);
    assert.match(readFileSync(fixture.calls, 'utf8'), /pm2 delete knowra-api knowra-web/);
    assert.match(readFileSync(fixture.calls, 'utf8'), /pm2 start .*\.deploy-releases\/candidate\/deploy\/ecosystem\.config\.cjs --update-env/);
    assert.equal(readFileSync(fixture.pm2State, 'utf8'), release);
    assert.match(readFileSync(fixture.calls, 'utf8'), /git merge --ff-only /);
  } finally {
    fixture.cleanup();
  }
});

test('健康检查失败后恢复首次发布前的进程和 Git 提交', { skip: !supported }, () => {
  const fixture = createFixture({ healthFails: true });
  try {
    const result = run(fixture);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /新版本健康检查失败/);
    assert.equal(existsSync(path.join(fixture.root, 'current')), false);
    assert.equal(readFileSync(fixture.gitState, 'utf8'), oldCommit);
    const calls = readFileSync(fixture.calls, 'utf8');
    assert.match(calls, /pm2 start .*\.deploy-releases\/candidate\/deploy\/ecosystem\.config\.cjs --update-env/);
    assert.match(calls, /pm2 start .*root\/deploy\/ecosystem\.config\.cjs --update-env/);
    assert.equal(readFileSync(fixture.pm2State, 'utf8'), fixture.root);
    assert.doesNotMatch(calls, /git merge --ff-only/);
  } finally {
    fixture.cleanup();
  }
});

test('PM2 沿用旧执行路径时拒绝成功并恢复旧进程', { skip: !supported }, () => {
  const fixture = createFixture({ pm2StaysOnOldPath: true });
  try {
    const result = run(fixture);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /PM2 仍指向旧运行目录/);
    assert.equal(existsSync(path.join(fixture.root, 'current')), false);
    assert.equal(readFileSync(fixture.pm2State, 'utf8'), fixture.root);
    assert.doesNotMatch(readFileSync(fixture.calls, 'utf8'), /git merge --ff-only/);
  } finally {
    fixture.cleanup();
  }
});

function createFixture({ healthFails = false, pm2StaysOnOldPath = false } = {}) {
  const base = mkdtempSync(path.join(tmpdir(), 'knowra-ci-release-'));
  const root = path.join(base, 'root');
  const stage = path.join(root, '.deploy-incoming', 'candidate', 'stage');
  const backupRoot = path.join(base, 'backups');
  const bin = path.join(base, 'bin');
  const calls = path.join(base, 'calls');
  const gitState = path.join(base, 'git-state');
  const pm2State = path.join(base, 'pm2-state');
  mkdirSync(path.join(root, 'storage', 'data'), { recursive: true });
  mkdirSync(path.join(root, 'storage', 'uploads'));
  mkdirSync(path.join(root, 'apps', 'web-v4', 'dist', 'assets'), { recursive: true });
  mkdirSync(path.join(stage, 'apps', 'web-v4', 'dist', 'assets'), { recursive: true });
  mkdirSync(path.join(stage, 'packages', 'web-core', 'dist'), { recursive: true });
  mkdirSync(path.join(stage, 'node_modules'));
  for (const directory of [root, stage]) {
    mkdirSync(path.join(directory, 'scripts'), { recursive: true });
    mkdirSync(path.join(directory, 'deploy'), { recursive: true });
    mkdirSync(path.join(directory, 'apps', 'api', 'src'), { recursive: true });
    writeFileSync(path.join(directory, 'scripts', 'check-attachments.mjs'), 'console.log("ready")\n');
    writeFileSync(path.join(directory, 'deploy', 'ecosystem.config.cjs'), 'module.exports = {}\n');
    writeFileSync(path.join(directory, 'apps', 'api', 'src', 'main.js'), '');
    writeFileSync(path.join(directory, 'apps', 'web-v4', 'server.mjs'), '');
  }
  writeFileSync(path.join(root, 'storage', 'data', 'knowledge-base.json'), '{}\n');
  writeFileSync(path.join(root, 'apps', 'web-v4', 'dist', 'assets', 'old.js'), 'old asset');
  writeFileSync(path.join(stage, 'apps', 'web-v4', 'dist', 'index.html'), 'new index');
  writeFileSync(path.join(stage, 'packages', 'web-core', 'dist', 'index.js'), 'export {}\n');
  writeFileSync(path.join(stage, '.knowra-release.json'), JSON.stringify({ commit: nextCommit, platform: 'linux-x64', nodeMajor: 24 }));
  writeFileSync(path.join(root, '.deploy-incoming', 'candidate', `knowra-release-${nextCommit}.tar.gz`), 'archive');
  writeFileSync(path.join(root, '.deploy-incoming', 'candidate', `knowra-release-${nextCommit}.tar.gz.sha256`), 'checksum');
  writeFileSync(calls, '');
  writeFileSync(gitState, oldCommit);
  writeFileSync(pm2State, root);

  writeExecutable(path.join(bin, 'git'), [
    '#!/usr/bin/env bash',
    '[[ "$1" == -C ]] && shift 2',
    'printf "git %s\\n" "$*" >> "$CI_RELEASE_TEST_CALLS"',
    'case "$1 $2" in',
    '  "branch --show-current") echo main ;;',
    '  "status --porcelain") ;;',
    '  "rev-parse FETCH_HEAD") echo "$CI_RELEASE_TEST_NEXT" ;;',
    '  "rev-parse HEAD") cat "$CI_RELEASE_TEST_GIT_STATE" ;;',
    '  "merge --ff-only") printf %s "$CI_RELEASE_TEST_NEXT" > "$CI_RELEASE_TEST_GIT_STATE" ;;',
    '  "reset --hard") printf %s "$CI_RELEASE_TEST_OLD" > "$CI_RELEASE_TEST_GIT_STATE" ;;',
    'esac'
  ]);
  writeExecutable(path.join(bin, 'pm2'), [
    '#!/usr/bin/env bash',
    'printf "pm2 %s\\n" "$*" >> "$CI_RELEASE_TEST_CALLS"',
    'if [[ "$1" == jlist ]]; then',
    '  dir="$(cat "$CI_RELEASE_TEST_PM2_STATE")"',
    '  printf \'[{"name":"knowra-api","pm2_env":{"status":"online","PORT":"3001","pm_cwd":"%s","pm_exec_path":"%s/apps/api/src/main.js"}},{"name":"knowra-web","pm2_env":{"status":"online","PORT":"3000","pm_cwd":"%s","pm_exec_path":"%s/apps/web-v4/server.mjs"}}]\' "$dir" "$dir" "$dir" "$dir"',
    'elif [[ "$1" == start && "$CI_RELEASE_TEST_PM2_STICKY" != 1 ]]; then',
    '  printf %s "$(dirname "$(dirname "$2")")" > "$CI_RELEASE_TEST_PM2_STATE"',
    'fi'
  ]);
  writeExecutable(path.join(bin, 'curl'), [
    '#!/usr/bin/env bash',
    '[[ "$CI_RELEASE_TEST_HEALTH_FAILS" == 1 ]] && exit 22',
    'exit 0'
  ]);
  writeExecutable(path.join(bin, 'sleep'), ['#!/usr/bin/env bash', 'exit 0']);
  return { root, stage, backupRoot, bin, calls, gitState, pm2State, healthFails, pm2StaysOnOldPath, cleanup: () => rmSync(base, { recursive: true, force: true }) };
}

function writeExecutable(filePath, lines) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${lines.join('\n')}\n`);
  chmodSync(filePath, 0o755);
}

function run(fixture) {
  return spawnSync('bash', [script, fixture.root, nextCommit, fixture.stage], {
    cwd: workspaceRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${fixture.bin}:${process.env.PATH}`,
      KNOWRA_DEPLOY_BACKUP_ROOT: fixture.backupRoot,
      CI_RELEASE_TEST_CALLS: fixture.calls,
      CI_RELEASE_TEST_GIT_STATE: fixture.gitState,
      CI_RELEASE_TEST_PM2_STATE: fixture.pm2State,
      CI_RELEASE_TEST_PM2_STICKY: fixture.pm2StaysOnOldPath ? '1' : '0',
      CI_RELEASE_TEST_OLD: oldCommit,
      CI_RELEASE_TEST_NEXT: nextCommit,
      CI_RELEASE_TEST_HEALTH_FAILS: fixture.healthFails ? '1' : '0'
    }
  });
}
