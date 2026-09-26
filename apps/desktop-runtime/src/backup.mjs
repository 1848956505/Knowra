import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { LOCAL_DATA_COLLECTIONS, createEmptyLocalState, createPersistedLocalDocument, validatePersistedLocalState } from '../../api/src/infrastructure/local-data-schema.js';
import { LOCAL_DATABASE_VERSION } from './sqlite-schema.mjs';
import { createSqliteAiRepository } from './ai-sqlite-repository.mjs';
import { AI_RECORD_KINDS, validateAiEvent, validateAiRecord } from '../../api/src/modules/ai/record-contract.js';
import { copyRecoveryDraftFiles, listArchivedDraftFiles } from './recovery-draft-files.mjs';

const digest = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function inventory(root, relative = '') {
  if (fs.lstatSync(path.join(root, relative)).isSymbolicLink()) throw new Error('备份目录中不允许符号链接。');
  return fs.readdirSync(path.join(root, relative), { withFileTypes: true }).flatMap(entry => {
    const name = path.join(relative, entry.name);
    if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) throw new Error('备份中只能包含普通文件和目录。');
    return entry.isDirectory() ? inventory(root, name) : [{ path: name.split(path.sep).join('/'), sha256: digest(path.join(root, name)), size: fs.statSync(path.join(root, name)).size }];
  }).sort((a, b) => a.path.localeCompare(b.path));
}
const supportedPath = name => name === 'local.sqlite' || name === 'recovery-drafts.json' || name === 'recovery.json' || /^recovery-draft-archives\/[a-f0-9]{64}\.json$/.test(name) || (typeof name === 'string' && name.startsWith('uploads/') && !name.includes('\\') && name.split('/').every(segment => segment && segment !== '.' && segment !== '..'));

export function backupPath(dataDirectory, id) {
  if (typeof id !== 'string' || !/^\d+-[a-f0-9-]+$/.test(id)) throw new Error('备份编号无效。');
  const root = path.join(dataDirectory, 'backups');
  if (fs.existsSync(root) && fs.lstatSync(root).isSymbolicLink()) throw new Error('备份目录不允许符号链接。');
  const directory = path.join(root, id);
  if (!fs.existsSync(directory) || !fs.lstatSync(directory).isDirectory() || fs.lstatSync(directory).isSymbolicLink()) throw new Error('备份目录不存在或无效。');
  return directory;
}

export function createRuntimeBackup(store, dataDirectory, { backupRoot = dataDirectory, purpose = 'manual', draftsDirectory = backupRoot, recoveryDrafts } = {}) {
  const backupDirectory = path.join(backupRoot, 'backups', `${Date.now()}-${randomUUID()}`);
  if (fs.existsSync(path.dirname(backupDirectory)) && fs.lstatSync(path.dirname(backupDirectory)).isSymbolicLink()) throw new Error('备份目录不允许符号链接。');
  fs.mkdirSync(backupDirectory, { recursive: true, mode: 0o700 });
  try {
    store.backupTo(path.join(backupDirectory, 'local.sqlite'));
    const uploads = path.join(dataDirectory, 'uploads');
    if (fs.existsSync(uploads)) fs.cpSync(uploads, path.join(backupDirectory, 'uploads'), { recursive: true, dereference: false });
    copyRecoveryDraftFiles(dataDirectory, backupDirectory, draftsDirectory);
    if (recoveryDrafts !== undefined) {
      const browserDrafts = validateBackupDrafts(recoveryDrafts);
      const combined = { version: 1, drafts: { ...readBackupDrafts(backupDirectory).drafts, ...browserDrafts.drafts } };
      fs.writeFileSync(path.join(backupDirectory, 'recovery-drafts.json'), JSON.stringify(combined), { mode: 0o600 });
    }
    const files = inventory(backupDirectory);
    fs.writeFileSync(path.join(backupDirectory, 'manifest.json'), JSON.stringify({ version: 1, createdAt: new Date().toISOString(), purpose, datasetId: store.getStatus().datasetId, files }, null, 2), { mode: 0o600 });
    return backupDirectory;
  } catch (error) { fs.rmSync(backupDirectory, { recursive: true, force: true }); throw error; }
}

