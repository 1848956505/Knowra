import assert from 'node:assert/strict';
import path from 'node:path';
import { once } from 'node:events';
import { test } from 'node:test';
import { createFileDataStore } from '../../api/src/infrastructure/file-data-store.js';
import { createAppContext } from '../../api/src/app.factory.js';
import { createServer } from '../../api/src/server.js';
import { createAttachmentTransfer } from '../../api/src/modules/sync/attachment-transfer.js';
import { NoteVersion } from '../../api/src/modules/knowledge/domain/note-version.js';
import { anchorForBlock, projectMarkdown, calculateContentHash } from '../../../packages/content-anchor/src/index.js';
import { SYNC_CLIENT_BATCH_BODY_LIMIT_BYTES } from '@study-accelerator/shared/http-limits';
import { createSyncEngine } from '../src/sync-engine.mjs';
import { nextEntityUpload, getEntitySyncState, acknowledgeEntityUpload } from '../src/entity-sync-state.mjs';
import { temporaryDirectory, openWorkspace } from './helpers.mjs';

async function fixture(t) {
  const root = temporaryDirectory(t);
  const cloud = createFileDataStore(path.join(root, 'cloud.json'));
  const context = createAppContext({ dataStore: cloud, storageRootDir: root });
  const space = context.modules.knowledge.knowledgeSpaceService.createDefaultKnowledgeSpace({ userId: 'demo' });
  const server = createServer({ appContext: context });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  function device(name, fetcher) {
    const directory = path.join(root, name);
    const open = () => {
      const workspace = openWorkspace(directory);
      const transfer = createAttachmentTransfer({ uploadsDir: path.join(directory, 'uploads'), storageRootDir: directory });
      return { ...workspace, engine: createSyncEngine(workspace.store, { entityTransfer: transfer, autoSync: false, fetcher }) };
    };
    const result = open();
    result.restart = async () => { await result.engine.close(); result.store.close(); Object.assign(result, open()); };
    result.connect = () => result.engine.configure({ serverUrl: origin });
    t.after(async () => { await result.engine.close(); result.store.close(); });
    return result;
  }
  return { cloud, space, device };
}

function annotatedNote(device, spaceId) {
  const note = device.knowledge.noteService.createNote({ title: '长时间编辑', rawMarkdown: '重点正文', spaceId });
  const anchor = anchorForBlock(projectMarkdown(note.rawMarkdown), 0);
  const annotation = device.knowledge.contentAnnotationService.createAnnotation({ spaceId, noteId: note.id,
    schemaVersion: 2, scopeType: 'blocks', anchor, quoteText: anchor.quoteText,
    fromPosition: anchor.sourceStart, toPosition: anchor.sourceEnd, anchorFingerprint: 'long-edit',
    noteContentHash: calculateContentHash(note.rawMarkdown), idempotencyKey: 'long-edit' });
  device.knowledge.noteService.updateNote(note.id, { rawMarkdown: '重点正文\n\n最终新增内容' });
  return { noteId: note.id, annotationId: annotation.id };
}

for (const existing of [false, true]) test(`长时间编辑${existing ? '已有' : '新建'}笔记：千条修订分批、丢响应重启后续传并在第二设备完整收敛`, async t => {
  const f = await fixture(t);
  let armed = false, lost = false;
  const sent = [];
  const a = f.device('a', async (url, options) => {
    const response = await fetch(url, options);
    if (armed && url.endsWith('/batch')) {
      const operation = JSON.parse(options.body); sent.push(operation);
      if (!lost && operation.changes.some(entry => entry.collection === 'annotationRevisions' && entry.value.revision === 500)) {
        lost = true; throw new Error('历史分批已接受但响应丢失');
      }
    }
    return response;
  });
  const b = f.device('b');
  await a.connect();
  const ids = annotatedNote(a, f.space.id);
  if (existing) { await a.engine.sync(); assert.equal(a.engine.status().error, null); }
  const final = a.knowledge.noteService.updateNote(ids.noteId, { rawMarkdown: '重点正文\n\n离线编辑完成' });
  a.store.runTransaction(() => {
    const annotation = a.store.state.contentAnnotations.find(item => item.id === ids.annotationId);
    const template = a.store.state.annotationRevisions.find(item => item.annotationId === ids.annotationId);
    const start = annotation.revision + 1;
    for (let i = start; i <= 1105; i++) a.store.state.annotationRevisions.push({ ...structuredClone(template),
      id: `long-revision-${i}`, revision: i, operation: 'comment' });
    annotation.revision = 1105;
    annotation.comment = '离线最终备注';
    for (let i = 0; i < 80; i++) a.store.state.noteVersions.push(new NoteVersion({ id: `long-version-${i}`, noteId: ids.noteId, content: `历史正文 ${i}` }));
  });
  const revisions = structuredClone(a.store.state.annotationRevisions);
  const versions = structuredClone(a.store.state.noteVersions);
  armed = true;
  await a.engine.sync();
  assert(lost); assert(a.engine.status().error);
  assert.equal(f.cloud.state.notes.find(item => item.id === ids.noteId).rawMarkdown, final.rawMarkdown);
  assert.equal(f.cloud.state.contentAnnotations.find(item => item.id === ids.annotationId).comment, '离线最终备注');
  const frozen = a.store.readSync(db => JSON.parse(db.prepare("SELECT value FROM metadata WHERE key='sync:entityUpload'").get().value));
  await a.restart(); await a.connect();
  assert.equal(a.engine.status().error, null, JSON.stringify(a.engine.status()));
  assert(sent.filter(operation => operation.operationId === frozen.operationId).length >= 2, '重启重发固定请求');
  assert.equal(a.engine.status().pendingEntities, 0);
  assert.equal(a.store.getStatus().pendingOperations, 0);
  await b.connect(); assert.equal(b.engine.status().error, null);
  for (const store of [a.store, b.store, f.cloud]) {
    assert.equal(store.state.notes.find(item => item.id === ids.noteId).rawMarkdown, final.rawMarkdown);
    assert.equal(store.state.contentAnnotations.find(item => item.id === ids.annotationId).revision, 1105);
    for (const revision of revisions) assert.deepEqual(store.state.annotationRevisions.find(item => item.id === revision.id), revision);
    for (const version of versions) assert.deepEqual(store.state.noteVersions.find(item => item.id === version.id), version);
  }
  assert(sent.every(operation => operation.changes.length <= 1000 && Buffer.byteLength(JSON.stringify(operation)) <= SYNC_CLIENT_BATCH_BODY_LIMIT_BYTES));
});

