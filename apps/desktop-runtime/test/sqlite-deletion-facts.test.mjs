import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { createSqliteDataStore } from '../src/sqlite-data-store.mjs';
import { temporaryDirectory } from './helpers.mjs';
import { syntheticProvenanceFixture } from '../../api/test/fixtures/knowledge-artifact-provenance.fixture.js';

function fixture(t, options) {
  const file = path.join(temporaryDirectory(t), 'local.sqlite');
  const store = createSqliteDataStore(file, options);
  t.after(() => store.close());
  const f = syntheticProvenanceFixture({ alias: true });
  store.importSnapshot({ schemaVersion: 7, data: { ...f.state, knowledgeArtifactProvenance: [f.provenance] } });
  return { file, store, f, saved: store.exportSnapshot() };
}
function purge(store) {
  store.runTransaction(() => {
    store.state.knowledgeItems.length = 0;
    store.state.knowledgeEvidence.length = 0;
    store.state.knowledgeArtifactProvenance.length = 0;
  });
}
const rows = store => store.readSync(db => ({
  entities: db.prepare('SELECT * FROM entities ORDER BY collection,id').all(),
  outbox: db.prepare('SELECT * FROM sync_outbox ORDER BY sequence').all(),
  revisions: db.prepare('SELECT * FROM local_revisions ORDER BY collection,id').all(),
  facts: db.prepare('SELECT * FROM deletion_facts ORDER BY collection,entity_id').all(),
  epoch: db.prepare("SELECT value FROM metadata WHERE key='aiRuntimeEpoch'").get()
}));

test('C1 旧业务快照不能复活已永久移除的知识、证据和来源摘要', t => {
  const { store, saved } = fixture(t);
  purge(store);
  const before = store.exportSnapshot().data;
  assert.throws(() => store.importSnapshot(saved), { code: 'LOCAL_DELETION_FACT_CONFLICT' });
  assert.deepEqual(store.exportSnapshot().data, before);
});

test('C1 普通领域提交不能重建同 ID，已存在对象的编辑不受影响', t => {
  const { store, saved } = fixture(t);
  purge(store);
  assert.throws(() => store.runTransaction(() => {
    for (const key of ['knowledgeItems', 'knowledgeEvidence', 'knowledgeArtifactProvenance']) store.state[key].push(...structuredClone(saved.data[key]));
  }), { code: 'LOCAL_DELETION_FACT_CONFLICT' });
  store.runTransaction(() => { store.state.notes[0].title = '仍可编辑存活笔记'; });
  assert.equal(store.state.notes[0].title, '仍可编辑存活笔记');
});

test('C1 净永久删除同事务保存最小事实，重复观察不覆写，普通编辑与软回收不产生事实', t => {
  const { store, f } = fixture(t);
  store.runTransaction(() => { store.state.knowledgeItems[0].deletedAt = '2026-09-01T00:00:00.000Z'; });
  assert.deepEqual(store.deletionFacts.list(), []);
  purge(store);
  const facts = store.deletionFacts.list();
  assert.equal(facts.length, 3);
  assert.deepEqual(facts.map(x => x.collection).sort(), ['knowledgeArtifactProvenance', 'knowledgeEvidence', 'knowledgeItems']);
  for (const fact of facts) {
    assert.equal(fact.source.kind, 'local-commit');
    assert.equal(fact.source.datasetId, store.getStatus().datasetId);
    assert.equal(fact.source.operationId, store.readOutbox().at(-1).operationId);
    assert.equal(fact.deletedAt, fact.observedAt);
  }
  const encoded = JSON.stringify(facts);
  for (const privateText of [f.provenance.sources[0].quoteText, f.state.notes[0].rawMarkdown, f.state.knowledgeItems[0].title]) assert(!encoded.includes(privateText));
  store.runTransaction(() => {});
  assert.deepEqual(store.deletionFacts.list(), facts);
});

test('C1 事实插入失败与最终提交失败均回滚实体、来源、队列和事实', t => {
  let failCommit = false;
  const { store } = fixture(t, { beforeCommit() { if (failCommit) throw new Error('C1-commit-failure'); } });
  const before = rows(store), memory = store.exportSnapshot().data;
  store.readSync(db => db.exec("CREATE TRIGGER c1_fail_fact BEFORE INSERT ON deletion_facts BEGIN SELECT RAISE(ABORT,'C1-fact-failure'); END;"));
  assert.throws(() => purge(store), /C1-fact-failure/);
  assert.deepEqual(rows(store), before); assert.deepEqual(store.exportSnapshot().data, memory);
  store.readSync(db => db.exec('DROP TRIGGER c1_fail_fact'));
  failCommit = true;
  assert.throws(() => purge(store), /C1-commit-failure/);
  assert.deepEqual(rows(store), before); assert.deepEqual(store.exportSnapshot().data, memory);
  failCommit = false;
  purge(store);
  assert.equal(store.deletionFacts.list().length, 3);
});

