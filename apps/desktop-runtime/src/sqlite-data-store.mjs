import { sameEntity } from '../../api/src/modules/sync/entity-contract.js';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import {
  LOCAL_DATA_COLLECTIONS, LOCAL_DATA_SCHEMA_VERSION, LOCAL_SNAPSHOT_VERSION,
  cloneLocalState, createEmptyLocalState, createPersistedLocalDocument,
  validateLocalSnapshot, validatePersistedLocalState
} from '../../api/src/infrastructure/local-data-schema.js';
import { initializeDatabase, SYNC_PROTOCOL_VERSION } from './sqlite-schema.mjs';
import { collectChanges, entityReferences } from './local-change-set.mjs';

export function createSqliteDataStore(filePath, { beforeCommit = () => {} } = {}) {
  if (fs.existsSync(filePath) && fs.statSync(filePath).size === 0) {
    throw new Error('检测到空的已有数据库，可能发生截断；已停止初始化，请保留文件并恢复备份。');
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(filePath);
  let state;
  let committed;
  let inTransaction = false;
  try {
    initializeDatabase(db, filePath);
    db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON;');
    const initial = createEmptyLocalState();
    for (const row of db.prepare('SELECT collection, payload FROM entities ORDER BY rowid').all()) {
      if (!LOCAL_DATA_COLLECTIONS.includes(row.collection)) throw new Error('本地实体类型未知，请升级应用。');
      initial[row.collection].push(JSON.parse(row.payload));
    }
    state = validatePersistedLocalState(createPersistedLocalDocument(initial));
    committed = cloneLocalState(state);
    db.prepare('INSERT OR IGNORE INTO metadata VALUES (?, ?)').run('deviceId', randomUUID());
    db.prepare('INSERT OR IGNORE INTO metadata VALUES (?, ?)').run('datasetId', randomUUID());
  } catch (error) { db.close(); throw error; }
  const readMeta = key => db.prepare('SELECT value FROM metadata WHERE key = ?').get(key)?.value;
  const deviceId = readMeta('deviceId');

  function restore(snapshot) {
    for (const collection of LOCAL_DATA_COLLECTIONS) state[collection].splice(0, state[collection].length, ...structuredClone(snapshot[collection]));
  }

  function persist() {
    const valid = validatePersistedLocalState(createPersistedLocalDocument(state));
    const changes = collectChanges(committed, valid);
    if (!changes.length) return valid;
    const operationId = randomUUID();
    const dependencies = new Set();
    const ownsTransaction = !db.isTransaction;
    if (ownsTransaction) db.exec('BEGIN IMMEDIATE');
    try {
      for (const change of changes) {
        const { collection, entityId, value } = change;
        const previous = db.prepare('SELECT revision, last_operation_id FROM local_revisions WHERE collection = ? AND id = ?').get(collection, entityId);
        const base = db.prepare('SELECT server_revision FROM sync_base WHERE collection = ? AND id = ?').get(collection, entityId);
        change.localRevision = (previous?.revision ?? 0) + 1;
        change.baseRevision = base?.server_revision ?? null;
        if (previous) dependencies.add(previous.last_operation_id);
        db.prepare('INSERT OR REPLACE INTO local_revisions VALUES (?, ?, ?, ?)').run(collection, entityId, change.localRevision, operationId);
        if (value === null) db.prepare('DELETE FROM entities WHERE collection = ? AND id = ?').run(collection, entityId);
        else db.prepare('INSERT OR REPLACE INTO entities VALUES (?, ?, ?, ?)').run(collection, entityId, JSON.stringify(value), change.localRevision);
      }
      for (const change of changes) {
        for (const ref of entityReferences(change)) {
          const previous = db.prepare('SELECT last_operation_id FROM local_revisions WHERE collection = ? AND id = ?').get(ref.collection, ref.id);
          if (previous && previous.last_operation_id !== operationId) dependencies.add(previous.last_operation_id);
        }
      }
      // 未绑定云端时保留事务前后状态；阶段 2 完成基线映射后才能传输。
      const queuedChanges = changes.filter(change => change.collection !== 'attachments' || !sameEntity('attachments', change.before, change.value));
      if (queuedChanges.length) db.prepare(`INSERT INTO sync_outbox
        (operation_id, device_id, protocol_version, state, changes, dependencies, created_at)
        VALUES (?, ?, ?, 'pending', ?, ?, ?)`)
        .run(operationId, deviceId, SYNC_PROTOCOL_VERSION, JSON.stringify(queuedChanges), JSON.stringify([...dependencies]), new Date().toISOString());
      beforeCommit();
      if (ownsTransaction) {
        db.exec('COMMIT');
        restore(valid);
        committed = cloneLocalState(valid);
      }
      return valid;
    } catch (error) {
      if (db.isTransaction) db.exec('ROLLBACK');
      throw error;
    }
  }

  function runTransaction(operation) {
    if (inTransaction) return operation();
    inTransaction = true;
    try {
      const result = operation();
      if (result && typeof result.then === 'function') throw new TypeError('本地事务只能执行同步业务操作。');
      persist();
      return result;
    } catch (error) { restore(committed); throw error; }
    finally { inTransaction = false; }
  }

  function flush() {
    if (inTransaction) return;
    try { persist(); } catch (error) { restore(committed); throw error; }
  }

  function exportSnapshot() {
    return { exportedAt: new Date().toISOString(), version: LOCAL_SNAPSHOT_VERSION, schemaVersion: LOCAL_DATA_SCHEMA_VERSION, data: cloneLocalState(state) };
  }

  function commitImport(input) {
    const validated = validateLocalSnapshot(input);
    return runTransaction(() => { restore(validated.data); return exportSnapshot(); });
  }

  return {
    syncTransaction(operation, { local = false } = {}) {
      if (inTransaction) throw new Error('同步事务不能嵌入本地业务事务。');
      db.exec('BEGIN IMMEDIATE');
      inTransaction = true;
      try {
        const result = operation(db, state);
        if (result?.then) throw new TypeError('同步落库事务不能包含网络请求。');
        let valid;
        if (local) valid = persist();
        else {
          valid = validatePersistedLocalState(createPersistedLocalDocument(state));
          for (const change of collectChanges(committed, valid)) {
            if (change.value === null) db.prepare('DELETE FROM entities WHERE collection = ? AND id = ?').run(change.collection, change.entityId);
            else {
              const revision = db.prepare('SELECT revision FROM local_revisions WHERE collection = ? AND id = ?').get(change.collection, change.entityId)?.revision ?? 0;
              db.prepare('INSERT OR REPLACE INTO entities VALUES (?, ?, ?, ?)').run(change.collection, change.entityId, JSON.stringify(change.value), revision);
            }
          }
        }
        beforeCommit();
        db.exec('COMMIT');
        restore(valid);
        committed = cloneLocalState(valid);
        return result;
      } catch (error) {
        if (db.isTransaction) db.exec('ROLLBACK');
        restore(committed);
        throw error;
      } finally { inTransaction = false; }
    },
    readSync: operation => operation(db, state),
    state, flush, runTransaction, exportSnapshot, prepareImport: validateLocalSnapshot,
    commitImport, importSnapshot: commitImport,
    getStatus: () => ({
      mode: 'desktop-local', deviceId, datasetId: readMeta('datasetId'),
      protocolVersion: SYNC_PROTOCOL_VERSION, cloudSync: readMeta('sync:serverUrl') ? 'configured' : 'not-configured',
      pendingOperations: db.prepare("SELECT COUNT(*) AS count FROM sync_outbox WHERE state != 'acknowledged'").get().count
    }),
    readOutbox: () => db.prepare('SELECT * FROM sync_outbox ORDER BY sequence').all().map(row => ({
      operationId: row.operation_id, deviceId: row.device_id, protocolVersion: row.protocol_version,
      state: row.state, changes: JSON.parse(row.changes), dependencies: JSON.parse(row.dependencies)
    })),
    backupTo(destination) {
      if (fs.existsSync(destination)) throw new Error('备份目标已存在，禁止覆盖。');
      db.prepare('VACUUM INTO ?').run(destination);
      fs.chmodSync(destination, 0o600);
    },
    close: () => db.close()
  };
}
