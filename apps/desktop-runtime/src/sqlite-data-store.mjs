import {
  validateSqliteDeletionFacts, initializeDeletionFacts, assertNoDeletedEntities,
  recordLocalDeletions, hasDeletionFact, deletionFactsReader
} from './sqlite-deletion-facts.mjs';
import { createSqliteActionStore } from './ai-sqlite-action-store.mjs';
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
import { createSqliteCoreOperationStore } from './core-operation-store.mjs';
import { createSqliteKnowledgeExtractionCommitStore } from './knowledge-extraction-commit-store.mjs';
import { createSqliteKnowledgeExtractionTaskStore } from './knowledge-extraction-task-store.mjs';
import { createSqliteAiRepository } from './ai-sqlite-repository.mjs';
import { createSqliteAiAccessStore, validateSqliteAccessRows } from './ai-sqlite-access-store.mjs';
import { createSqliteAiConversationStore, validateSqliteConversationRows } from './ai-sqlite-conversation-store.mjs';
import { collectChanges, entityReferences } from './local-change-set.mjs';
import { backfillKnowledgeArtifactProvenance } from '../../api/src/infrastructure/migration/knowledge-artifact-provenance-backfill.js';
import { knowledgeExtractionCommitKey } from '../../api/src/modules/ai/knowledge-extraction-commit-contract.js';
import { assertNoKnowledgeArtifactProvenanceDowngrade } from '../../api/src/modules/knowledge/domain/knowledge-artifact-provenance-state.js';

