import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { replaceApplication } from '../../apps/desktop-shell/scripts/install-and-cleanup.mjs';
import { assertCandidateDistribution, assertMacBundle, CANDIDATE_DISTRIBUTION } from '../../apps/desktop-shell/scripts/verify-distribution.mjs';

function fixture(t, previous = true) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'knowra-install-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const files = Object.fromEntries(['source', 'installed', 'staged', 'backup', 'unrelated'].map(key => [key, path.join(root, `${key}.app`)]));
  for (const [key, content] of [['source', 'new'], ['unrelated', 'unrelated'], ...(previous ? [['installed', 'old']] : [])]) {
    fs.mkdirSync(files[key]); fs.writeFileSync(path.join(files[key], 'identity'), content);
  }
  return { ...files, copy: (from, to) => fs.cpSync(from, to, { recursive: true }),
    verify: file => assert.equal(fs.readFileSync(path.join(file, 'identity'), 'utf8'), 'new'),
    verifyPrevious: file => assert.equal(fs.readFileSync(path.join(file, 'identity'), 'utf8'), 'old') };
}
const content = file => fs.readFileSync(path.join(file, 'identity'), 'utf8');

test('显式安装保留构建源、上一版备份和其他副本', t => {
  const input = fixture(t);
  assert.equal(replaceApplication(input), input.backup);
  assert.equal(content(input.installed), 'new');
  assert.equal(content(input.source), 'new');
  assert.equal(content(input.backup), 'old');
  assert.equal(content(input.unrelated), 'unrelated');
});

test('首次安装不创建伪备份', t => {
  const input = fixture(t, false);
  assert.equal(replaceApplication(input), null);
  assert.equal(fs.existsSync(input.backup), false);
  assert.equal(content(input.installed), 'new');
});

test('旧目标验证失败时不复制、不覆盖', t => {
  const input = fixture(t);
  assert.throws(() => replaceApplication({ ...input, verifyPrevious: () => { throw new Error('wrong identity'); } }), /wrong identity/);
  assert.equal(content(input.installed), 'old');
  assert.equal(fs.existsSync(input.staged), false);
});

test('候选验证失败保留旧安装和候选供排查', t => {
  const input = fixture(t);
  assert.throws(() => replaceApplication({ ...input, verify: () => { throw new Error('invalid candidate'); } }), /invalid candidate/);
  assert.equal(content(input.installed), 'old');
  assert.equal(content(input.staged), 'new');
  assert.equal(fs.existsSync(input.backup), false);
});

test('替换失败自动恢复旧 APP，构建源保持不变', t => {
  const input = fixture(t);
  const rename = (from, to) => {
    if (from === input.staged) throw new Error('replacement failed');
    fs.renameSync(from, to);
  };
  assert.throws(() => replaceApplication({ ...input, rename }), /replacement failed/);
  assert.equal(content(input.installed), 'old');
  assert.equal(content(input.source), 'new');
  assert.equal(content(input.staged), 'new');
});

test('替换后验证失败也恢复旧 APP', t => {
  const input = fixture(t);
  const verify = file => { if (file === input.installed) throw new Error('post-check failed'); input.verify(file); };
  assert.throws(() => replaceApplication({ ...input, verify }), /post-check failed/);
  assert.equal(content(input.installed), 'old');
  assert.equal(content(input.staged), 'new');
});

test('回滚失败仍保留旧备份并报告其路径', t => {
  const input = fixture(t);
  const rename = (from, to) => {
    if ([input.staged, input.backup].includes(from)) throw new Error('rename failed');
    fs.renameSync(from, to);
  };
  assert.throws(() => replaceApplication({ ...input, rename }), error => error instanceof AggregateError && error.message.includes(input.backup));
  assert.equal(content(input.backup), 'old');
  assert.equal(content(input.source), 'new');
});

test('已有备份或临时位置拒绝覆盖', t => {
  const input = fixture(t);
  fs.mkdirSync(input.backup);
  assert.throws(() => replaceApplication(input), /拒绝覆盖/);
  assert.equal(content(input.installed), 'old');
});

test('候选元数据不声称正式签名或公证', () => {
  assert.doesNotThrow(() => assertCandidateDistribution({ distribution: CANDIDATE_DISTRIBUTION }));
  for (const [key, value] of [['channel', 'stable'], ['signing', 'developer-id'], ['notarized', true]]) {
    assert.throws(() => assertCandidateDistribution({ distribution: { ...CANDIDATE_DISTRIBUTION, [key]: value } }), /候选分发声明不符/);
  }
  assert.throws(() => assertCandidateDistribution({}), /候选分发声明不符/);
});

