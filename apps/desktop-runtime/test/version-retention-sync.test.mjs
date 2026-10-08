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
import { createSyncEngine } from '../src/sync-engine.mjs';
import { temporaryDirectory, openWorkspace } from './helpers.mjs';

const DAY = 24 * 3600 * 1000;

async function fixture(t) {
  const root = temporaryDirectory(t);
  const cloud = createFileDataStore(path.join(root, 'cloud.json'));
  const context = createAppContext({ dataStore: cloud, storageRootDir: root });
  const space = context.modules.knowledge.knowledgeSpaceService.createDefaultKnowledgeSpace({ userId: 'demo' });
  const server = createServer({ appContext: context });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  function device(name) {
    const directory = path.join(root, name);
    const workspace = openWorkspace(directory);
    const transfer = createAttachmentTransfer({ uploadsDir: path.join(directory, 'uploads'), storageRootDir: directory });
    const engine = createSyncEngine(workspace.store, { entityTransfer: transfer, autoSync: false });
    t.after(async () => { await engine.close(); workspace.store.close(); });
    return { ...workspace, engine, connect: () => engine.configure({ serverUrl: origin }) };
  }
  return { cloud, space, device };
}

test('云端按保留策略清理旧版本：设备收到墓碑后释放副本，被私有记录引用的副本保留且不再上传', async t => {
  const f = await fixture(t);
  const a = f.device('a'); const b = f.device('b');
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
  const cloudVersions = f.cloud.state.noteVersions.filter(item => item.noteId === note.id);
  assert.ok(cloudVersions.length < old.length / 2, `云端版本应被稀疏化，实际 ${cloudVersions.length}`);
  assert.ok(cloudVersions.some(item => item.content === '正文 1'), '当前正文版本保留');
  assert.ok(!cloudVersions.some(item => item.id === cited), '云端不知道设备私有引用，按策略清理');
  const local = a.store.state.noteVersions.filter(item => item.noteId === note.id).map(item => item.id).sort();
  assert.deepEqual(local, [...cloudVersions.map(item => item.id), cited].sort(), '设备释放已清理副本，仅保留被引用副本');
  assert.equal(a.engine.status().pendingEntities, 0, '保留的副本不会作为新建上传');
  await b.connect();
  assert.equal(b.engine.status().error, null);
  assert.deepEqual(b.store.state.noteVersions.filter(item => item.noteId === note.id).map(item => item.id).sort(), cloudVersions.map(item => item.id).sort());
});
