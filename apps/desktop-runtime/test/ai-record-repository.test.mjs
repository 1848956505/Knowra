import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { aiRecords, insertAiRecords } from '../../api/test/ai-record-fixtures.js';
import { createSqliteDataStore } from '../src/sqlite-data-store.mjs';
import { createRuntimeBackup, inspectRuntimeBackup } from '../src/backup.mjs';
import { prepareRestoredDirectory } from '../src/restore-directory.mjs';
import { removeAiTablesForLegacyFixture, temporaryDirectory } from './helpers.mjs';

test('SQLite AI v4 私有表持久化任务、授权、尝试、事件和未知用量，不进入业务同步', t => {
  const root = temporaryDirectory(t);
  const file = path.join(root, 'local.sqlite');
  let store = createSqliteDataStore(file);
  const beforeOutbox = store.readOutbox();
  const records = aiRecords(store.aiRepository.identity());
  insertAiRecords(store.aiRepository, records);
  assert.deepEqual(store.readOutbox(), beforeOutbox);
  assert.equal(JSON.stringify(store.exportSnapshot()).includes(records.job.jobId), false);
  const epoch = store.aiRepository.identity().datasetEpoch;
  store.close();
  store = createSqliteDataStore(file);
  assert.equal(store.aiRepository.identity().datasetEpoch, epoch);
  assert.equal(store.aiRepository.get('aiGrant', records.grant.grantId).scopeHash, records.scope.scopeHash);
  assert.equal(store.aiRepository.get('aiUsageRecord', records.usage.usageId).usageUnknown, true);
  assert.deepEqual(store.aiRepository.listEvents(records.job.jobId), [records.event]);
  const backup = createRuntimeBackup(store, root);
  assert.equal(inspectRuntimeBackup(backup).valid, true);
  store.close();
});

test('v3→v4 先备份再迁移，旧资料和同步队列保留；恢复后旧 AI 租约失效', t => {
  const root = temporaryDirectory(t);
  const source = path.join(root, 'source');
  fs.mkdirSync(source);
  const file = path.join(source, 'local.sqlite');
  let store = createSqliteDataStore(file);
  store.close();
  const raw = new DatabaseSync(file);
  removeAiTablesForLegacyFixture(raw);
  raw.exec('PRAGMA user_version = 3');
  raw.close();
  store = createSqliteDataStore(file);
  assert(fs.readdirSync(source).some(name => name.startsWith('local.sqlite.before-v4-')));
  const records = aiRecords(store.aiRepository.identity());
  insertAiRecords(store.aiRepository, records);
  const backup = createRuntimeBackup(store, source, { backupRoot: root });
  const oldEpoch = store.aiRepository.identity().datasetEpoch;
  store.close();
  const restored = prepareRestoredDirectory(root, backup);
  const replacement = createSqliteDataStore(path.join(restored, 'local.sqlite'));
  assert.notEqual(replacement.aiRepository.identity().datasetEpoch, oldEpoch);
  assert.equal(replacement.aiRepository.get('aiJob', records.job.jobId).status, 'pending');
  assert.throws(() => replacement.aiRepository.insert('aiJobAttempt', { ...records.attempt, attemptId: 'late-attempt', ordinal: 2, leaseGeneration: 2 }), { code: 'AI_REFERENCE_INVALID' });
  replacement.close();
});

test('SQLite AI 唯一性、外键和故障事务保持原有记录', t => {
  const root = temporaryDirectory(t);
  const store = createSqliteDataStore(path.join(root, 'local.sqlite'));
  const records = aiRecords(store.aiRepository.identity());
  store.aiRepository.insert('scopeSnapshot', records.scope);
  assert.throws(() => store.aiRepository.insert('contextManifest', { ...records.manifest, scopeSnapshotId: 'missing' }), { code: 'AI_REFERENCE_INVALID' });
  assert.equal(store.aiRepository.list('contextManifest').length, 0);
  store.aiRepository.insert('contextManifest', records.manifest);
  store.aiRepository.insert('aiGrant', records.grant);
  store.aiRepository.insert('aiJob', records.job);
  assert.equal(store.aiRepository.insert('aiJob', { ...records.job, jobId: 'duplicate', requestId: 'duplicate' }).jobId, records.job.jobId);
  assert.throws(() => store.aiRepository.appendEvent({ ...records.event, sequence: 2 }), { code: 'AI_EVENT_SEQUENCE_INVALID' });
  assert.equal(store.aiRepository.listEvents(records.job.jobId).length, 0);
  store.close();
});

test('桌面备份检查拒绝 AI 私有表中的断裂授权引用', t => {
  const root = temporaryDirectory(t);
  const file = path.join(root, 'local.sqlite');
  let store = createSqliteDataStore(file);
  const records = aiRecords(store.aiRepository.identity());
  insertAiRecords(store.aiRepository, records);
  store.close();
  const raw = new DatabaseSync(file);
  raw.exec('PRAGMA foreign_keys = OFF');
  raw.prepare('UPDATE ai_jobs SET grant_id = ? WHERE job_id = ?').run('missing-grant', records.job.jobId);
  raw.close();
  store = createSqliteDataStore(file);
  const backup = createRuntimeBackup(store, root);
  assert.throws(() => inspectRuntimeBackup(backup), /AI 私有记录引用不完整/);
  store.close();
});

test('SQLite 同一事务内 AI 授权与业务对象一起提交或回滚', t => {
  const root = temporaryDirectory(t);
  let fail = true;
  const file = path.join(root, 'local.sqlite');
  const store = createSqliteDataStore(file, { beforeCommit: () => { if (fail) throw new Error('模拟提交故障'); } });
  const records = aiRecords(store.aiRepository.identity());
  const writeTogether = () => store.runTransaction(() => {
    store.state.spaces.push({ id: 'space-1', userId: 'demo', name: '测试空间' });
    store.flush();
    store.aiRepository.insert('scopeSnapshot', records.scope);
  });
  assert.throws(writeTogether, /模拟提交故障/);
  assert.equal(store.state.spaces.length, 0);
  assert.equal(store.aiRepository.get('scopeSnapshot', records.scope.scopeSnapshotId), null);
  fail = false;
  writeTogether();
  assert.equal(store.state.spaces[0].id, 'space-1');
  assert.equal(store.aiRepository.get('scopeSnapshot', records.scope.scopeSnapshotId).scopeHash, records.scope.scopeHash);
  store.close();
  const reopened = createSqliteDataStore(file);
  assert.equal(reopened.state.spaces[0].id, 'space-1');
  assert.equal(reopened.aiRepository.get('scopeSnapshot', records.scope.scopeSnapshotId).scopeHash, records.scope.scopeHash);
  reopened.close();
});
