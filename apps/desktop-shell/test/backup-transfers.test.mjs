import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import transfers from '../src/backup-transfers.cjs';
import { captureExternalBackupDirectory } from '../../desktop-runtime/src/backup-transfer-files.mjs';

function setup(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'knowra-backup-picker-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  let dataset = 'dataset-one', closing = false;
  let picker = async () => ({ canceled: false, filePaths: [directory] });
  let call = async action => action === 'status' ? { datasetId: dataset } : { id: '123-aaaaaaaa', directory: '原生取得的目录' };
  const calls = []; let picks = 0;
  const webContents = { mainFrame: {}, getURL: () => 'http://127.0.0.1:1245/', executeJavaScript: async () => dataset };
  const window = { webContents, isDestroyed: () => false };
  const manager = transfers.createBackupTransfers({ getWindow: () => window, getOrigin: () => 'http://127.0.0.1:1245', isClosing: () => closing,
    rpc: { request: async (action, input) => { calls.push({ action, input }); return call(action, input); } },
    dialog: { showOpenDialog: async (...args) => { picks++; return picker(...args); } } });
  const event = { sender: webContents, senderFrame: webContents.mainFrame };
  const input = { action: 'export', datasetId: 'dataset-one', backupId: '123-aaaaaaaa' };
  return { directory, manager, event, input, calls, picks: () => picks,
    picker(value) { picker = value; }, call(value) { call = value; }, dataset(value) { dataset = value; }, closing(value) { closing = value; } };
}

test('原生 IPC 拒绝不受信 frame、renderer 路径/URL 和过期资料集；取消不发复制请求', async t => {
  const f = setup(t);
  await assert.rejects(() => f.manager.transfer({ ...f.event, senderFrame: {} }, f.input), /无效/);
  await assert.rejects(() => f.manager.transfer(f.event, { ...f.input, filePath: f.directory }), /参数/);
  await assert.rejects(() => f.manager.transfer(f.event, { ...f.input, url: 'file:///etc/passwd' }), /参数/);
  await assert.rejects(() => f.manager.transfer(f.event, { ...f.input, datasetId: 'stale' }), /变化/);
  assert.equal(f.picks(), 0);
  f.picker(async () => ({ canceled: true, filePaths: [] }));
  assert.equal(await f.manager.transfer(f.event, f.input), null);
  assert.equal(f.calls.filter(item => item.action !== 'status').length, 0);
  assert.deepEqual(fs.readdirSync(f.directory), []);
});

test('路径仅来自 nativeDialog，选择后和复制回执后重验资料集；没有自动 restore', async t => {
  const f = setup(t);
  assert.equal((await f.manager.transfer(f.event, f.input)).id, '123-aaaaaaaa');
  const action = f.calls.find(item => item.action === 'export');
  assert.equal(action.input.selection.path, f.directory);
  assert.equal(action.input.selection.ino, fs.lstatSync(f.directory).ino);
  assert(f.calls.every(item => ['status', 'export'].includes(item.action)));
  f.picker(async () => { f.dataset('dataset-two'); return { canceled: false, filePaths: [f.directory] }; });
  const previous = f.calls.filter(item => item.action === 'export').length;
  await assert.rejects(() => f.manager.transfer(f.event, f.input), /变化/);
  assert.equal(f.calls.filter(item => item.action === 'export').length, previous);
  f.dataset('dataset-one'); f.picker(async () => ({ canceled: false, filePaths: [f.directory] }));
  f.call(async action => { if (action === 'export') f.dataset('dataset-restored'); return { id: '123-aaaaaaaa' }; });
  await assert.rejects(() => f.manager.transfer(f.event, f.input), /变化/);
});

test('选择后关闭或恢复忙时拒绝复制；并行操作和关闭后的成功回执被拒绝', async t => {
  const f = setup(t);
  f.picker(async () => { f.closing(true); return { canceled: false, filePaths: [f.directory] }; });
  await assert.rejects(() => f.manager.transfer(f.event, f.input), /关闭/);
  assert.equal(f.calls.filter(item => item.action === 'export').length, 0);
  f.closing(false); f.picker(async () => ({ canceled: false, filePaths: [f.directory] }));
  let finish, started;
  const began = new Promise(resolve => { started = resolve; });
  f.call(action => action === 'status' ? Promise.resolve({}) : new Promise(resolve => { finish = resolve; started(); }));
  const pending = f.manager.transfer(f.event, f.input);
  await began;
  await assert.rejects(() => f.manager.transfer(f.event, f.input), /进行中/);
  f.closing(true); finish({ id: '123-aaaaaaaa' });
  await assert.rejects(() => pending, /关闭/);
});

test('私有 RPC 仅兑现对应请求，服务退出拒绝在途请求', async () => {
  let sent;
  const rpc = transfers.createBackupRpc({ getChild: () => ({ postMessage: message => { sent = message; } }) });
  const pending = rpc.request('status', { datasetId: 'one' });
  rpc.onMessage({ type: 'backup-transfer-response', requestId: 'unknown', ok: true, result: '过期' });
  rpc.onMessage({ type: 'backup-transfer-response', requestId: sent.requestId, ok: true, result: { datasetId: 'one' } });
  assert.deepEqual(await pending, { datasetId: 'one' });
  const closing = rpc.request('import', { datasetId: 'one' });
  rpc.close(); await assert.rejects(() => closing, /已关闭/);
});

test('原生选择后等待状态校验期间目录替换仍绑定原 inode，运行时拒绝新目录', async t => {
  const f = setup(t);
  const managed = `${f.directory}-managed`; fs.mkdirSync(managed);
  t.after(() => { fs.rmSync(managed, { recursive: true, force: true }); fs.rmSync(`${f.directory}-old`, { recursive: true, force: true }); });
  let statusCalls = 0;
  f.call(async (action, input) => {
    if (action === 'status' && ++statusCalls === 2) { fs.renameSync(f.directory, `${f.directory}-old`); fs.mkdirSync(f.directory); }
    if (action === 'export') captureExternalBackupDirectory(input.selection, managed);
    return {};
  });
  await assert.rejects(() => f.manager.transfer(f.event, f.input), /变化/);
  assert.deepEqual(fs.readdirSync(f.directory), []);
  assert.deepEqual(fs.readdirSync(`${f.directory}-old`), []);
});
