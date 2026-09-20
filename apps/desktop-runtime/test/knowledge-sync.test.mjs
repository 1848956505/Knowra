import assert from 'node:assert/strict';
import path from 'node:path';
import { once } from 'node:events';
import { test } from 'node:test';
import { anchorFromProjectedRange, projectMarkdown, calculateContentHash } from '@study-accelerator/content-anchor';
import { createAttachmentTransfer } from '../../api/src/modules/sync/attachment-transfer.js';
import { createFileDataStore } from '../../api/src/infrastructure/file-data-store.js';
import { createAppContext } from '../../api/src/app.factory.js';
import { createServer } from '../../api/src/server.js';
import { createSyncEngine } from '../src/sync-engine.mjs';
import { nextEntityUpload } from '../src/entity-sync-state.mjs';
import { temporaryDirectory, openWorkspace } from './helpers.mjs';

async function fixture(t) {
  const root = temporaryDirectory(t);
  const store = createFileDataStore(path.join(root, 'cloud.json'));
  const context = createAppContext({ dataStore: store, uploadsDir: path.join(root, 'uploads'), storageRootDir: root });
  const knowledge = context.modules.knowledge;
  const space = knowledge.knowledgeSpaceService.createDefaultKnowledgeSpace({ userId: 'demo' });
  const note = knowledge.noteService.createNote({ title: '知识来源', rawMarkdown: '这是需要学习的知识。', spaceId: space.id });
  const server = createServer({ appContext: context, logger: { error() {} } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  function device(name, fetcher = fetch) {
    const directory = path.join(root, name);
    const target = {};
    const open = () => {
      Object.assign(target, openWorkspace(directory));
      target.engine = createSyncEngine(target.store, { autoSync: false, fetcher, noteService: target.knowledge.noteService,
        entityTransfer: createAttachmentTransfer({ uploadsDir: path.join(directory, 'uploads'), storageRootDir: directory }) });
    };
    open();
    target.connect = () => target.engine.configure({ serverUrl: origin });
    target.restart = async () => { await target.engine.close(); target.store.close(); open(); };
    t.after(async () => { await target.engine.close(); target.store.close(); });
    return target;
  }
  return { store, context, knowledge, note, space, device };
}
function annotation(knowledge, note) {
  const anchor = anchorFromProjectedRange(projectMarkdown(note.rawMarkdown), 0, 7);
  return knowledge.contentAnnotationService.createAnnotation({ spaceId: note.spaceId, noteId: note.id, schemaVersion: 2, scopeType: 'selection',
    quoteText: anchor.quoteText, fromPosition: anchor.sourceStart, toPosition: anchor.sourceEnd, anchorFingerprint: 'knowledge-sync', anchor,
    noteContentHash: calculateContentHash(note.rawMarkdown), idempotencyKey: `source-${note.id}` });
}
function candidate(knowledge, source) {
  return knowledge.knowledgeItemService.createCandidate({ title: '离线知识', canonicalStatement: '经过人工确认的知识陈述', sourceMode: 'annotation',
    evidence: [{ sourceType: 'annotation', annotationId: source.id, expectedAnnotationRevision: source.revision }] });
}
const clean = device => {
  const status = device.engine.status();
  assert.equal(status.error, null, JSON.stringify(status)); assert.equal(status.entityConflict, null, JSON.stringify(status));
  assert.equal(status.pendingEntities, 0, JSON.stringify(status));
};

// 全部通过真实 HTTP 云端及 SQLite 设备；不会触及用户资料。
test('离线新笔记、标注、知识和来源跨重启持久化，并在两设备原子收敛', async t => {
  const cloud = await fixture(t); let offline = false;
  const a = cloud.device('a', (...args) => offline ? Promise.reject(new Error('模拟离线')) : fetch(...args));
  const b = cloud.device('b'); await a.connect(); await b.connect(); offline = true;
  const note = a.knowledge.noteService.createNote({ title: '完全离线来源', rawMarkdown: '完全离线的新笔记与知识。', spaceId: cloud.space.id });
  const source = annotation(a.knowledge, note);
  const { item, evidence } = candidate(a.knowledge, source);
  a.knowledge.knowledgeItemService.confirmItem(item.id);
  await a.engine.sync(); assert(a.engine.status().error);
  await a.restart();
  assert.equal(a.knowledge.knowledgeItemService.getItem(item.id).reviewStatus, 'confirmed');
  assert.equal(a.knowledge.knowledgeItemService.listEvidence(item.id)[0].id, evidence[0].id);
  offline = false; await a.engine.sync(); clean(a); await b.engine.sync(); clean(b);
  assert.equal(b.knowledge.knowledgeItemService.getItem(item.id).reviewStatus, 'confirmed');
  assert.equal(b.knowledge.knowledgeItemService.listEvidence(item.id)[0].noteId, note.id);
  const transaction = cloud.store.getSyncJournal().changes.find(group => group.items.some(entry => entry.id === item.id));
  for (const id of [note.id, source.id, evidence[0].id]) assert(transaction.items.some(entry => entry.id === id));
  assert.equal(a.store.getStatus().pendingOperations, 0);
});

test('两设备编辑、重新确认、归档和恢复知识保留身份与来源', async t => {
  const cloud = await fixture(t); const a = cloud.device('a'); const b = cloud.device('b'); await a.connect(); await b.connect();
  const { item } = a.knowledge.knowledgeItemService.createCandidate({ title: '手动知识', canonicalStatement: '初稿', sourceMode: 'manual' });
  a.knowledge.knowledgeItemService.confirmItem(item.id); await a.engine.sync(); clean(a); await b.engine.sync(); clean(b);
  b.knowledge.knowledgeItemService.updateItem(item.id, { canonicalStatement: '修订陈述' });
  assert.equal(b.knowledge.knowledgeItemService.getItem(item.id).reviewStatus, 'needsRevision');
  await b.engine.sync(); clean(b); await a.engine.sync(); clean(a);
  assert.equal(a.knowledge.knowledgeItemService.getItem(item.id).canonicalStatement, '修订陈述');
  a.knowledge.knowledgeItemService.confirmItem(item.id); a.knowledge.knowledgeItemService.archive(item.id);
  await a.engine.sync(); clean(a); await b.engine.sync(); clean(b);
  assert.equal(b.knowledge.knowledgeItemService.getItem(item.id).reviewStatus, 'archived');
  b.knowledge.knowledgeItemService.restore(item.id); await b.engine.sync(); clean(b); await a.engine.sync(); clean(a);
  assert.equal(a.knowledge.knowledgeItemService.getItem(item.id).reviewStatus, 'candidate');
  assert.equal(cloud.store.state.knowledgeItems.length, 1);
});

test('知识创建丢响应后重启重放同一请求，后继编辑保留且证据不重复', async t => {
  const cloud = await fixture(t); let lose = true; const operationIds = [];
  const a = cloud.device('a', async (url, options) => {
    const response = await fetch(url, options);
    if (url.endsWith('/batch')) { operationIds.push(JSON.parse(options.body).operationId); if (lose) { lose = false; throw new Error('模拟提交成功但响应丢失'); } }
    return response;
  });
  const source = annotation(cloud.knowledge, cloud.note); await a.connect();
  const { item } = candidate(a.knowledge, source); await a.engine.sync(); assert(a.engine.status().error);
  await a.restart(); a.knowledge.knowledgeItemService.updateItem(item.id, { canonicalStatement: '响应丢失后的编辑' });
  await a.engine.sync(); clean(a);
  assert.equal(operationIds[0], operationIds[1]); assert.equal(cloud.store.state.knowledgeItems.length, 1); assert.equal(cloud.store.state.knowledgeEvidence.length, 1);
  assert.equal(cloud.knowledge.knowledgeItemService.getItem(item.id).canonicalStatement, '响应丢失后的编辑');
});

test('并发知识修改进入冲突，采用本地保留远端恢复记录并同步另一端', async t => {
  const cloud = await fixture(t); const { item } = cloud.knowledge.knowledgeItemService.createCandidate({ title: '并发', canonicalStatement: '基线', sourceMode: 'manual' });
  const a = cloud.device('a'); const b = cloud.device('b'); await a.connect(); await b.connect();
  a.knowledge.knowledgeItemService.updateItem(item.id, { canonicalStatement: 'A 编辑' });
  b.knowledge.knowledgeItemService.updateItem(item.id, { canonicalStatement: 'B 编辑' });
  await b.engine.sync(); clean(b); await a.engine.sync();
  const conflict = a.engine.status().entityConflict; assert(conflict);
  assert.equal(a.knowledge.knowledgeItemService.getItem(item.id).canonicalStatement, 'A 编辑');
  await a.engine.resolve({ conflictId: conflict.id, choice: 'local' }); clean(a);
  assert(a.engine.recovery().some(record => record.remote?.some(entry => entry.id === item.id && entry.value.canonicalStatement === 'B 编辑')));
  await b.engine.sync(); clean(b); assert.equal(b.knowledge.knowledgeItemService.getItem(item.id).canonicalStatement, 'A 编辑');
});

test('离线确认遇到另一端删除来源后降级，不允许无效证据绕过确认', async t => {
  const cloud = await fixture(t); const source = annotation(cloud.knowledge, cloud.note); const { item } = candidate(cloud.knowledge, source);
  const a = cloud.device('a'); const b = cloud.device('b'); await a.connect(); await b.connect();
  a.knowledge.knowledgeItemService.confirmItem(item.id);
  b.knowledge.noteService.deleteNote(cloud.note.id); await b.engine.sync(); clean(b);
  await a.engine.sync(); clean(a); await b.engine.sync(); clean(b);
  for (const knowledge of [a.knowledge, b.knowledge, cloud.knowledge]) {
    assert.equal(knowledge.knowledgeItemService.getItem(item.id).reviewStatus, 'needsRevision');
    assert.equal(knowledge.knowledgeItemService.listEvidence(item.id)[0].status, 'invalid');
    assert.throws(() => knowledge.knowledgeItemService.confirmItem(item.id), error => error.code === 'KNOWLEDGE_ITEM_SOURCE_REQUIRED');
  }
});

test('离线候选遇到原文变更仍保留历史证据，来源失效后两端收敛', async t => {
  const cloud = await fixture(t); const source = annotation(cloud.knowledge, cloud.note);
  const a = cloud.device('a'); const b = cloud.device('b'); await a.connect(); await b.connect();
  const { item, evidence } = candidate(a.knowledge, source);
  b.knowledge.noteService.updateNote(cloud.note.id, { rawMarkdown: '' }); await b.engine.sync(); clean(b);
  await a.engine.sync(); clean(a); await b.engine.sync(); clean(b);
  assert.equal(b.knowledge.knowledgeItemService.getItem(item.id).reviewStatus, 'candidate');
  assert.equal(b.knowledge.knowledgeItemService.listEvidence(item.id)[0].quoteText, evidence[0].quoteText);
  assert.equal(b.knowledge.knowledgeItemService.listEvidence(item.id)[0].status, 'insufficient');
});

test('旧云端能力协商保留知识待传，同时笔记继续同步；升级后自动补传', async t => {
  const cloud = await fixture(t); let old = true;
  const a = cloud.device('a', async (url, options) => {
    const response = await fetch(url, options);
    if (old && url.endsWith('/status')) { const body = await response.json(); body.data.capabilities = body.data.capabilities.filter(value => value !== 'knowledge-items-v1'); return Response.json(body); }
    return response;
  });
  await a.connect(); const { item } = a.knowledge.knowledgeItemService.createCandidate({ title: '待同步知识', canonicalStatement: '保留本机', sourceMode: 'manual' });
  a.knowledge.noteService.updateNote(cloud.note.id, { rawMarkdown: '旧云端仍同步正文' });
  await a.engine.sync(); assert.equal(a.engine.status().error.code, 'SYNC_KNOWLEDGE_UNSUPPORTED');
  assert.equal(cloud.knowledge.noteService.getNote(cloud.note.id).rawMarkdown, '旧云端仍同步正文');
  assert.equal(a.knowledge.knowledgeItemService.getItem(item.id).title, '待同步知识'); assert.equal(cloud.store.state.knowledgeItems.length, 0);
  old = false; await a.engine.sync(); clean(a); assert.equal(cloud.store.state.knowledgeItems.length, 1);
});

test('同步拒绝伪造有效状态和改写证据快照，业务与回执均不落盘', async t => {
  const cloud = await fixture(t); const source = annotation(cloud.knowledge, cloud.note); const { item } = candidate(cloud.knowledge, source);
  const a = cloud.device('a'); await a.connect();
  a.knowledge.noteService.deleteNote(cloud.note.id);
  a.knowledge.knowledgeItemService.updateItem(item.id, { title: '本地修改' });
  const op = nextEntityUpload(a.store); op.changes.find(entry => entry.id === item.id).value.reviewStatus = 'confirmed';
  const before = JSON.stringify(cloud.store.exportSnapshot().data);
  await assert.rejects(cloud.context.http.sync.pushBatch(op), error => error.code === 'KNOWLEDGE_ITEM_SOURCE_REQUIRED');
  assert.equal(JSON.stringify(cloud.store.exportSnapshot().data), before);
  const evidence = cloud.store.state.knowledgeEvidence[0];
  const altered = { ...op, operationId: 'forge-evidence', changes: [{ collection: 'knowledgeEvidence', id: evidence.id,
    baseRevision: cloud.store.getSyncJournal().revisions[JSON.stringify(['knowledgeEvidence', evidence.id])], value: { ...evidence, quoteText: '伪造来源' } }] };
  altered.dependencies = ['knowledgeItems', 'notes', 'noteVersions', 'contentAnnotations'].map(collection => {
    const field = { knowledgeItems: 'knowledgeItemId', notes: 'noteId', noteVersions: 'noteVersionId', contentAnnotations: 'annotationId' }[collection];
    const id = evidence[field]; return { collection, id, baseRevision: cloud.store.getSyncJournal().revisions[JSON.stringify([collection, id])] };
  });
  await assert.rejects(cloud.context.http.sync.pushBatch(altered), error => error.code === 'SYNC_IMMUTABLE');
  assert.equal(JSON.stringify(cloud.store.exportSnapshot().data), before);
});

test('重新选择标注文字使旧证据待核对，同事务降级知识而不阻止保存', async t => {
  const cloud = await fixture(t); const source = annotation(cloud.knowledge, cloud.note); const { item, evidence } = candidate(cloud.knowledge, source);
  cloud.knowledge.knowledgeItemService.confirmItem(item.id);
  const a = cloud.device('a'); const b = cloud.device('b'); await a.connect(); await b.connect();
  const anchor = anchorFromProjectedRange(projectMarkdown(cloud.note.rawMarkdown), 2, 9);
  a.knowledge.contentAnnotationService.updateAnnotationAnchor(source.id, { anchor, quoteText: anchor.quoteText, fromPosition: anchor.sourceStart, toPosition: anchor.sourceEnd,
    noteContentHash: calculateContentHash(cloud.note.rawMarkdown), anchorFingerprint: 'reselected', expectedRevision: source.revision });
  assert.equal(a.knowledge.knowledgeItemService.getItem(item.id).reviewStatus, 'needsRevision');
  assert.equal(a.knowledge.knowledgeItemService.listEvidence(item.id)[0].status, 'stale');
  await a.engine.sync(); clean(a); await b.engine.sync(); clean(b);
  assert.equal(b.knowledge.knowledgeItemService.listEvidence(item.id)[0].quoteText, evidence[0].quoteText);
  assert.equal(b.knowledge.knowledgeItemService.listEvidence(item.id)[0].status, 'stale');
});

test('来源被永久删除时保留待传知识与完整恢复副本，不能静默丢弃或还原失效来源', async t => {
  const cloud = await fixture(t); const source = annotation(cloud.knowledge, cloud.note);
  const a = cloud.device('a'); await a.connect(); const { item } = candidate(a.knowledge, source);
  cloud.knowledge.noteService.deleteNote(cloud.note.id);
  cloud.context.http.knowledge.permanentlyDeleteNote({ id: cloud.note.id });
  await a.engine.sync(); const conflict = a.engine.status().entityConflict; assert(conflict);
  assert.equal(a.knowledge.knowledgeItemService.getItem(item.id).title, '离线知识');
  await assert.rejects(a.engine.resolve({ conflictId: conflict.id, choice: 'copy' }), /包含知识或来源/);
  await assert.rejects(a.engine.resolve({ conflictId: conflict.id, choice: 'manual', rawMarkdown: '正文' }), /包含知识或来源/);
  await a.engine.resolve({ conflictId: conflict.id, choice: 'remote' }); clean(a);
  assert(a.engine.recovery().some(record => record.local?.knowledgeItems.some(entry => entry.id === item.id)));
  assert.equal(a.store.state.notes.length, 0);
});

test('两端保存相同正文后版本去重同时规范化知识证据和 sourceId', async t => {
  const cloud = await fixture(t); const a = cloud.device('a'); const b = cloud.device('b'); await a.connect(); await b.connect();
  a.knowledge.noteService.updateNote(cloud.note.id, { rawMarkdown: '双端相同新正文' });
  const localVersion = a.store.state.noteVersions.find(version => version.content === '双端相同新正文');
  const { item } = a.knowledge.knowledgeItemService.createCandidate({ title: '版本别名证据', canonicalStatement: '相同内容', sourceMode: 'selection',
    evidence: [{ sourceType: 'noteVersion', noteVersionId: localVersion.id, quoteText: '双端相同新正文' }] });
  cloud.knowledge.noteService.updateNote(cloud.note.id, { rawMarkdown: '双端相同新正文' });
  const canonical = cloud.store.state.noteVersions.find(version => version.content === '双端相同新正文');
  assert.notEqual(canonical.id, localVersion.id);
  await a.engine.sync(); clean(a); await a.restart(); await a.engine.sync(); clean(a); await b.engine.sync(); clean(b);
  for (const knowledge of [a.knowledge, b.knowledge, cloud.knowledge]) {
    const evidence = knowledge.knowledgeItemService.listEvidence(item.id)[0];
    assert.equal(evidence.noteVersionId, canonical.id); assert.equal(evidence.sourceId, canonical.id);
  }
});