test('单篇累计历史超过12MiB时按最终请求容量自动分批', async t => {
  const f = await fixture(t); const operations = [];
  const a = f.device('large', async (url, options) => {
    if (url.endsWith('/batch')) operations.push(JSON.parse(options.body));
    return fetch(url, options);
  });
  await a.connect();
  const ids = annotatedNote(a, f.space.id);
  a.store.runTransaction(() => {
    for (let i = 0; i < 30; i++) a.store.state.noteVersions.push(new NoteVersion({ id: `large-version-${i}`, noteId: ids.noteId, content: `${i}\n${'中'.repeat(150000)}` }));
  });
  await a.engine.sync(); assert.equal(a.engine.status().error, null, JSON.stringify(a.engine.status()));
  assert.equal(a.engine.status().pendingEntities, 0);
  assert(operations.length >= 2);
  assert(operations.every(operation => Buffer.byteLength(JSON.stringify(operation)) <= SYNC_CLIENT_BATCH_BODY_LIMIT_BYTES));
  assert.equal(f.cloud.state.noteVersions.filter(item => item.noteId === ids.noteId).length, a.store.state.noteVersions.length);
});

test('真正超大的当前正文组明确阻塞，正文、历史、outbox和冻结元数据原样保留', t => {
  const workspace = openWorkspace(temporaryDirectory(t));
  t.after(() => workspace.store.close());
  const note = workspace.knowledge.noteService.createNote({ title: '超大当前正文', rawMarkdown: '', spaceId: workspace.space.id });
  const initial = nextEntityUpload(workspace.store);
  acknowledgeEntityUpload(workspace.store, initial, { status: 'accepted', entries: initial.changes.map(entry => ({ ...entry, revision: 1 })) });
  const rawMarkdown = 'x'.repeat(SYNC_CLIENT_BATCH_BODY_LIMIT_BYTES);
  workspace.store.runTransaction(() => {
    const current = workspace.store.state.notes.find(item => item.id === note.id);
    Object.assign(current, { rawMarkdown, contentHash: calculateContentHash(rawMarkdown), annotationStructure: null });
    workspace.store.state.noteVersions.push(new NoteVersion({ id: 'oversized-current-version', noteId: note.id, content: rawMarkdown }));
  });
  const pending = getEntitySyncState(workspace.store).pendingEntities;
  const rows = () => workspace.store.readSync(db => ({ metadata: db.prepare('SELECT * FROM metadata ORDER BY key').all(),
    outbox: db.prepare('SELECT * FROM sync_outbox').all() }));
  const before = rows();
  assert.throws(() => nextEntityUpload(workspace.store), { code: 'SYNC_ATOMIC_GROUP_TOO_LARGE' });
  assert.deepEqual(rows(), before);
  assert.equal(getEntitySyncState(workspace.store).pendingEntities, pending);
  assert.equal(workspace.store.state.notes.find(item => item.id === note.id).rawMarkdown, rawMarkdown);
  assert.equal(workspace.store.state.noteVersions.find(item => item.id === 'oversized-current-version').content, rawMarkdown);
});
