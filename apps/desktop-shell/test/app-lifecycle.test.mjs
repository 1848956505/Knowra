import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeTestApplication, launchTestApplication } from './app-lifecycle.mjs';
function fixture(close) {
  const child = new EventEmitter();
  Object.assign(child, { pid: 43210, exitCode: null, signalCode: null });
  const kills = [];
  child.kill = signal => { kills.push(signal); child.signalCode = signal; child.emit('exit', null, signal); };
  return { child, kills, app: { process: () => child, close: () => close(child) } };
}
test('测试清理正常退出不强杀，已结束进程不再操作', async () => {
  const f = fixture(child => { child.exitCode = 0; child.emit('exit', 0); });
  await closeTestApplication(f.app); await closeTestApplication(f.app); await closeTestApplication(null);
  assert.deepEqual(f.kills, []);
});
test('保存退出挂起时只清理拥有的子进程且测试失败', async () => {
  const f = fixture(() => new Promise(() => {}));
  await assert.rejects(closeTestApplication(f.app, { closeTimeoutMs: 10, killGroup: () => f.child.kill('SIGKILL') }), /不计为退出握手通过/);
  assert.deepEqual(f.kills, ['SIGKILL']);
});
test('close 抛错仍等进程退出，未退出不会误报成功', async () => {
  const f = fixture(() => { throw new Error('close failed'); });
  await assert.rejects(closeTestApplication(f.app, { closeTimeoutMs: 10, killGroup: () => f.child.kill('SIGKILL') }), /正常退出/);
  assert.deepEqual(f.kills, ['SIGKILL']);
});
test('无法结束测试进程时报告错误并不宣称已退出', async () => {
  const f = fixture(() => new Promise(() => {})); f.child.kill = () => false;
  await assert.rejects(closeTestApplication(f.app, { closeTimeoutMs: 10, exitTimeoutMs: 10, killGroup: () => f.child.kill('SIGKILL') }), /清理失败/);
});

test('登记仅包含本次 launch 返回的实际 PID，退出后标记失效', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'knowra-launch-registry-'));
  const previous = process.env.KNOWRA_TEST_PROCESS_REGISTRY;
  const registry = path.join(directory, 'processes.jsonl');
  process.env.KNOWRA_TEST_PROCESS_REGISTRY = registry;
  t.after(() => { if (previous === undefined) delete process.env.KNOWRA_TEST_PROCESS_REGISTRY; else process.env.KNOWRA_TEST_PROCESS_REGISTRY = previous; fs.rmSync(directory, { recursive: true, force: true }); });
  const f = fixture(child => { child.exitCode = 0; child.emit('exit', 0); });
  assert.equal(await launchTestApplication({ launch: async () => f.app }, {}), f.app);
  await closeTestApplication(f.app);
  assert.deepEqual(fs.readFileSync(registry, 'utf8').trim().split('\n').map(JSON.parse), [{ pid: 43210, state: 'launched' }, { pid: 43210, state: 'exited' }]);
});