test('C1 import 规范化后早检，已准备快照在事实变化后提交仍拒绝且不换 AI epoch', t => {
  const { store, saved } = fixture(t);
  const prepared = store.prepareImport(saved);
  purge(store);
  const before = rows(store);
  assert.throws(() => store.prepareImport(saved), { code: 'LOCAL_DELETION_FACT_CONFLICT' });
  assert.throws(() => store.commitImport(prepared), { code: 'LOCAL_DELETION_FACT_CONFLICT' });
  assert.deepEqual(rows(store), before);
  const legacy = structuredClone(saved); legacy.schemaVersion = 6; delete legacy.data.knowledgeArtifactProvenance;
  assert.throws(() => store.prepareImport(legacy), { code: 'LOCAL_DELETION_FACT_CONFLICT' });
});

test('C1 快照省略存活实体的净删除也记录，账本不属于业务导出载荷', t => {
  const { store, saved } = fixture(t);
  const snapshot = structuredClone(saved);
  for (const key of ['knowledgeItems', 'knowledgeEvidence', 'knowledgeArtifactProvenance']) snapshot.data[key] = [];
  store.importSnapshot(snapshot);
  assert.equal(store.deletionFacts.list().length, 3);
  assert(!JSON.stringify(store.exportSnapshot()).includes('deletionFacts'));
  assert.throws(() => store.importSnapshot(saved), { code: 'LOCAL_DELETION_FACT_CONFLICT' });
});

test('C1 账本重开保留最初记录与覆盖标记，dataset/epoch 变化不能清空', t => {
  const root = temporaryDirectory(t), file = path.join(root, 'local.sqlite');
  let store = createSqliteDataStore(file);
  const f = syntheticProvenanceFixture();
  store.importSnapshot({ schemaVersion: 7, data: { ...f.state, knowledgeArtifactProvenance: [f.provenance] } });
  purge(store);
  const facts = store.deletionFacts.list(), coverage = store.deletionFacts.getCoverage();
  store.metadataTransaction(db => {
    db.prepare("UPDATE metadata SET value='different-dataset' WHERE key='datasetId'").run();
    db.prepare("INSERT OR REPLACE INTO metadata VALUES ('sync:epoch','\"new-epoch\"')").run();
    db.exec('DELETE FROM sync_base');
  });
  store.close();
  store = createSqliteDataStore(file); t.after(() => store.close());
  assert.deepEqual(store.deletionFacts.list(), facts);
  assert.deepEqual(store.deletionFacts.getCoverage(), coverage);
});

test('C1 旧库只在可信绑定下补录正修订事实，null缺席与旧outbox不补猜', t => {
  for (const bound of [false, true]) {
    const file = path.join(temporaryDirectory(t), 'local.sqlite');
    const old = createSqliteDataStore(file), f = syntheticProvenanceFixture({ recorded: true });
    old.importSnapshot({ schemaVersion: 7, data: f.state }); purge(old); old.close();
    const db = new DatabaseSync(file);
    db.exec("DROP TABLE deletion_facts; DELETE FROM metadata WHERE key LIKE 'deletionFacts%';");
    db.prepare('INSERT INTO sync_base VALUES (?,?,?,?)').run('notes', 'known-deleted', 2, 'null');
    db.prepare('INSERT INTO sync_base VALUES (?,?,?,?)').run('notes', 'missing-only', null, 'null');
    db.prepare('INSERT INTO sync_conflicts VALUES (?,?)').run('legacy-conflict', JSON.stringify({ noteId: 'legacy-conflict', remote: null, remoteRevision: 3, datasetEpoch: 'known-old-epoch' }));
    db.prepare('INSERT INTO metadata VALUES (?,?)').run('sync:entityConflict', JSON.stringify({ epoch: 'known-batch-epoch', remote: [{ collection: 'notes', id: 'batch-conflict', value: null, revision: 4 }] }));
    if (bound) for (const [key, value] of Object.entries({ serverUrl: 'https://synthetic.example', ownerId: 'remote-owner', epoch: 'current-but-not-row-epoch' })) {
      db.prepare('INSERT OR REPLACE INTO metadata VALUES (?,?)').run(`sync:${key}`, JSON.stringify(value));
    }
    db.close();
    const store = createSqliteDataStore(file);
    try {
      assert.equal(store.deletionFacts.list().length, bound ? 3 : 0);
      assert.equal(store.deletionFacts.has('notes', 'missing-only'), false);
      assert.equal(store.deletionFacts.has('knowledgeItems', f.artifactId), false, '旧无来源标记 outbox / local_revisions 不补猜');
      assert.equal(store.deletionFacts.getCoverage().legacyHistory, 'incomplete');
      if (bound) {
        const record = store.deletionFacts.list().find(row => row.entityId === 'known-deleted');
        assert.equal(record.source.epoch, null); assert.equal(record.deletedAt, null); assert.equal(record.source.ownerId, 'remote-owner');
        assert.equal(store.deletionFacts.list().find(row => row.entityId === 'legacy-conflict').source.epoch, 'known-old-epoch');
        assert.equal(store.deletionFacts.list().find(row => row.entityId === 'batch-conflict').source.epoch, 'known-batch-epoch');
      }
    } finally { store.close(); }
    const backups = fs.readdirSync(path.dirname(file)).filter(name => name.includes('.before-deletion-facts-v1-'));
    assert.equal(backups.length, 1);
    const backup = new DatabaseSync(path.join(path.dirname(file), backups[0]), { readOnly: true });
    try {
      assert.equal(backup.prepare("SELECT name FROM sqlite_master WHERE name='deletion_facts'").get(), undefined);
      assert.equal(backup.prepare('SELECT count(*) AS n FROM sync_base').get().n, 2);
      assert(backup.prepare('SELECT count(*) AS n FROM sync_outbox').get().n > 0);
    } finally { backup.close(); }
    if (process.platform !== 'win32') assert.equal(fs.statSync(path.join(path.dirname(file), backups[0])).mode & 0o777, 0o600);
  }
});

