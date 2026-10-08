import assert from 'node:assert/strict';
import path from 'node:path';
import { once } from 'node:events';
import { test } from 'node:test';
import { createFileDataStore } from '../../api/src/infrastructure/file-data-store.js';
import { createAppContext } from '../../api/src/app.factory.js';
import { createServer } from '../../api/src/server.js';
import { createAttachmentTransfer } from '../../api/src/modules/sync/attachment-transfer.js';
import { NoteVersion } from '../../api/src/modules/knowledge/domain/note-version.js';
import { selectVersionsToPrune } from '../../api/src/modules/knowledge/domain/note-version-retention.js';
import { nextEntityUpload } from '../src/entity-sync-state.mjs';
import { createPostgresTestDatabase } from '../../../scripts/test-support/postgres-test-database.mjs';
import { createPostgresAppContext } from '../../api/src/postgres-app.factory.js';
import { createSyncEngine } from '../src/sync-engine.mjs';
import { temporaryDirectory, openWorkspace } from './helpers.mjs';

const DAY = 24 * 3600 * 1000;

async function fixture(t, postgres) {
  const root = temporaryDirectory(t);
  const cloud = postgres ? null : createFileDataStore(path.join(root, 'cloud.json'));
  const database = postgres ? await createPostgresTestDatabase() : null;
  let context, server;
  t.after(async () => {
    if (server?.listening) await new Promise(resolve => server.close(resolve));
    try { await context?.close?.(); } finally { await database?.close(); }
  });
  context = postgres
    ? await createPostgresAppContext({ databaseUrl: database.databaseUrl, storageRootDir: root, uploadsDir: path.join(root, 'uploads') })
    : createAppContext({ dataStore: cloud, storageRootDir: root });
  const space = await context.modules.knowledge.knowledgeSpaceService.createDefaultKnowledgeSpace({ userId: 'demo' });
  server = createServer({ appContext: context });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  function device(name, options) {
    const directory = path.join(root, name);
    let workspace = openWorkspace(directory, options);
    const transfer = createAttachmentTransfer({ uploadsDir: path.join(directory, 'uploads'), storageRootDir: directory });
    let engine = createSyncEngine(workspace.store, { entityTransfer: transfer, autoSync: false });
    t.after(async () => { await engine.close(); workspace.store.close(); });
    const result = { ...workspace, engine, connect: () => engine.configure({ serverUrl: origin }), restart: async () => {
      await engine.close(); workspace.store.close();
      workspace = openWorkspace(directory, options);
      engine = createSyncEngine(workspace.store, { entityTransfer: transfer, autoSync: false });
      Object.assign(result, workspace, { engine });
    } };
    return result;
  }
  return { space, device, versions: noteId => context.modules.knowledge.noteVersionService.listVersions({ noteId }) };
}

