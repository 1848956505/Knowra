import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

function digest(file) { return createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }

function inventory(root, relative = '') {
  return fs.readdirSync(path.join(root, relative), { withFileTypes: true }).flatMap(entry => {
    const name = path.join(relative, entry.name);
    if (entry.isSymbolicLink()) throw new Error('备份目录中不允许符号链接。');
    return entry.isDirectory() ? inventory(root, name) : [{ path: name.split(path.sep).join('/'), sha256: digest(path.join(root, name)) }];
  });
}

export function createRuntimeBackup(store, dataDirectory) {
  const backupDirectory = path.join(dataDirectory, 'backups', `${Date.now()}-${randomUUID()}`);
  fs.mkdirSync(backupDirectory, { recursive: true, mode: 0o700 });
  store.backupTo(path.join(backupDirectory, 'local.sqlite'));
  const uploads = path.join(dataDirectory, 'uploads');
  if (fs.existsSync(uploads)) fs.cpSync(uploads, path.join(backupDirectory, 'uploads'), { recursive: true, dereference: false });
  const files = inventory(backupDirectory);
  fs.writeFileSync(path.join(backupDirectory, 'manifest.json'), JSON.stringify({ version: 1, createdAt: new Date().toISOString(), files }, null, 2), { mode: 0o600 });
  return backupDirectory;
}

/** 只能恢复到不存在的新目录，恢复内容包含队列；不覆盖运行中的数据库。 */
export function restoreRuntimeBackup(backupDirectory, destination) {
  if (fs.existsSync(destination)) throw new Error('恢复目标必须是尚不存在的新目录。');
  const manifest = JSON.parse(fs.readFileSync(path.join(backupDirectory, 'manifest.json'), 'utf8'));
  if (manifest.version !== 1 || !Array.isArray(manifest.files)) throw new Error('备份清单版本无效。');
  const actual = inventory(backupDirectory).filter(item => item.path !== 'manifest.json');
  if (!actual.some(item => item.path === 'local.sqlite') || JSON.stringify(actual) !== JSON.stringify(manifest.files)) {
    throw new Error('备份文件完整性校验失败，未恢复任何内容。');
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const staging = `${destination}.restore-${randomUUID()}`;
  try {
    fs.mkdirSync(staging, { mode: 0o700 });
    for (const file of actual) {
      const target = path.join(staging, file.path);
      fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
      fs.copyFileSync(path.join(backupDirectory, file.path), target);
      fs.chmodSync(target, 0o600);
    }
    fs.renameSync(staging, destination);
  } catch (error) { fs.rmSync(staging, { recursive: true, force: true }); throw error; }
}
