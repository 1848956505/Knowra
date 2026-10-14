import fs from 'node:fs';
import path from 'node:path';
import { startLocalRuntime } from '../../src/runtime-server.mjs';

const root = process.argv[2], dataDirectory = path.join(root, 'failure-data'), distRoot = path.join(root, 'failure-dist');
fs.mkdirSync(distRoot); fs.writeFileSync(path.join(distRoot, 'index.html'), '<html><head></head></html>');
const stages = [];
const options = { dataDirectory, distRoot, logger: { warn() {}, error() {} }, syncOptions: { autoSync: false },
  aiRuntimeFactory: () => ({ worker: { close() { throw new Error('synthetic shutdown failure'); } } }),
  onCloseStage: stage => stages.push(stage) };
const runtime = await startLocalRuntime(options);
const closing = runtime.close();
let rejected = false;
try { await closing; } catch { rejected = true; }
let secondBlocked = false;
try { await startLocalRuntime(options); } catch (error) { secondBlocked = /本地数据目录已被使用/.test(error.message); }
console.log(JSON.stringify({ rejected, sameClose: runtime.close() === closing, secondBlocked,
  storeOpen: Boolean(runtime.store.getStatus().datasetId), lockExists: fs.existsSync(path.join(dataDirectory, 'runtime.lock')), stages }));
// 独立测试进程结束后才清理目录；失败退出必须保留原存储 owner。
