import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createSqliteDataStore } from './sqlite-data-store.mjs';
import { restoreRuntimeBackup, inspectRuntimeBackup } from './backup.mjs';

const pointerFile = root => path.join(root, 'active-dataset.json');
function managedDirectory(root, relative) {
  if (typeof relative !== 'string' || !/^restored\/[a-f0-9-]+$/.test(relative)) throw new Error('活动资料目录记录无效，原数据未修改。');
  const directory = path.join(root, ...relative.split('/'));
  for (const candidate of [path.join(root, 'restored'), directory]) if (fs.existsSync(candidate) && fs.lstatSync(candidate).isSymbolicLink()) throw new Error('恢复资料目录不允许符号链接。');
  return directory;
}
export function readActiveDirectory(root) {
  if (!fs.existsSync(pointerFile(root))) return root;
  if (fs.lstatSync(pointerFile(root)).isSymbolicLink()) throw new Error('活动资料记录不能是符号链接。');
  const pointer = JSON.parse(fs.readFileSync(pointerFile(root), 'utf8'));
  const directory = managedDirectory(root, pointer.directory);
  if (pointer.version !== 1 || !fs.existsSync(path.join(directory, 'local.sqlite'))) throw new Error('活动资料目录不存在，已停止启动。');
  return directory;
}
export function prepareRestoredDirectory(root, backupDirectory) {
  inspectRuntimeBackup(backupDirectory);
  const directory = managedDirectory(root, `restored/${randomUUID()}`);
  restoreRuntimeBackup(backupDirectory, directory);
  const restored = createSqliteDataStore(path.join(directory, 'local.sqlite'));
  try {
    restored.syncTransaction(db => {
      db.prepare('INSERT OR REPLACE INTO metadata VALUES (?, ?)').run('datasetId', randomUUID());
      db.prepare('INSERT OR REPLACE INTO metadata VALUES (?, ?)').run('sync:clientPaused', 'true');
    });
  } finally { restored.close(); }
  return directory;
}
export function activateRestoredDirectory(root, directory, record) {
  const relative = path.relative(root, directory).split(path.sep).join('/');
  managedDirectory(root, relative);
  const temporary = path.join(root, `.active-dataset-${randomUUID()}.tmp`);
  let fd;
  try {
    fd = fs.openSync(temporary, 'wx', 0o600);
    fs.writeFileSync(fd, JSON.stringify({ version: 1, directory: relative, ...record }, null, 2));
    fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
    fs.renameSync(temporary, pointerFile(root));
  } finally { if (fd !== undefined) fs.closeSync(fd); fs.rmSync(temporary, { force: true }); }
  // rename 已经发布；目录 fsync 失败不能被当成恢复失败而回滚到旧运行上下文。
  if (process.platform !== 'win32') {
    let directoryFd;
    try { directoryFd = fs.openSync(root, 'r'); fs.fsyncSync(directoryFd); } catch { /* 重启仍按原子指针选择完整资料集。 */ }
    finally { if (directoryFd !== undefined) fs.closeSync(directoryFd); }
  }
}