export function listRuntimeBackups(dataDirectory) {
  const root = path.join(dataDirectory, 'backups');
  if (!fs.existsSync(root)) return [];
  if (fs.lstatSync(root).isSymbolicLink()) throw new Error('备份目录不允许符号链接。');
  return fs.readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory() && /^\d+-[a-f0-9-]+$/.test(entry.name)).map(entry => {
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(root, entry.name, 'manifest.json'), 'utf8'));
      return { id: entry.name, createdAt: manifest.createdAt, purpose: manifest.purpose ?? 'legacy-unspecified', fileCount: manifest.files?.length ?? 0, size: manifest.files?.reduce((sum, file) => sum + (Number(file.size) || 0), 0) ?? 0 };
    } catch { return { id: entry.name, createdAt: null, purpose: 'unknown', fileCount: 0, size: 0, error: '备份清单不可读，请检查此备份。' }; }
  }).sort((a, b) => b.id.localeCompare(a.id));
}

/** 请求正文总量由 HTTP 解析器限制；这里仅接受草稿键和值，不接受文件路径。 */
export function validateBackupDrafts(record) {
  if (!record || record.version !== 1 || !record.drafts || typeof record.drafts !== 'object' || Array.isArray(record.drafts)) throw new Error('恢复草稿格式无效。');
  if (Buffer.byteLength(JSON.stringify(record)) > 8 * 1024 * 1024) throw new Error('恢复草稿过大，请先分批导出正文。');
  for (const [key, value] of Object.entries(record.drafts)) {
    const prefix = ['knowra:note-draft:v1:', 'knowra:knowledge-draft:v1:'].find(prefix => key.startsWith(prefix));
    if (!prefix || key.length > 2000) throw new Error('恢复草稿标识无效。');
    let parts;
    try { parts = JSON.parse(key.slice(prefix.length)); } catch { throw new Error('恢复草稿标识无效。'); }
    if (!Array.isArray(parts) || parts.length !== 2 || parts.some(part => typeof part !== 'string' || !part)) throw new Error('恢复草稿标识无效。');
    if (prefix === 'knowra:knowledge-draft:v1:') {
      const form = value => value && ['title', 'canonicalStatement', 'userExplanation'].every(key => typeof value[key] === 'string')
        && ['concept', 'fact', 'principle', 'process', 'algorithm', 'formula', 'comparison', 'application'].includes(value.knowledgeType);
      const source = value?.source;
      if (!value || value.version !== 1 || !['create', 'edit'].includes(value.kind) || value.candidateId !== parts[1] || !form(value.initialValue) || !form(value.value)
        || (value.kind === 'edit' && (typeof value.expectedUpdatedAt !== 'string' || !value.expectedUpdatedAt))
        || (source && (value.kind !== 'create' || typeof source.annotationId !== 'string' || !source.annotationId || typeof source.quoteText !== 'string'
          || !Array.isArray(source.headingPath) || source.headingPath.some(value => typeof value !== 'string')
          || (source.noteVersionId !== undefined && typeof source.noteVersionId !== 'string')
          || (source.expectedAnnotationRevision !== undefined && (!Number.isInteger(source.expectedAnnotationRevision) || source.expectedAnnotationRevision < 1))))) throw new Error('知识恢复草稿格式无效。');
    } else if (!value || typeof value.markdown !== 'string' || typeof value.baseMarkdown !== 'string'
      || (value.baseUpdatedAt !== undefined && typeof value.baseUpdatedAt !== 'string')
      || (value.conflict !== undefined && typeof value.conflict !== 'string')) throw new Error('恢复草稿正文格式无效。');
  }
  return record;
}

export function readBackupDrafts(directory) {
  const readRecord = file => {
    if (fs.lstatSync(file).isSymbolicLink()) throw new Error('恢复草稿不能是符号链接。');
    const record = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (record.version !== 1 || !record.drafts || typeof record.drafts !== 'object' || Array.isArray(record.drafts)) throw new Error('恢复草稿格式无效。');
    return { version: 1, drafts: record.drafts };
  };
  const file = path.join(directory, 'recovery-drafts.json');
  const record = fs.existsSync(file) ? readRecord(file) : { version: 1, drafts: {} };
  const archives = listArchivedDraftFiles(directory).map(({ id, file }) => ({ id, ...readRecord(file) }));
  if (archives.length) record.archivedDrafts = archives;
  return record;
}

