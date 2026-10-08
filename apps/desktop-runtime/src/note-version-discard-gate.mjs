import { readMeta } from './sync-state.mjs';

// 业务实体已由知识模块逐类检查；这些表不是版本的外部引用者。
const NOT_EXTERNAL_REFERENCES = new Set(['entities', 'sync_base', 'sync_outbox', 'local_revisions', 'deletion_facts', 'metadata']);

function externalTextColumns(db) {
  const columns = [];
  for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all()) {
    if (NOT_EXTERNAL_REFERENCES.has(name)) continue;
    for (const column of db.prepare(`PRAGMA table_info("${name}")`).all()) {
      if (/TEXT|CHAR|CLOB|JSON|^$/i.test(column.type)) columns.push({ table: name, column: column.name });
    }
  }
  return columns;
}

const columnCache = new WeakMap();
/** AI 对话、任务、清单等私有记录按 ID 或正文哈希引用版本；云端和业务实体检查看不到它们。 */
export function referencedByPrivateRecords(db, version) {
  let columns = columnCache.get(db);
  if (!columns) { columns = externalTextColumns(db); columnCache.set(db, columns); }
  return columns.some(({ table, column }) => db.prepare(`SELECT 1 FROM "${table}" WHERE instr("${column}", ?) > 0 OR instr("${column}", ?) > 0 LIMIT 1`)
    .get(version.id, version.contentHash));
}

/**
 * 只有本机尚未交给云端、也没有被 AI 对话/任务等私有记录引用的版本才能被合并删除。
 * 已同步的历史版本在云端不可变，本地删除会变成被拒绝的删除上传。
 */
export function createNoteVersionDiscardGate(store) {
  return function canDiscard(version) {
    return store.readSync(db => {
      const synced = db.prepare(`SELECT 1 FROM sync_base WHERE collection = 'noteVersions'
        AND (id = ? OR (json_extract(payload, '$.noteId') = ? AND json_extract(payload, '$.contentHash') = ?)) LIMIT 1`)
        .get(version.id, version.noteId, version.contentHash);
      if (synced) return false;
      // 上传已冻结（可能已发出但未确认）或存在冲突/旧队列时，保守保留。
      if (readMeta(db, 'entityUpload') || readMeta(db, 'entityConflict')) return false;
      if (db.prepare('SELECT 1 FROM sync_uploads LIMIT 1').get()) return false;
      return !referencedByPrivateRecords(db, version);
    });
  };
}
