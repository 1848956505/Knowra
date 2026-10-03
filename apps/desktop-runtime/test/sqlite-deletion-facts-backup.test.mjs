import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createSqliteDataStore } from '../src/sqlite-data-store.mjs';
import { createRuntimeBackup, inspectRuntimeBackup } from '../src/backup.mjs';
import { prepareRestoredDirectory } from '../src/restore-directory.mjs';
import { temporaryDirectory, removeAiTablesForLegacyFixture } from './helpers.mjs';
import { copyBackup, treeHashes } from './fixtures/extraction-backup.fixture.mjs';
import { factHash } from '../src/sqlite-deletion-facts-contract.mjs';
import { syntheticProvenanceFixture } from '../../api/test/fixtures/knowledge-artifact-provenance.fixture.js';

function fixture(t) {
  const root = temporaryDirectory(t), dataRoot = path.join(root, 'active');
  const store = createSqliteDataStore(path.join(dataRoot, 'local.sqlite'));
  t.after(() => store.close());
  const f = syntheticProvenanceFixture();
  store.importSnapshot({ schemaVersion: 7, data: { ...f.state, knowledgeArtifactProvenance: [f.provenance] } });
  store.runTransaction(() => { store.state.knowledgeItems.length = 0; store.state.knowledgeEvidence.length = 0; store.state.knowledgeArtifactProvenance.length = 0; });
  return { root, dataRoot, store, backup: createRuntimeBackup(store, dataRoot) };
}
function rewrite(db, mutate) {
  const row = db.prepare('SELECT * FROM deletion_facts ORDER BY collection LIMIT 1').get();
  const record = JSON.parse(row.record_json); mutate(record);
  db.prepare('UPDATE deletion_facts SET record_json=?,record_hash=? WHERE collection=? AND entity_id=?')
    .run(JSON.stringify(record), factHash(record), row.collection, row.entity_id);
}
function reshape(db, definition) {
  db.exec(`ALTER TABLE deletion_facts RENAME TO old_facts; CREATE TABLE deletion_facts (${definition});
    INSERT INTO deletion_facts SELECT * FROM old_facts; DROP TABLE old_facts`);
}

test('C1 新账本与旧无扩展备份均可只读 inspect，源树字节不变', t => {
  const f = fixture(t);
  const legacy = copyBackup(f, 'legacy', db => db.exec("DROP TABLE deletion_facts; DELETE FROM metadata WHERE key LIKE 'deletionFacts%';"));
  const legacyV3 = copyBackup(f, 'legacy-v3', db => {
    removeAiTablesForLegacyFixture(db);
    db.exec("DROP TABLE deletion_facts; DELETE FROM metadata WHERE key LIKE 'deletionFacts%'; PRAGMA user_version=3");
  });
  for (const directory of [f.backup, legacy, legacyV3]) {
    const before = treeHashes(directory);
    assert.equal(inspectRuntimeBackup(directory).valid, true);
    assert.equal(inspectRuntimeBackup(directory).valid, true);
    assert.deepEqual(treeHashes(directory), before);
  }
  const sourceBefore = treeHashes(legacyV3), restoredDirectory = prepareRestoredDirectory(f.root, legacyV3);
  const restored = createSqliteDataStore(path.join(restoredDirectory, 'local.sqlite'));
  try { assert.equal(restored.deletionFacts.getCoverage().legacyHistory, 'incomplete'); }
  finally { restored.close(); }
  assert.deepEqual(treeHashes(legacyV3), sourceBefore);
});

test('C1 重签 manifest 的坏/未知核心账本拒绝 inspect 和激活准备，原活动库/指针/备份不变', async t => {
  const f = fixture(t);
  const pointer = path.join(f.root, 'active-dataset.json'); fs.writeFileSync(pointer, 'synthetic-pointer');
  const activeBefore = f.store.exportSnapshot(), queueBefore = f.store.readOutbox(), factsBefore = f.store.deletionFacts.list();
  const cases = {
    version: db => db.exec("UPDATE metadata SET value='2' WHERE key='deletionFactsVersion'"),
    missingTable: db => db.exec('DROP TABLE deletion_facts'),
    missingMetadata: db => db.exec("DELETE FROM metadata WHERE key='deletionFactsScope'"),
    badScope: db => db.exec("UPDATE metadata SET value='null' WHERE key='deletionFactsScope'"),
    unknownCoverage: db => db.exec("UPDATE metadata SET value='{}' WHERE key='deletionFactsCoverage'"),
    shape: db => db.exec('ALTER TABLE deletion_facts ADD COLUMN unexpected TEXT'),
    index: db => db.exec('CREATE INDEX wrong_fact_index ON deletion_facts(record_hash)'),
    checkConstraint: db => reshape(db, 'collection TEXT NOT NULL, entity_id TEXT NOT NULL CHECK(length(entity_id)>3), record_hash TEXT NOT NULL, record_json TEXT NOT NULL, PRIMARY KEY(collection,entity_id)'),
    collation: db => reshape(db, 'collection TEXT NOT NULL, entity_id TEXT NOT NULL COLLATE NOCASE, record_hash TEXT NOT NULL, record_json TEXT NOT NULL, PRIMARY KEY(collection,entity_id)'),
    malformedJson: db => db.exec("UPDATE deletion_facts SET record_json='null'"),
    hash: db => db.exec("UPDATE deletion_facts SET record_hash='bad'"),
    sqlIdentity: db => db.exec("UPDATE deletion_facts SET entity_id=entity_id || '-bad'"),
    privateField: db => rewrite(db, record => { record.quoteText = 'private-sentinel'; }),
    wrongScope: db => rewrite(db, record => { record.scopeId = 'wrong-scope'; }),
    observation: db => rewrite(db, record => { record.observationId = '0'.repeat(64); })
  };
  for (const [name, mutate] of Object.entries(cases)) await t.test(name, () => {
    const directory = copyBackup(f, `bad-${name}`, mutate), before = treeHashes(directory);
    assert.throws(() => inspectRuntimeBackup(directory), { code: 'LOCAL_DELETION_FACT_INVALID' });
    assert.throws(() => prepareRestoredDirectory(f.root, directory), { code: 'LOCAL_DELETION_FACT_INVALID' });
    assert.deepEqual(treeHashes(directory), before);
    assert.deepEqual(f.store.exportSnapshot().data, activeBefore.data);
    assert.deepEqual(f.store.readOutbox(), queueBefore); assert.deepEqual(f.store.deletionFacts.list(), factsBefore);
    assert.equal(fs.readFileSync(pointer, 'utf8'), 'synthetic-pointer');
  });
});

test('C1 打开坏账本在 AI 可选升级之前失败，原数据库文件不写入', t => {
  const f = fixture(t);
  const directory = copyBackup(f, 'bad-open', db => {
    db.exec("UPDATE metadata SET value='99' WHERE key='deletionFactsVersion'; PRAGMA user_version=6;");
  });
  const file = path.join(directory, 'local.sqlite'), before = fs.readFileSync(file);
  assert.throws(() => createSqliteDataStore(file), { code: 'LOCAL_DELETION_FACT_INVALID' });
  assert.deepEqual(fs.readFileSync(file), before);
  assert(!fs.readdirSync(directory).some(name => name.includes('.before-')));
});