export function createSqliteDataStore(filePath, { beforeCommit = () => {} } = {}) {
  if (fs.existsSync(filePath) && fs.statSync(filePath).size === 0) {
    throw new Error('检测到空的已有数据库，可能发生截断；已停止初始化，请保留文件并恢复备份。');
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(filePath);
  let state;
  let committed;
  let repairKnowledge = false;
  let migrateProvenance = false;
  let provenanceMigration;
  let inTransaction = false;
  let dataRevision = 0;
  let syncRevision = 0;
  let baselineRevision = 0;
  let pendingLocalChange = false;
  let pendingDataChange = false;
  let statusCache;
  const localCommitListeners = new Set();
  let aiRuntimeError = null;
  try {
    // 必需核心扩展先于任何可选 AI 升级或来源修复校验。
    validateSqliteDeletionFacts(db);
    const newStore = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().length === 0;
    aiRuntimeError = initializeDatabase(db, filePath)?.aiError ?? null;
    initializeDeletionFacts(db, { newStore, filePath });
    db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON;');
    const initial = createEmptyLocalState();
    for (const row of db.prepare('SELECT collection, payload FROM entities ORDER BY rowid').all()) {
      if (!LOCAL_DATA_COLLECTIONS.includes(row.collection)) throw new Error('本地实体类型未知，请升级应用。');
      initial[row.collection].push(JSON.parse(row.payload));
    }
    const schema = db.prepare("SELECT value FROM metadata WHERE key = 'localDataSchemaVersion'").get()?.value;
    if (schema !== undefined && !/^[1-7]$/.test(schema)) throw new Error('本地业务 schema 版本未知，请升级应用。');
    const schemaVersion = schema === undefined ? 6 : Number(schema);
    state = validatePersistedLocalState({ schemaVersion, ...initial });
    const receiptVersion = db.prepare("SELECT value FROM metadata WHERE key = 'knowledgeExtractionCommitsVersion'").get()?.value;
    const receiptTable = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'knowledge_extraction_commits'").get();
    let receipts = [];
    if (receiptVersion === '1' && receiptTable) {
      try { receipts = db.prepare('SELECT * FROM knowledge_extraction_commits').all().map(row => {
        try {
          const record = JSON.parse(row.receipt_json);
          return knowledgeExtractionCommitKey(record) === knowledgeExtractionCommitKey({ ownerId: row.owner_id,
            datasetId: row.dataset_id, jobId: row.job_id }) ? record : null;
        } catch { return null; }
      }); } catch { /* 可选旧 receipt 扩展独立隔离。 */ }
    }
    const deleted = new Set();
    for (const row of db.prepare("SELECT collection, id, server_revision FROM sync_base WHERE payload = 'null'").all()) {
      // 旧 reset 用 null 修订记录缺席；只有已确认的正修订才表示永久删除。
      if (row.server_revision === null) continue;
      if (!Number.isSafeInteger(row.server_revision) || row.server_revision < 1) throw new Error('同步基线删除修订无效，已停止来源回填。');
      deleted.add(JSON.stringify([row.collection, row.id]));
    }
    provenanceMigration = backfillKnowledgeArtifactProvenance(state, {
      receipts, getTombstone: (collection, id) => deleted.has(JSON.stringify([collection, id])) || hasDeletionFact(db, collection, id)
    });
    if (state.knowledgeArtifactProvenance.some(record => !initial.knowledgeArtifactProvenance.some(old => old.id === record.id) && deleted.has(JSON.stringify(['knowledgeArtifactProvenance', record.id])))) {
      throw new Error('已永久删除的来源记录不能通过迁移重建。');
    }
    assertNoDeletedEntities(db, state, initial);
    migrateProvenance = schemaVersion !== LOCAL_DATA_SCHEMA_VERSION;
    repairKnowledge = ['knowledgeItems', 'knowledgeEvidence', 'knowledgeArtifactProvenance'].some(collection => JSON.stringify(initial[collection]) !== JSON.stringify(state[collection]));
    committed = cloneLocalState(repairKnowledge ? initial : state);
    db.prepare('INSERT OR IGNORE INTO metadata VALUES (?, ?)').run('deviceId', randomUUID());
    db.prepare('INSERT OR IGNORE INTO metadata VALUES (?, ?)').run('datasetId', randomUUID());
  } catch (error) { db.close(); throw error; }
  const readMeta = key => db.prepare('SELECT value FROM metadata WHERE key = ?').get(key)?.value;
  const deviceId = readMeta('deviceId');
  let aiRepository = null;
  let aiAccessStore = null;
  let aiConversationStore = null;
  if (!aiRuntimeError) {
    try {
      aiRepository = createSqliteAiRepository(db);
      aiRepository.list('aiJob');
      validateSqliteAccessRows(db);
      aiAccessStore = createSqliteAiAccessStore(db);
      aiConversationStore = createSqliteAiConversationStore(db);
      validateSqliteConversationRows(db);
    }
    catch (error) { aiRuntimeError = error; aiRepository = null; aiAccessStore = null; aiConversationStore = null; }
  }

  function restore(snapshot) {
    for (const collection of LOCAL_DATA_COLLECTIONS) state[collection].splice(0, state[collection].length, ...structuredClone(snapshot[collection]));
  }

  const totalChanges = () => db.prepare('SELECT total_changes() AS count').get().count;
  function didCommit({ dataChanged = false, syncChanged = false, baselineChanged = false } = {}) {
    if (dataChanged) dataRevision++;
    if (syncChanged) syncRevision++;
    if (baselineChanged) baselineRevision++;
    if (pendingLocalChange) {
      pendingLocalChange = false;
      for (const listener of localCommitListeners) {
        try { listener(); } catch { /* 同步调度失败不能撤销已经完成的本地保存。 */ }
      }
    }
  }

  function persist({ origin = 'local-business' } = {}) {
    const valid = validatePersistedLocalState(createPersistedLocalDocument(state));
    assertNoKnowledgeArtifactProvenanceDowngrade(committed, valid);
    const changes = collectChanges(committed, valid);
    pendingDataChange = changes.length > 0;
    if (!changes.length) return valid;
    const operationId = randomUUID();
    const dependencies = new Set();
    const ownsTransaction = !db.isTransaction;
    if (ownsTransaction) db.exec('BEGIN IMMEDIATE');
    try {
      assertNoDeletedEntities(db, valid, committed);
      if (origin === 'local-business') recordLocalDeletions(db, changes, operationId);
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
      pendingLocalChange ||= queuedChanges.length > 0;
      if (ownsTransaction) beforeCommit();
      if (ownsTransaction) {
        db.exec('COMMIT');
        restore(valid);
        committed = cloneLocalState(valid);
        didCommit({ dataChanged: true });
      }
      return valid;
    } catch (error) {
      if (db.isTransaction) db.exec('ROLLBACK');
      pendingLocalChange = false;
      throw error;
    }
  }

  function runTransaction(operation, { origin = 'local-business' } = {}) {
    if (inTransaction) return operation();
    inTransaction = true;
    try {
      db.exec('BEGIN IMMEDIATE');
      const result = operation();
      if (result && typeof result.then === 'function') throw new TypeError('本地事务只能执行同步业务操作。');
      const valid = persist({ origin });
      const dataChanged = pendingDataChange;
      beforeCommit();
      db.exec('COMMIT');
      restore(valid);
      committed = cloneLocalState(valid);
      didCommit({ dataChanged });
      return result;
    } catch (error) {
      if (db.isTransaction) db.exec('ROLLBACK');
      restore(committed);
      pendingLocalChange = false;
      throw error;
    }
    finally { inTransaction = false; }
  }

  function flush() {
    if (inTransaction) return;
    try { persist(); } catch (error) { restore(committed); throw error; }
  }

  function exportSnapshot() {
    return { exportedAt: new Date().toISOString(), version: LOCAL_SNAPSHOT_VERSION, schemaVersion: LOCAL_DATA_SCHEMA_VERSION, data: cloneLocalState(state) };
  }

  function prepareImport(input) {
    const validated = validateLocalSnapshot(input);
    assertNoDeletedEntities(db, validated.data);
    return validated;
  }

  function commitImport(input) {
    const validated = prepareImport(input);
    assertNoKnowledgeArtifactProvenanceDowngrade(state, validated.data);
    db.exec('BEGIN IMMEDIATE');
    try {
      assertNoDeletedEntities(db, validated.data);
      restore(validated.data);
      persist();
      aiRepository?.rotateEpoch();
      beforeCommit();
      db.exec('COMMIT');
      committed = cloneLocalState(validated.data);
      didCommit({ dataChanged: true, syncChanged: true, baselineChanged: true });
      return exportSnapshot();
    } catch (error) {
      if (db.isTransaction) db.exec('ROLLBACK');
      restore(committed);
      pendingLocalChange = false;
      throw error;
    }
  }

  if (repairKnowledge || migrateProvenance) {
    try {
      const backup = `${filePath}.before-provenance-v1-${Date.now()}.bak`;
      db.prepare('VACUUM INTO ?').run(backup);
      fs.chmodSync(backup, 0o600);
      runTransaction(() => db.prepare('INSERT OR REPLACE INTO metadata VALUES (?, ?)')
        .run('localDataSchemaVersion', String(LOCAL_DATA_SCHEMA_VERSION)), { origin: 'migration' });
    } catch (error) { db.close(); throw error; }
  }

  let aiActionStore = null;
  if (!aiRuntimeError) {
    try { aiActionStore = createSqliteActionStore(db, filePath, runTransaction); }
    catch (error) { aiRuntimeError = error; }
  }
  let coreOperationStore = null, coreOperationStoreError = null;
  try { coreOperationStore = createSqliteCoreOperationStore(db, filePath, runTransaction); }
  catch (error) { coreOperationStoreError = error; }
  let knowledgeExtractionCommitStore = null, knowledgeExtractionCommitStoreError = null;
  try { knowledgeExtractionCommitStore = createSqliteKnowledgeExtractionCommitStore(db, filePath, runTransaction); }
  catch (error) { knowledgeExtractionCommitStoreError = error; }
  let knowledgeExtractionTaskStore = null, knowledgeExtractionTaskStoreError = null;
  try { knowledgeExtractionTaskStore = createSqliteKnowledgeExtractionTaskStore(db, filePath, runTransaction); }
  catch (error) { knowledgeExtractionTaskStoreError = error; }

  return {
    deletionFacts: deletionFactsReader(db),
    provenanceMigration,
    knowledgeExtractionTaskStore,
    knowledgeExtractionTaskStoreError,
    knowledgeExtractionCommitStore,
    knowledgeExtractionCommitStoreError,
    coreOperationStore,
    coreOperationStoreError,
    aiRepository,
    aiAccessStore,
    aiActionStore,
    aiConversationStore,
    aiRuntimeError,
    syncTransaction(operation, { local = false, origin = 'sync-resolution' } = {}) {
      if (inTransaction) throw new Error('同步事务不能嵌入本地业务事务。');
      db.exec('BEGIN IMMEDIATE');
      inTransaction = true;
      const beforeChanges = totalChanges();
      try {
        const result = operation(db, state);
        if (result?.then) throw new TypeError('同步落库事务不能包含网络请求。');
        let valid;
        let dataChanged;
        if (local) { valid = persist({ origin }); dataChanged = pendingDataChange; }
        else {
          valid = validatePersistedLocalState(createPersistedLocalDocument(state));
          assertNoKnowledgeArtifactProvenanceDowngrade(committed, valid);
          assertNoDeletedEntities(db, valid, committed);
          const changes = collectChanges(committed, valid);
          dataChanged = changes.length > 0;
          for (const change of changes) {
            if (change.value === null) db.prepare('DELETE FROM entities WHERE collection = ? AND id = ?').run(change.collection, change.entityId);
            else {
              const revision = db.prepare('SELECT revision FROM local_revisions WHERE collection = ? AND id = ?').get(change.collection, change.entityId)?.revision ?? 0;
              db.prepare('INSERT OR REPLACE INTO entities VALUES (?, ?, ?, ?)').run(change.collection, change.entityId, JSON.stringify(change.value), revision);
            }
          }
        }
        if (dataChanged) {
          const generation = JSON.parse(readMeta('sync:generation') ?? '0');
          db.prepare('INSERT OR REPLACE INTO metadata VALUES (?, ?)').run('sync:generation', JSON.stringify(generation + 1));
        }
        beforeCommit();
        db.exec('COMMIT');
        restore(valid);
        committed = cloneLocalState(valid);
        didCommit({ dataChanged, syncChanged: totalChanges() !== beforeChanges, baselineChanged: totalChanges() !== beforeChanges });
        return result;
      } catch (error) {
        if (db.isTransaction) db.exec('ROLLBACK');
        restore(committed);
        pendingLocalChange = false;
        throw error;
      } finally { inTransaction = false; }
    },
    metadataTransaction(operation) {
      if (inTransaction) throw new Error('同步元数据事务不能嵌入业务事务。');
      const beforeChanges = totalChanges();
      db.exec('BEGIN IMMEDIATE');
      inTransaction = true;
      try {
        const result = operation(db);
        if (result?.then) throw new TypeError('同步元数据事务不能包含异步操作。');
        beforeCommit();
        db.exec('COMMIT');
        didCommit({ syncChanged: totalChanges() !== beforeChanges });
        return result;
      } catch (error) {
        if (db.isTransaction) db.exec('ROLLBACK');
        throw error;
      } finally { inTransaction = false; }
    },
    getSyncCacheKey: () => inTransaction ? null : `${dataRevision}:${syncRevision}`,
    getEntityCacheKey: () => inTransaction ? null : `${dataRevision}:${baselineRevision}`,
    onLocalCommit(listener) { localCommitListeners.add(listener); return () => localCommitListeners.delete(listener); },
    readSync: operation => operation(db, state),
    state, flush, runTransaction, exportSnapshot, prepareImport,
    commitImport, importSnapshot: commitImport,
    getStatus() {
      const revision = totalChanges();
      if (statusCache?.revision === revision && !inTransaction) return statusCache.value;
      const value = {
      mode: 'desktop-local', deviceId, datasetId: readMeta('datasetId'),
      protocolVersion: SYNC_PROTOCOL_VERSION, cloudSync: readMeta('sync:serverUrl') ? 'configured' : 'not-configured',
      pendingOperations: db.prepare("SELECT COUNT(*) AS count FROM sync_outbox WHERE state != 'acknowledged'").get().count
      };
      if (!inTransaction) statusCache = { revision, value };
      return value;
    },
    readOutbox: () => db.prepare('SELECT * FROM sync_outbox ORDER BY sequence').all().map(row => ({
      operationId: row.operation_id, deviceId: row.device_id, protocolVersion: row.protocol_version,
      state: row.state, changes: JSON.parse(row.changes), dependencies: JSON.parse(row.dependencies)
    })),
    backupTo(destination) {
      if (fs.existsSync(destination)) throw new Error('备份目标已存在，禁止覆盖。');
      db.prepare('VACUUM INTO ?').run(destination);
      fs.chmodSync(destination, 0o600);
    },
    close: () => { localCommitListeners.clear(); db.close(); }
  };
}
