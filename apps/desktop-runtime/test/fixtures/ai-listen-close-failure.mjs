import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { startLocalRuntime } from '../../src/runtime-server.mjs';

const root = process.argv[2];
const dataDirectory = path.join(root, 'data');
const options = { dataDirectory, distRoot: path.join(root, 'dist'), syncOptions: { autoSync: false }, logger: { warn() {}, error() {} } };
const blocker = http.createServer();
let repository, reopened, failure, secondStartError;
try {
  await new Promise(resolve => blocker.listen(0, '127.0.0.1', resolve));
  try {
    await startLocalRuntime({ ...options, port: blocker.address().port, aiRuntimeFactory(input) {
      repository = input.repository;
      return { agent: { recover() {}, close() { throw new Error('synthetic close failure'); } } };
    } });
  } catch (error) { failure = error; }
  const oldStoreStillOpen = Boolean(repository.identity().datasetId);
  const lockPath = path.join(dataDirectory, 'runtime.lock');
  const runtimeLockExists = fs.existsSync(lockPath);
  const lockOwnerPid = runtimeLockExists ? JSON.parse(fs.readFileSync(lockPath, 'utf8')).pid : null;
  try { reopened = await startLocalRuntime({ ...options, aiRuntimeFactory: () => ({}) }); }
  catch (error) { secondStartError = error.message; }
  console.log(JSON.stringify({
    startErrorCode: failure?.errors?.[0]?.code,
    closeError: failure?.errors?.[1]?.errors?.[0]?.message,
    oldStoreStillOpen, runtimeLockExists, lockOwnerPid, ownerPid: process.pid,
    secondRuntimeStarted: Boolean(reopened), secondStartError
  }));
} finally {
  await reopened?.close();
  await new Promise(resolve => blocker.close(resolve));
}
// 未安全关闭的第一个 SQLite owner 随此隔离测试进程退出，父进程随后清理目录。