for (const postgres of [false, true]) test(`${postgres ? 'PostgreSQL' : '文件云端'}：清理、恢复私有引用正文、失败回滚及冻结上传重启后两设备收敛`, {
  skip: postgres && !process.env.KNOWRA_SYNC_TEST_DATABASE_URL, timeout: 60000
}, async t => {
  const f = await fixture(t, postgres);
  let failRestore = false;
  const a = f.device('a', { beforeCommit: () => { if (failRestore) throw new Error('restore rollback'); } }); const b = f.device('b');
  await a.connect();
  const note = a.knowledge.noteService.createNote({ title: '多年笔记', rawMarkdown: '正文 0', spaceId: f.space.id });
  const now = Date.now();
  const old = Array.from({ length: 30 }, (_, index) => new NoteVersion({
    id: `aged-version-${String(index).padStart(3, '0')}`, noteId: note.id, content: `历史 ${index}`, createdAt: new Date(now - 70 * DAY + index * 12 * 3600 * 1000).toISOString() }));
  const removable = selectVersionsToPrune({ versions: old.map(({ id, createdAt }) => ({ id, createdAt })), now });
  assert.ok(removable.length > 10);
  const cited = removable[0];
  a.store.runTransaction(() => { a.store.state.noteVersions.push(...old); });
  a.store.metadataTransaction(db => {
    db.exec('CREATE TABLE IF NOT EXISTS ai_citation_probe (payload TEXT)');
    db.prepare('INSERT INTO ai_citation_probe VALUES (?)').run(JSON.stringify({ noteVersionId: cited }));
  });
  await a.engine.sync();
  a.knowledge.noteService.updateNote(note.id, { rawMarkdown: '正文 1' });
  await a.engine.sync(); await a.engine.sync();
  assert.equal(a.engine.status().error, null, JSON.stringify(a.engine.status().error));
  const cloudVersions = await f.versions(note.id);
  assert.ok(cloudVersions.length < old.length / 2, `云端版本应被稀疏化，实际 ${cloudVersions.length}`);
  assert.ok(cloudVersions.some(item => item.content === '正文 1'), '当前正文版本保留');
  assert.ok(!cloudVersions.some(item => item.id === cited), '云端不知道设备私有引用，按策略清理');
  const local = a.store.state.noteVersions.filter(item => item.noteId === note.id).map(item => item.id).sort();
  assert.deepEqual(local, [...cloudVersions.map(item => item.id), cited].sort(), '设备释放已清理副本，仅保留被引用副本');
  assert.equal(a.engine.status().pendingEntities, 0, '保留的副本不会作为新建上传');
  const oldVersion = a.knowledge.noteVersionService.getVersion(cited, note.id);
  const before = a.store.exportSnapshot().data;
  failRestore = true;
  assert.throws(() => a.knowledge.noteService.updateNote(note.id, { rawMarkdown: oldVersion.content }), /restore rollback/);
  failRestore = false;
  assert.deepEqual(a.store.exportSnapshot().data, before, '失败恢复不留下新正文或新版本');
  a.knowledge.noteService.updateNote(note.id, { rawMarkdown: oldVersion.content });
  const restored = a.knowledge.repositories.noteVersionRepository.findByNoteIdAndContentHash(note.id, oldVersion.contentHash);
  assert.notEqual(restored.id, cited, '已清理 ID 不得复活');
  assert.deepEqual(a.knowledge.noteVersionService.getVersion(cited, note.id), oldVersion, '私有记录仍可读取原版本');
  const operation = nextEntityUpload(a.store);
  assert.ok(operation.changes.some(entry => entry.collection === 'noteVersions' && entry.id === restored.id));
  assert.ok(!operation.changes.some(entry => entry.collection === 'noteVersions' && entry.id === cited));
  await a.restart();
  assert.deepEqual(nextEntityUpload(a.store), operation, '重启保持冻结操作及新版本 ID');
  await a.engine.sync(); await a.engine.sync();
  assert.equal(a.engine.status().error, null, JSON.stringify(a.engine.status()));
  assert.equal(a.engine.status().pendingEntities, 0);
  assert.deepEqual(a.knowledge.noteVersionService.getVersion(cited, note.id), oldVersion);
  assert.equal(a.store.readSync(db => JSON.parse(db.prepare('SELECT payload FROM ai_citation_probe').get().payload).noteVersionId), cited);
  a.knowledge.noteService.updateNote(note.id, { title: '恢复后重存', rawMarkdown: oldVersion.content });
  assert.equal(a.knowledge.repositories.noteVersionRepository.findByNoteIdAndContentHash(note.id, oldVersion.contentHash).id, restored.id, '后续保存复用新版本');
  await a.engine.sync();
  const finalVersions = await f.versions(note.id);
  assert.ok(finalVersions.some(version => version.id === restored.id));
  assert.ok(!finalVersions.some(version => version.id === cited));
  await b.connect();
  assert.equal(b.engine.status().error, null);
  assert.deepEqual(b.store.state.noteVersions.filter(item => item.noteId === note.id).map(item => item.id).sort(), finalVersions.map(item => item.id).sort());
  assert.equal(b.knowledge.noteService.getNote(note.id).rawMarkdown, oldVersion.content);
});
