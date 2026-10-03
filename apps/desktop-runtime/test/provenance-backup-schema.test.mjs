import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { createRuntimeBackup, inspectRuntimeBackup } from '../src/backup.mjs';
import { syntheticProvenanceFixture } from '../../api/test/fixtures/knowledge-artifact-provenance.fixture.js';
import { temporaryDirectory, openWorkspace } from './helpers.mjs';

function fixture(t, mutate) {
  const root = temporaryDirectory(t), workspace = openWorkspace(root);
  t.after(() => workspace.store.close());
  workspace.store.importSnapshot({ schemaVersion: 7, data: syntheticProvenanceFixture({ recorded: true }).state });
  const directory = createRuntimeBackup(workspace.store, root), file = path.join(directory, 'local.sqlite');
  const db = new DatabaseSync(file); try { mutate(db); } finally { db.close(); }
  const bytes = fs.readFileSync(file), manifestFile = path.join(directory, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  Object.assign(manifest.files.find(entry => entry.path === 'local.sqlite'), { size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  fs.writeFileSync(manifestFile, JSON.stringify(manifest));
  return { directory, file, bytes };
}

test('05B只读备份检查接受缺核心schema标记及schema6旧AI候选，源SQLite不迁移不回写', t => {
  for (const marker of [null, '6']) {
    const f = fixture(t, db => {
      db.prepare("DELETE FROM entities WHERE collection = 'knowledgeArtifactProvenance'").run();
      if (marker === null) db.prepare("DELETE FROM metadata WHERE key = 'localDataSchemaVersion'").run();
      else db.prepare("UPDATE metadata SET value = ? WHERE key = 'localDataSchemaVersion'").run(marker);
    });
    assert.equal(inspectRuntimeBackup(f.directory).valid, true); assert.deepEqual(fs.readFileSync(f.file), f.bytes);
    const db = new DatabaseSync(f.file, { readOnly: true });
    try { assert.equal(db.prepare("SELECT count(*) AS count FROM entities WHERE collection = 'knowledgeArtifactProvenance'").get().count, 0); }
    finally { db.close(); }
  }
});

test('05B schema7备份缺摘要或摘要损坏拒绝，未知/坏核心版本不能伪装旧数据', t => {
  for (const mutation of ['missing', 'hash', 'unknown', 'malformed']) {
    const f = fixture(t, db => {
      if (mutation === 'missing') db.prepare("DELETE FROM entities WHERE collection = 'knowledgeArtifactProvenance'").run();
      if (mutation === 'hash') {
        const row = db.prepare("SELECT id,payload FROM entities WHERE collection = 'knowledgeArtifactProvenance'").get();
        const value = JSON.parse(row.payload); value.provenanceHash = '0'.repeat(64);
        db.prepare("UPDATE entities SET payload = ? WHERE collection = 'knowledgeArtifactProvenance' AND id = ?").run(JSON.stringify(value), row.id);
      }
      if (['unknown', 'malformed'].includes(mutation)) db.prepare("UPDATE metadata SET value = ? WHERE key = 'localDataSchemaVersion'").run(mutation === 'unknown' ? '99' : '7oops');
    });
    assert.throws(() => inspectRuntimeBackup(f.directory)); assert.deepEqual(fs.readFileSync(f.file), f.bytes);
  }
});