function verifyBackupFiles(backupDirectory) {
  const manifest = JSON.parse(fs.readFileSync(path.join(backupDirectory, 'manifest.json'), 'utf8'));
  if (manifest.version !== 1 || !Array.isArray(manifest.files) || !manifest.files.every(file => supportedPath(file.path))) throw new Error('备份清单版本或文件路径无效。');
  const actual = inventory(backupDirectory).filter(item => item.path !== 'manifest.json');
  const expected = new Map(manifest.files.map(file => [file.path, file.sha256]));
  if (!expected.has('local.sqlite') || expected.size !== manifest.files.length || actual.length !== expected.size || actual.some(file => expected.get(file.path) !== file.sha256)) throw new Error('备份文件完整性校验失败，未恢复任何内容。');
  return { manifest, actual };
}

/** 界面激活前检查数据库版本、资料引用和附件；离线救援复制不依赖应用 schema。 */
export function inspectRuntimeBackup(backupDirectory) {
  const { manifest, actual } = verifyBackupFiles(backupDirectory);
  const db = new DatabaseSync(path.join(backupDirectory, 'local.sqlite'), { readOnly: true });
  try {
    if (db.prepare('PRAGMA integrity_check').all().some(row => row.integrity_check !== 'ok')) throw new Error('备份数据库完整性校验失败。');
    const version = db.prepare('PRAGMA user_version').get().user_version;
    if (version < 1 || version > LOCAL_DATABASE_VERSION) throw new Error('备份数据库版本不受支持，请升级应用。');
    if (version >= 4) {
      if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('备份 AI 私有记录引用不完整。');
      const ai = createSqliteAiRepository(db);
      for (const kind of Object.keys(AI_RECORD_KINDS)) ai.list(kind).forEach(record => validateAiRecord(kind, record));
      for (const job of ai.list('aiJob')) ai.listEvents(job.jobId).forEach(validateAiEvent);
    }
    const state = createEmptyLocalState();
    for (const row of db.prepare('SELECT collection, payload FROM entities').all()) {
      if (!LOCAL_DATA_COLLECTIONS.includes(row.collection)) throw new Error('备份包含未知资料类型。');
      state[row.collection].push(JSON.parse(row.payload));
    }
    validatePersistedLocalState(createPersistedLocalDocument(state));
    const files = new Map(actual.map(file => [file.path, file]));
    for (const attachment of state.attachments.filter(item => item.status === 'ready')) {
      const file = files.get(`uploads/${attachment.id}-${attachment.fileName}`);
      if (!file || file.sha256 !== attachment.sha256 || file.size !== attachment.size) throw new Error(`备份附件“${attachment.fileName}”缺失或内容校验失败。`);
    }
    const draftRecord = readBackupDrafts(backupDirectory);
    const draftCount = [draftRecord, ...(draftRecord.archivedDrafts ?? [])].reduce((count, record) => count + Object.keys(record.drafts).length, 0);
    return { valid: true, createdAt: manifest.createdAt, purpose: manifest.purpose ?? 'legacy-unspecified', fileCount: actual.length, size: actual.reduce((sum, file) => sum + file.size, 0), noteCount: state.notes.length, attachmentCount: state.attachments.length, pendingOperations: db.prepare("SELECT COUNT(*) AS count FROM sync_outbox WHERE state != 'acknowledged'").get().count, draftCount };
  } finally { db.close(); }
}

/** 只能恢复到不存在的新目录，保留同步队列；不覆盖运行中的数据库。 */
export function restoreRuntimeBackup(backupDirectory, destination) {
  if (fs.existsSync(destination)) throw new Error('恢复目标必须是尚不存在的新目录。');
  const { actual } = verifyBackupFiles(backupDirectory);
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