test('C1 必需账本初始化失败整体回滚，保护副本仍可读且不降级为可选 AI 故障', t => {
  const root = temporaryDirectory(t), file = path.join(root, 'local.sqlite');
  createSqliteDataStore(file).close();
  const db = new DatabaseSync(file);
  db.exec(`DROP TABLE deletion_facts; DELETE FROM metadata WHERE key LIKE 'deletionFacts%';
    CREATE TRIGGER c1_fail_metadata BEFORE INSERT ON metadata WHEN NEW.key='deletionFactsCoverage'
    BEGIN SELECT RAISE(ABORT,'C1-migration-failure'); END;`);
  const before = db.prepare('SELECT * FROM metadata ORDER BY key').all(); db.close();
  assert.throws(() => createSqliteDataStore(file), /C1-migration-failure/);
  const check = new DatabaseSync(file);
  try {
    assert.equal(check.prepare("SELECT name FROM sqlite_master WHERE name='deletion_facts'").get(), undefined);
    assert.deepEqual(check.prepare('SELECT * FROM metadata ORDER BY key').all(), before);
    check.exec('DROP TRIGGER c1_fail_metadata');
  } finally { check.close(); }
  assert.equal(fs.readdirSync(root).filter(name => name.includes('.before-deletion-facts-v1-')).length, 1);
  const reopened = createSqliteDataStore(file); t.after(() => reopened.close());
  assert.deepEqual(reopened.deletionFacts.list(), []);
  assert.equal(reopened.deletionFacts.getCoverage().legacyHistory, 'incomplete');
});

test('C1 启动 schema6 摘要生成必须晚于账本，已删除摘要不能由旧 receipt 或 placeholder 重建', t => {
  const file = path.join(temporaryDirectory(t), 'local.sqlite');
  const store = createSqliteDataStore(file);
  const f = syntheticProvenanceFixture({ alias: true });
  store.importSnapshot({ schemaVersion: 7, data: { ...f.state, knowledgeArtifactProvenance: [f.provenance] } });
  purge(store); store.close();
  const db = new DatabaseSync(file);
  // 模拟保留旧主体、核心 receipt 但来源记录已由独立已知事实保护的 legacy 候选。
  for (const [collection, records] of Object.entries(f.state)) for (const record of records) db.prepare('INSERT OR REPLACE INTO entities VALUES (?,?,?,0)').run(collection, record.id, JSON.stringify(record));
  db.prepare('INSERT INTO knowledge_extraction_commits VALUES (?,?,?,?)').run(f.receipt.ownerId, f.receipt.datasetId, f.receipt.jobId, JSON.stringify(f.receipt));
  db.prepare("DELETE FROM metadata WHERE key='localDataSchemaVersion'").run();
  const before = { entities: db.prepare('SELECT * FROM entities ORDER BY collection,id').all(), outbox: db.prepare('SELECT * FROM sync_outbox').all(), facts: db.prepare('SELECT * FROM deletion_facts').all() };
  db.close();
  assert.throws(() => createSqliteDataStore(file), { code: 'LOCAL_DELETION_FACT_CONFLICT' });
  const check = new DatabaseSync(file, { readOnly: true });
  try {
    assert.deepEqual({ entities: check.prepare('SELECT * FROM entities ORDER BY collection,id').all(), outbox: check.prepare('SELECT * FROM sync_outbox').all(), facts: check.prepare('SELECT * FROM deletion_facts').all() }, before);
    assert.equal(check.prepare("SELECT value FROM metadata WHERE key='localDataSchemaVersion'").get(), undefined);
  } finally { check.close(); }
});