test('APP plist 身份及严格签名校验不能跳过', t => {
  const input = fixture(t);
  const values = { CFBundleIdentifier: 'com.knowra.personal', CFBundleExecutable: 'Knowra', CFBundleShortVersionString: '2.28.0', KnowraBuildCommit: 'a'.repeat(40), KnowraBuildState: 'clean' };
  const calls = [];
  const run = (command, args) => { calls.push([command, args]); return command.endsWith('PlistBuddy') ? values[args[1].split(':')[1]] : ''; };
  assertMacBundle(input.source, { version: '2.28.0', commit: 'a'.repeat(40), state: 'clean' }, run);
  assert.deepEqual(calls.at(-1), ['/usr/bin/codesign', ['--verify', '--deep', '--strict', input.source]]);
  values.CFBundleIdentifier = 'unrelated.app';
  assert.throws(() => assertMacBundle(input.source, {}, run), /APP 标识不符/);
});

test('build:mac 是纯构建，测试和安装都有显式命令', () => {
  const repo = fileURLToPath(new URL('../../', import.meta.url));
  const { scripts } = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'));
  assert.doesNotMatch(scripts['build:mac'], /install-and-cleanup|npm test|test:mac|install:mac/);
  assert.match(scripts['test:mac'], /verify-distribution\.mjs --test/);
  assert.match(scripts['install:mac'], /install-and-cleanup\.mjs/);
  const build = fs.readFileSync(path.join(repo, 'apps/desktop-shell/scripts/build.mjs'), 'utf8');
  assert.doesNotMatch(build, /import\(['"]\.\/create-icon\.mjs['"]\)/);
  const workflow = fs.readFileSync(path.join(repo, '.github/workflows/mac-build.yml'), 'utf8');
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /npm run test:mac/);
  assert.doesNotMatch(workflow, /npm run install:mac|gh release create|contents: write/);
});


test('原生测试逐文件串行，有界且只清理当前 spawn 的进程组', async () => {
  const { runPackagedTests } = await import('../../apps/desktop-shell/scripts/verify-distribution.mjs');
  const repo = fileURLToPath(new URL('../../', import.meta.url));
  const calls = [], killed = [];
  runPackagedTests(repo, '/tmp/synthetic.app', { now: () => 0, run: (...args) => { calls.push(args); return { status: 0 }; }, kill: pid => killed.push(pid) });
  assert(calls.length > 10);
  for (const [, args, options] of calls) {
    assert.equal(args.at(-1).endsWith('.test.mjs'), true);
    assert.equal(options.timeout, 180000); assert.equal(options.detached, true);
    assert.equal(options.env.KNOWRA_DESKTOP_TEST_APP, '/tmp/synthetic.app');
  }
  assert.deepEqual(killed, []);
  let attempts = 0;
  assert.throws(() => runPackagedTests(repo, '/tmp/synthetic.app', { now: () => 0,
    run: () => { attempts++; return { status: null, pid: 12345, error: Object.assign(new Error('deadline'), { code: 'ETIMEDOUT' }) }; },
    kill: (pid, signal) => killed.push([pid, signal]) }), /deadline/);
  assert.equal(attempts, 1); assert.deepEqual(killed, [[-12345, 'SIGKILL']]);
  let ticks = 0;
  assert.throws(() => runPackagedTests(repo, '/tmp/synthetic.app', { now: () => ticks++ ? 1200001 : 0, run: () => assert.fail('超预算不得启动进程') }), /总预算/);
});


test('外层超时清理验证登记 PID、进程组和当前测试 APP 路径，不误杀其他应用', async t => {
  const { terminateRegisteredApps } = await import('../../apps/desktop-shell/scripts/verify-distribution.mjs');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'knowra-test-registry-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const registry = path.join(directory, 'processes.jsonl');
  fs.writeFileSync(registry, JSON.stringify({ pid: 4321, state: 'launched' }) + '\n');
  const killed = [];
  const options = { inspect: () => '4321 /tmp/test.app/Contents/MacOS/Knowra --inspect=123', kill: (...args) => killed.push(args) };
  terminateRegisteredApps(registry, '/tmp/test.app', options);
  assert.deepEqual(killed, [[-4321, 'SIGKILL']]);
  for (const command of ['4321 /Applications/Other.app/Contents/MacOS/Knowra', '999 /tmp/test.app/Contents/MacOS/Knowra']) {
    assert.throws(() => terminateRegisteredApps(registry, '/tmp/test.app', { ...options, inspect: () => command }), /拒绝清理/);
  }
  fs.appendFileSync(registry, JSON.stringify({ pid: 4321, state: 'exited' }) + '\n');
  terminateRegisteredApps(registry, '/tmp/test.app', { inspect: () => assert.fail('退出 PID 不再查询'), kill: () => assert.fail() });
  fs.writeFileSync(registry, JSON.stringify({ pid: -1, state: 'launched' }) + '\n');
  assert.throws(() => terminateRegisteredApps(registry, '/tmp/test.app'), /登记无效/);
});
