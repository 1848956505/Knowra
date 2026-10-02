import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { backupPath, inspectRuntimeBackup } from './backup.mjs';
import { captureBackupDirectory, captureExternalBackupDirectory, captureBackupTree, readBackupTransferFile,
  createOwnedBackupDirectory, backupTransferDigest } from './backup-transfer-files.mjs';

function copyCompleteBackup(source, parent, name, { imported = false, check = () => {} } = {}) {
  check();
  const tree = captureBackupTree(source);
  inspectRuntimeBackup(source);
  const original = JSON.parse(readBackupTransferFile(tree, 'manifest.json').toString('utf8'));
  const files = original.files.map(item => ({ path: item.path, sha256: item.sha256, size: tree.entries.get(item.path).size }));
  const manifest = { version: 1, createdAt: original.createdAt, purpose: imported ? 'imported' : original.purpose,
    datasetId: original.datasetId, files };
  const staging = createOwnedBackupDirectory(parent, `.knowra-transfer-${randomUUID()}`);
  let target;
  try {
    for (const item of files) {
      const bytes = readBackupTransferFile(tree, item.path);
      if (bytes.length !== item.size || backupTransferDigest(bytes) !== item.sha256) throw new Error('备份文件完整性校验失败，原资料已保留。');
      staging.write(item.path, bytes);
    }
    tree.check();
    staging.write('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2)));
    inspectRuntimeBackup(staging.root);
    parent.check();
    target = createOwnedBackupDirectory(parent, name);
    const stagedTree = captureBackupTree(staging.root);
    for (const item of files) target.write(item.path, readBackupTransferFile(stagedTree, item.path));
    tree.check(); stagedTree.check(); target.check(); check();
    // wx 不依赖外部介质的硬链接能力。复制前已完整检查，清单最后写入。
    target.write('manifest.json', readBackupTransferFile(stagedTree, 'manifest.json'));
    const inspection = inspectRuntimeBackup(target.root);
    tree.check(); parent.check(); target.check(); check();
    if (!staging.cleanup()) throw new Error('备份已复制，但临时目录发生变化；请保留目录并重新检查。');
    return { directory: target.root, inspection };
  } catch (error) {
    const targetClean = !target || target.cleanup();
    const stageClean = staging.cleanup();
    if (!targetClean || !stageClean) throw new Error('备份复制已中断，目录或子项发生变化；原资料和已有目标已保留，请保留未完成目录后重新选择。');
    if (error.code === 'EEXIST') throw new Error('完整备份目标已存在，禁止覆盖；请选择另一个父目录。');
    throw error;
  }
}

export function exportRuntimeBackup(dataRoot, backupId, selection) {
  const parent = captureExternalBackupDirectory(selection, dataRoot);
  const result = copyCompleteBackup(backupPath(dataRoot, backupId), parent, `Knowra-完整备份-${backupId}`);
  return { ...result, id: backupId };
}

export function importRuntimeBackup(dataRoot, selection) {
  const source = captureExternalBackupDirectory(selection, dataRoot);
  const backupRoot = path.join(dataRoot, 'backups');
  const managed = captureBackupDirectory(dataRoot);
  managed.check();
  try { fs.mkdirSync(backupRoot, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  const parent = captureBackupDirectory(backupRoot);
  const id = `${Date.now()}-${randomUUID()}`;
  const result = copyCompleteBackup(source.directory, parent, id, { imported: true, check: () => { source.check(); managed.check(); } });
  return { ...result, id };
}
