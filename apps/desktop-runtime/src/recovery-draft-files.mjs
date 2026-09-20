import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const archiveFolder = 'recovery-draft-archives';
const digest = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const requireFile = file => {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('恢复草稿必须是普通文件，不能是符号链接。');
};

export function listArchivedDraftFiles(directory, { verify = true } = {}) {
  const root = path.join(directory, archiveFolder);
  if (!fs.existsSync(root)) return [];
  const stat = fs.lstatSync(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('恢复草稿归档必须是普通目录。');
  return fs.readdirSync(root).sort().map(name => {
    if (!/^[a-f0-9]{64}\.json$/.test(name)) throw new Error('恢复草稿归档名称无效。');
    const file = path.join(root, name);
    requireFile(file);
    if (verify && `${digest(file)}.json` !== name) throw new Error('恢复草稿归档内容校验失败。');
    return { id: name.slice(0, -5), file };
  });
}

/** 原生草稿仍留在根目录；恢复来源的草稿另行归档，保持其原始键和值。 */
export function copyRecoveryDraftFiles(dataDirectory, destination, draftsDirectory = dataDirectory) {
  const primary = path.join(draftsDirectory, 'recovery-drafts.json');
  let primaryDigest;
  if (fs.existsSync(primary)) {
    requireFile(primary);
    primaryDigest = digest(primary);
    fs.copyFileSync(primary, path.join(destination, 'recovery-drafts.json'));
    fs.chmodSync(path.join(destination, 'recovery-drafts.json'), 0o600);
  }
  const sources = new Set([draftsDirectory, dataDirectory]);
  // 救援导出即使遇到损坏原件也要保留字节；复制后的文件名重新按实际内容计算。
  const files = [...sources].flatMap(directory => listArchivedDraftFiles(directory, { verify: false }).map(item => item.file));
  if (dataDirectory !== draftsDirectory) {
    const restored = path.join(dataDirectory, 'recovery-drafts.json');
    if (fs.existsSync(restored)) { requireFile(restored); files.push(restored); }
  }
  for (const file of files) {
    const id = digest(file);
    if (id === primaryDigest) continue;
    const folder = path.join(destination, archiveFolder);
    fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
    const target = path.join(folder, `${id}.json`);
    fs.copyFileSync(file, target);
    fs.chmodSync(target, 0o600);
  }
}
