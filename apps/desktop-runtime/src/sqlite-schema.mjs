import fs from 'node:fs';

export const LOCAL_DATABASE_VERSION = 3;
export const SYNC_PROTOCOL_VERSION = 1;

export function initializeDatabase(db, filePath) {
  const version = db.prepare('PRAGMA user_version').get().user_version;
  if (version === LOCAL_DATABASE_VERSION) return;
  if (version === 2) {
    const backup = `${filePath}.before-v3-${Date.now()}.bak`;
    db.prepare('VACUUM INTO ?').run(backup);
    fs.chmodSync(backup, 0o600);
    db.exec(`BEGIN IMMEDIATE;
      INSERT OR REPLACE INTO metadata VALUES ('entitySyncVersion', '2');
      PRAGMA user_version = 3;
      COMMIT;`);
    return;
  }
  if (version === 1) {
    const backup = `${filePath}.before-v2-${Date.now()}.bak`;
    db.prepare('VACUUM INTO ?').run(backup);
    fs.chmodSync(backup, 0o600);
    db.exec(`BEGIN IMMEDIATE;
      CREATE TABLE sync_uploads (note_id TEXT PRIMARY KEY, request TEXT NOT NULL, local_revision INTEGER NOT NULL);
      CREATE TABLE sync_conflicts (note_id TEXT PRIMARY KEY, payload TEXT NOT NULL);
      CREATE TABLE sync_recovery (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
      PRAGMA user_version = 2;
      COMMIT;`);
    return initializeDatabase(db, filePath);
  }
  if (version !== 0) throw new Error(`不支持的本地数据库版本 ${version}，请升级应用；原数据库未修改。`);
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all();
  if (tables.length) throw new Error('检测到未标记版本的数据库，已停止初始化，原数据未覆盖。');
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(`
      CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE entities (
        collection TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL,
        local_revision INTEGER NOT NULL, PRIMARY KEY (collection, id)
      );
      CREATE TABLE sync_base (
        collection TEXT NOT NULL, id TEXT NOT NULL, server_revision INTEGER,
        payload TEXT, PRIMARY KEY (collection, id)
      );
      CREATE TABLE sync_outbox (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT, operation_id TEXT UNIQUE NOT NULL,
        device_id TEXT NOT NULL, protocol_version INTEGER NOT NULL,
        state TEXT NOT NULL CHECK(state IN ('pending','sending','acknowledged','retry_wait','blocked_dependency','conflict','failed_permanent')),
        changes TEXT NOT NULL, dependencies TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE TABLE local_revisions (
        collection TEXT NOT NULL, id TEXT NOT NULL, revision INTEGER NOT NULL,
        last_operation_id TEXT NOT NULL, PRIMARY KEY (collection, id)
      );
      CREATE TABLE sync_uploads (note_id TEXT PRIMARY KEY, request TEXT NOT NULL, local_revision INTEGER NOT NULL);
      CREATE TABLE sync_conflicts (note_id TEXT PRIMARY KEY, payload TEXT NOT NULL);
      CREATE TABLE sync_recovery (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
      INSERT OR REPLACE INTO metadata VALUES ('entitySyncVersion', '2');
      PRAGMA user_version = 3;
    `);
    db.exec('COMMIT');
    fs.chmodSync(filePath, 0o600);
  } catch (error) {
    if (db.isTransaction) db.exec('ROLLBACK');
    throw error;
  }
}
