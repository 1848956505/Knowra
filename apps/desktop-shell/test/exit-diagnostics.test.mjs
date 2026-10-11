import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { sanitizeDesktopLog, validateSyntheticDirectory, boundedDiagnostic, createExitDiagnostics, prepareExitDiagnostics } from './exit-diagnostics.mjs';

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'knowra-titlebar-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const output = path.join(directory, 'diagnostics');
  const child = Object.assign(new EventEmitter(), { pid: 123, exitCode: null, signalCode: null });
  const page = Object.assign(new EventEmitter(), {
    evaluate: async () => ({ readyState: 'complete', rootInert: true, savingOverlay: true, openNoteTabs: 0 }),
    screenshot: async ({ path: file }) => fs.writeFileSync(file, 'synthetic screenshot')
  });
  const nativeApp = Object.assign(new EventEmitter(), { getPath: () => path.join(fs.realpathSync(directory), 'shell'), getAppMetrics: () => [{ pid: 123, type: 'Browser', secret: 'DO_NOT_EXPORT' }] });
  const ipcMain = new EventEmitter();
  const application = { process: () => child,
    evaluate: async (callback, arg) => callback({ app: nativeApp, ipcMain, BrowserWindow: { getAllWindows: () => [] } }, arg) };
  return { directory, output, child, page, nativeApp, ipcMain, application };
}

test('仅导出固定诊断消息，不外传原始路径、正文、token或非白名单错误', () => {
  const safe = sanitizeDesktopLog('2026-10-11T00:00:00.000Z 退出暂停：保存等待超时，窗口已保留，请稍后重试。\n2026-10-11T00:00:01.000Z 退出暂停：secret正文 sk-PRIVATE https://host?token=PRIVATE\nPRIVATE\n2026-10-11T00:00:02.000Z 启动完成，Electron 44.3.0，Node 24.0.0');
  assert(safe.includes('保存等待超时'));
  assert(safe.includes('Electron 44.3.0'));
  assert(!safe.includes('PRIVATE')); assert(!safe.includes('secret正文'));
});

test('拒绝非合成目录以及符号链接根', t => {
  const f = fixture(t);
  assert.equal(validateSyntheticDirectory(f.directory), fs.realpathSync(f.directory));
  assert.throws(() => validateSyntheticDirectory(os.tmpdir()), /诊断/);
  const linked = `${f.directory}-link`; fs.symlinkSync(f.directory, linked);
  t.after(() => fs.unlinkSync(linked));
  assert.throws(() => validateSyntheticDirectory(linked), /诊断/);
});

test('挂起或抛错的诊断返回有限状态，不输出原错误或无限延迟', async () => {
  assert.deepEqual(await boundedDiagnostic(() => new Promise(() => {}), 5), { status: 'timeout' });
  assert.deepEqual(await boundedDiagnostic(() => { throw new Error('PRIVATE'); }), { status: 'unavailable' });
});

test('仅收集测试pid与阶段，退出前失败后均可读，原生退出行为未被替换', async t => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.directory, 'shell/logs'), { recursive: true });
  fs.writeFileSync(path.join(f.directory, 'shell/logs/desktop.log'), '2026-10-11T00:00:00.000Z 退出暂停：保存等待超时，窗口已保留，请稍后重试。\n2026-10-11T00:00:01.000Z PRIVATE');
  fs.writeFileSync(path.join(f.directory, 'ready.json'), 'PRIVATE');
  const diagnostics = await createExitDiagnostics(f.application, f.page, f.directory, f.output);
  await diagnostics.beforeQuit();
  f.nativeApp.emit('before-quit');
  f.ipcMain.emit('close-result', {}, { ok: false, message: 'PRIVATE', id: 'PRIVATE' });
  f.page.emit('request', { url: 'PRIVATE' });
  await diagnostics.onFailure();
  f.child.signalCode = 'SIGKILL'; f.child.emit('exit'); diagnostics.afterCleanup();
  const raw = fs.readFileSync(path.join(f.output, 'exit-state.json'), 'utf8');
  const data = JSON.parse(raw);
  assert.equal(data.snapshots[1].process.pid, 123);
  assert.equal(data.snapshots[1].observedInFlightRequestCount, 1);
  assert(data.snapshots[1].main.value.events.some(item => item.phase === 'renderer-close-result' && item.ok === false));
  assert(data.events.some(item => item.phase === 'test-process-exit'));
  assert(!raw.includes('PRIVATE')); assert(!raw.includes('DO_NOT_EXPORT'));
  assert(!fs.readFileSync(path.join(f.output, 'desktop.log'), 'utf8').includes('PRIVATE'));
  assert.deepEqual(fs.readdirSync(f.output).sort(), ['desktop.log', 'exit-state.json', 'synthetic-renderer.png']);
});

test('合成日志符号链接不跟随读取，APP资料目录不符时不采集', async t => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.directory, 'shell/logs'), { recursive: true });
  fs.writeFileSync(path.join(f.directory, 'private.txt'), 'PRIVATE');
  fs.symlinkSync(path.join(f.directory, 'private.txt'), path.join(f.directory, 'shell/logs/desktop.log'));
  const diagnostics = await createExitDiagnostics(f.application, f.page, f.directory, f.output);
  await diagnostics.beforeQuit();
  assert.equal(fs.readFileSync(path.join(f.output, 'desktop.log'), 'utf8'), '[拒绝读取符号链接日志]');
  f.nativeApp.getPath = () => '/user/real-data';
  await assert.rejects(createExitDiagnostics(f.application, f.page, f.directory, f.output), /无法确认/);
});

test('诊断初始化或写入失败不抛出，调用方仍执行正常退出并保留其错误', async () => {
  for (const create of [
    async () => { throw new Error('PRIVATE initialization'); },
    async () => ({ beforeQuit: async () => { throw new Error('PRIVATE write'); } })
  ]) {
    let quitCalled = false;
    const original = new Error('original quit timeout');
    await assert.rejects(async () => {
      const diagnostics = await prepareExitDiagnostics(create);
      assert.equal(diagnostics, null);
      quitCalled = true;
      throw original;
    }, error => error === original);
    assert(quitCalled);
  }
});

test('合成根原路径及realpath别名均可核验，兼容macOS临时目录别名', async t => {
  const f = fixture(t);
  for (const root of [path.resolve(f.directory), fs.realpathSync(f.directory)]) {
    f.nativeApp.getPath = () => path.join(root, 'shell');
    const diagnostics = await createExitDiagnostics(f.application, f.page, f.directory, f.output);
    assert(diagnostics);
  }
});
