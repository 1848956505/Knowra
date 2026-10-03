import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { createSqliteDataStore } from '../src/sqlite-data-store.mjs';
import { readKnowledgeLifecycleBoundaries } from '../src/knowledge-lifecycle-boundaries.mjs';
import { nextEntityUpload } from '../src/entity-sync-state.mjs';
import { readMeta, writeMeta } from '../src/sync-state.mjs';
import { temporaryDirectory, openWorkspace } from './helpers.mjs';

function fixture(t, options) {
  const root = temporaryDirectory(t);
  const workspace = openWorkspace(path.join(root, 'active'), options);
  t.after(() => workspace.store.close());
  const { item } = workspace.knowledge.knowledgeItemService.createCandidate({ title: '边界事务', canonicalStatement: '合成正文', sourceMode: 'manual' });
  return { root, item, ...workspace };
}

test('本地删除事务失败回滚实体、outbox及生命周期描述符', t => {
  let fail = false;
  const f = fixture(t, { beforeCommit() { if (fail) throw new Error('合成提交失败'); } });
  const before = f.store.exportSnapshot().data, outbox = f.store.readOutbox();
  fail = true;
  assert.throws(() => f.knowledge.knowledgeItemService.trash(f.item.id), /合成提交失败/);
  assert.deepEqual(f.store.exportSnapshot().data, before);
  assert.deepEqual(f.store.readOutbox(), outbox);
  assert.equal(f.store.readSync(db => readKnowledgeLifecycleBoundaries(db).length), 0);
});

test('远端与冲突落库不生成用户生命周期边界；未登记旧outbox不被猜测回放', t => {
  const f = fixture(t);
  f.store.runTransaction(() => { f.store.state.knowledgeItems[0].deletedAt = new Date().toISOString(); }, { origin: 'sync-resolution' });
  assert.equal(f.store.readSync(db => readKnowledgeLifecycleBoundaries(db).length), 0);
  f.knowledge.knowledgeItemService.restoreDeleted(f.item.id);
  assert.equal(f.store.readSync(db => readKnowledgeLifecycleBoundaries(db).length), 1);
  // 旧版缺少用户 origin 证据，不能据 pending before/value 再构造新动作。
  f.store.metadataTransaction(db => db.prepare("DELETE FROM metadata WHERE key='sync:knowledgeLifecycleQueue'").run());
  assert.equal(f.store.readSync(db => readKnowledgeLifecycleBoundaries(db).length), 0);
  assert(f.store.readOutbox().some(row => row.changes.some(change => change.collection === 'knowledgeItems' && change.before?.deletedAt && !change.value?.deletedAt)));
});

test('SQLite备份保留待发送边界、原outbox和私有冻结绑定，wire没有私有标识', t => {
  const f = fixture(t);
  f.knowledge.knowledgeItemService.trash(f.item.id);
  f.knowledge.knowledgeItemService.restoreDeleted(f.item.id);
  const operation = nextEntityUpload(f.store);
  const boundaries = f.store.readSync(db => readKnowledgeLifecycleBoundaries(db));
  const binding = f.store.readSync(db => readMeta(db, 'knowledgeLifecycleUpload'));
  assert.equal(boundaries.length, 2);
  assert.equal(binding.operationId, operation.operationId);
  assert.equal(binding.boundaries.length, 1);
  assert(!JSON.stringify(operation).includes('knowledgeLifecycle'));
  const backup = path.join(f.root, 'backup.sqlite'); f.store.backupTo(backup);
  const restored = createSqliteDataStore(backup); t.after(() => restored.close());
  assert.deepEqual(restored.readSync(db => readKnowledgeLifecycleBoundaries(db)), boundaries);
  assert.deepEqual(restored.readSync(db => readMeta(db, 'knowledgeLifecycleUpload')), binding);
  assert.deepEqual(nextEntityUpload(restored), operation);
});

for (const mutation of ['malformed', 'json-null', 'missing-outbox', 'acknowledged-outbox', 'malformed-binding']) {
  test(`生命周期${mutation}停止同步和重启，保留原实体与元数据`, t => {
    const f = fixture(t);
    f.knowledge.knowledgeItemService.trash(f.item.id);
    if (mutation === 'json-null') f.knowledge.knowledgeItemService.restoreDeleted(f.item.id);
    const boundary = f.store.readSync(db => readKnowledgeLifecycleBoundaries(db)[0]);
    f.store.metadataTransaction(db => {
      if (mutation === 'malformed') writeMeta(db, 'knowledgeLifecycleQueue', { invalid: true });
      if (mutation === 'json-null') writeMeta(db, 'knowledgeLifecycleQueue', null);
      if (mutation === 'missing-outbox') db.prepare('DELETE FROM sync_outbox WHERE operation_id=?').run(boundary.operationId);
      if (mutation === 'acknowledged-outbox') db.prepare("UPDATE sync_outbox SET state='acknowledged' WHERE operation_id=?").run(boundary.operationId);
      if (mutation === 'malformed-binding') writeMeta(db, 'knowledgeLifecycleUpload', { operationId: 'invalid', boundaries: [{ ...boundary, sequence: 999 }] });
    });
    const outbox = f.store.readOutbox();
    const metadata = f.store.readSync(db => db.prepare('SELECT * FROM metadata ORDER BY key').all());
    assert.throws(() => f.store.readSync(db => readKnowledgeLifecycleBoundaries(db)), { code: 'LOCAL_KNOWLEDGE_LIFECYCLE_INVALID' });
    assert.equal(Boolean(f.store.state.knowledgeItems.find(row => row.id === f.item.id).deletedAt), mutation !== 'json-null');
    assert.throws(() => createSqliteDataStore(path.join(f.root, 'active', 'local.sqlite')), { code: 'LOCAL_KNOWLEDGE_LIFECYCLE_INVALID' });
    assert.deepEqual(f.store.readOutbox(), outbox);
    assert.deepEqual(f.store.readSync(db => db.prepare('SELECT * FROM metadata ORDER BY key').all()), metadata);
  });
}
