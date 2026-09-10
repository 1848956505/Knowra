import assert from 'node:assert/strict';
import path from 'node:path';
import { once } from 'node:events';
import { test } from 'node:test';
import { randomUUID, createHash } from 'node:crypto';
import { anchorFromProjectedRange, projectMarkdown } from '@study-accelerator/content-anchor';
import { createFileDataStore } from '../../api/src/infrastructure/file-data-store.js';
import { createAppContext } from '../../api/src/app.factory.js';
import { createServer } from '../../api/src/server.js';
import { createSyncEngine } from '../src/sync-engine.mjs';
import { noteContent } from '../../api/src/modules/sync/journal.js';
import { writeJsonFileAtomically } from '../../api/src/infrastructure/atomic-json-file.js';
import { readMeta, writeMeta } from '../src/sync-state.mjs';
import { openWorkspace, temporaryDirectory } from './helpers.mjs';

async function fixture(t, options = {}) {
  const root = temporaryDirectory(t);
  const dataStore = createFileDataStore(path.join(root, 'cloud.json'), options);
  const context = createAppContext({ dataStore, uploadsDir: path.join(root, 'uploads'), storageRootDir: root });
  const knowledge = context.modules.knowledge;
  const space = knowledge.knowledgeSpaceService.createDefaultKnowledgeSpace({ userId: 'demo' });
  const note = knowledge.noteService.createNote({ title: '同步样本', rawMarkdown: '共同基线', spaceId: space.id });
  const server = createServer({ appContext: context, logger: { error() {} } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  t.after(() => new Promise(resolve => server.close(resolve)));
  function device(name, fetcher) {
    const workspace = openWorkspace(path.join(root, name));
    const engine = createSyncEngine(workspace.store, { fetcher, intervalMs: 3600000, noteService: workspace.knowledge.noteService });
    t.after(async () => { await engine.close(); workspace.store.close(); });
    return { ...workspace, engine, connect: () => engine.configure({ serverUrl: origin }) };
  }
  return { root, dataStore, context, knowledge, space, note, origin, device };
}

test('真实 HTTP：网页、两个 SQLite 设备收敛；同事务版本日志与稳定修订', async t => {
  const cloud = await fixture(t);
  const a = cloud.device('a'); const b = cloud.device('b');
  await a.connect(); await b.connect();
  assert.equal(a.engine.status().error, null);
  assert.equal(a.knowledge.noteService.getNote(cloud.note.id).rawMarkdown, '共同基线');
  a.knowledge.noteService.updateNote(cloud.note.id, { rawMarkdown: '设备 A 离线正文' });
  await a.engine.sync(); await b.engine.sync();
  assert.equal(a.engine.status().error, null);
  assert.equal(b.knowledge.noteService.getNote(cloud.note.id).rawMarkdown, '设备 A 离线正文');
  const remote = cloud.knowledge.noteService.getNote(cloud.note.id);
  const response = await fetch(`${cloud.origin}/api/knowledge/notes/${remote.id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rawMarkdown: '网页更新', expectedUpdatedAt: remote.updatedAt })
  });
  assert.equal(response.status, 200);
  await a.engine.sync(); await b.engine.sync();
  assert.equal(a.knowledge.noteService.getNote(remote.id).rawMarkdown, '网页更新');
  assert.equal(b.knowledge.noteService.getNote(remote.id).rawMarkdown, '网页更新');
  assert.equal(a.engine.status().pendingNotes, 0);
  const last = cloud.dataStore.getSyncJournal().changes.at(-1).items;
  assert(last.some(item => item.collection === 'notes'));
  assert(last.some(item => item.collection === 'noteVersions'));
  const stale = await fetch(`${cloud.origin}/api/knowledge/notes/${remote.id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rawMarkdown: '旧客户端覆盖' })
  });
  assert.equal(stale.status, 428);
});

test('丢失成功响应后原 ID 重试；发送期间的新编辑不会被旧确认清除', async t => {
  const cloud = await fixture(t);
  let lose = true; let edited = false; const ids = [];
  const a = cloud.device('a', async (url, options) => {
    const response = await fetch(url, options);
    if (url.endsWith('/push')) {
      ids.push(JSON.parse(options.body).operationId);
      if (!edited) { edited = true; a.knowledge.noteService.updateNote(cloud.note.id, { rawMarkdown: '发送期间继续编辑' }); }
      if (lose) { lose = false; throw new Error('模拟响应丢失'); }
    }
    return response;
  });
  await a.connect();
  a.knowledge.noteService.updateNote(cloud.note.id, { rawMarkdown: '已发送的第一版' });
  await a.engine.sync();
  assert.equal(a.engine.status().phase, 'paused');
  assert.equal(cloud.knowledge.noteService.getNote(cloud.note.id).rawMarkdown, '已发送的第一版');
  await a.engine.sync();
  assert.equal(a.engine.status().error, null);
  assert.equal(ids[0], ids[1]);
  assert.notEqual(ids[1], ids[2]);
  assert.equal(cloud.knowledge.noteService.getNote(cloud.note.id).rawMarkdown, '发送期间继续编辑');
  assert.equal(a.engine.status().pendingNotes, 0);
  assert.equal(cloud.dataStore.state.noteVersions.filter(version => version.content === '已发送的第一版').length, 1);
});

test('双端冲突持久保留三份快照，其他笔记继续同步，手动合并后收敛', async t => {
  const cloud = await fixture(t);
  const a = cloud.device('a'); const b = cloud.device('b');
  await a.connect(); await b.connect();
  a.knowledge.noteService.updateNote(cloud.note.id, { rawMarkdown: '本地分支 A' });
  b.knowledge.noteService.updateNote(cloud.note.id, { rawMarkdown: '本地分支 B' });
  await b.engine.sync(); await a.engine.sync();
  const conflict = a.engine.status().conflicts[0];
  assert.equal(conflict.base.rawMarkdown, '共同基线');
  assert.equal(conflict.local.rawMarkdown, '本地分支 A');
  assert.equal(conflict.remote.rawMarkdown, '本地分支 B');
  a.knowledge.noteService.createNote({ title: '独立笔记', rawMarkdown: '仍可上传', spaceId: cloud.space.id });
  await a.engine.sync();
  assert(cloud.dataStore.state.notes.some(note => note.title === '独立笔记'));
  await a.engine.resolve({ ...conflict, choice: 'manual', rawMarkdown: '合并 A 与 B' });
  await b.engine.sync();
  assert.equal(a.engine.status().error, null);
  assert.equal(a.engine.status().conflicts.length, 0);
  assert.equal(b.knowledge.noteService.getNote(cloud.note.id).rawMarkdown, '合并 A 与 B');
  assert.equal(a.store.readSync(db => db.prepare('SELECT COUNT(*) AS n FROM sync_recovery').get().n), 1);
});

test('软删除与编辑冲突；永久删除的旧设备保留副本且不会复活旧 ID', async t => {
  const cloud = await fixture(t);
  const a = cloud.device('a'); const clean = cloud.device('clean');
  await a.connect(); await clean.connect();
  a.knowledge.noteService.updateNote(cloud.note.id, { rawMarkdown: '必须保留的离线内容' });
  cloud.knowledge.noteService.deleteNote(cloud.note.id);
  await a.engine.sync();
  assert.equal(a.engine.status().conflicts[0].kind, 'delete');
  cloud.context.http.knowledge.permanentlyDeleteNote({ id: cloud.note.id });
  await a.engine.sync(); await clean.engine.sync();
  assert.equal(clean.engine.status().error, null);
  assert.equal(clean.store.state.notes.length, 0);
  const conflict = a.engine.status().conflicts[0];
  assert.equal(conflict.remote, null);
  await a.engine.resolve({ ...conflict, choice: 'local' });
  assert.equal(a.engine.status().error, null);
  assert(!cloud.dataStore.state.notes.some(note => note.id === cloud.note.id));
  assert(cloud.dataStore.state.notes.some(note => note.rawMarkdown === '必须保留的离线内容'));
});

test('快照固定分页、游标过期和世代变化保全本地分支；幂等 ID 不得换负载', async t => {
  const cloud = await fixture(t);
  const a = cloud.device('a'); await a.connect();
  const service = cloud.context.http.sync;
  const start = service.bootstrap();
  cloud.knowledge.noteService.updateNote(cloud.note.id, { rawMarkdown: '快照后的更新' });
  const page = service.snapshot({ snapshotId: start.snapshotId });
  assert.equal(page.entries.find(item => item.id === cloud.note.id).value.rawMarkdown, '共同基线');
  a.knowledge.noteService.updateNote(cloud.note.id, { rawMarkdown: '世代变化时未提交内容' });
  cloud.dataStore.commitImport(cloud.dataStore.exportSnapshot());
  await a.engine.sync();
  assert.equal(a.engine.status().error, null);
  assert.equal(a.engine.status().conflicts[0].local.rawMarkdown, '世代变化时未提交内容');
  assert.throws(() => service.changes({ cursor: start.cursor }), error => error.code === 'DATASET_CHANGED');
  const status = service.status();
  const current = service.snapshot({ snapshotId: service.bootstrap().snapshotId }).entries.find(item => item.id === cloud.note.id);
  const operation = { protocolVersion: 1, deviceId: 'test', operationId: randomUUID(), noteId: cloud.note.id, datasetEpoch: status.datasetEpoch, baseRevision: current.revision, value: noteContent(current.value) };
  const first = service.push(operation);
  assert.deepEqual(service.push(operation), first);
  assert.throws(() => service.push({ ...operation, value: { ...operation.value, rawMarkdown: '不同负载' } }), error => error.code === 'OPERATION_REUSED');
});

test('JSON 云端提交失败回滚正文、版本、修订和幂等结果；原请求可重试', async t => {
  let fail = false;
  const cloud = await fixture(t, { writeJson: (...args) => { if (fail) throw new Error('磁盘故障'); return writeJsonFileAtomically(...args); } });
  const service = cloud.context.http.sync;
  const start = service.bootstrap();
  const entry = service.snapshot({ snapshotId: start.snapshotId }).entries.find(item => item.id === cloud.note.id);
  const operation = { protocolVersion: 1, deviceId: 'failure-test', operationId: randomUUID(), noteId: cloud.note.id,
    datasetEpoch: start.datasetEpoch, baseRevision: entry.revision, value: { ...noteContent(cloud.note), rawMarkdown: '事务内容' } };
  const before = JSON.stringify({ state: cloud.dataStore.state, journal: cloud.dataStore.getSyncJournal() });
  fail = true;
  assert.throws(() => service.push(operation), failure => failure.code === 'STORAGE_WRITE_FAILED');
  assert.equal(JSON.stringify({ state: cloud.dataStore.state, journal: cloud.dataStore.getSyncJournal() }), before);
  fail = false;
  assert.equal(service.push(operation).status, 'accepted');
});

test('未确认的新建已被云端删除，服务器恢复后必须冲突，不能按空基线复活', async t => {
  const cloud = await fixture(t); let lose = true;
  const a = cloud.device('a', async (url, options) => {
    const response = await fetch(url, options);
    if (url.endsWith('/push') && lose) { lose = false; throw new Error('丢失新建确认'); }
    return response;
  });
  await a.connect();
  const created = a.knowledge.noteService.createNote({ title: '未确认的新建', rawMarkdown: '保留副本', spaceId: cloud.space.id });
  await a.engine.sync();
  cloud.knowledge.noteService.deleteNote(created.id);
  cloud.context.http.knowledge.permanentlyDeleteNote({ id: created.id });
  cloud.dataStore.commitImport(cloud.dataStore.exportSnapshot());
  await a.engine.sync();
  assert.equal(a.engine.status().error, null);
  assert(a.engine.status().conflicts.some(conflict => conflict.noteId === created.id && conflict.remote === null));
  assert(!cloud.dataStore.state.notes.some(note => note.id === created.id));
});

test('游标过期重建快照，最后一页已下载的恢复点无需重复请求', async t => {
  const cloud = await fixture(t); const a = cloud.device('a'); await a.connect();
  cloud.knowledge.noteService.updateNote(cloud.note.id, { rawMarkdown: '过期后恢复的内容' });
  cloud.dataStore.runSyncTransaction(() => { cloud.dataStore.getSyncJournal().floor = cloud.dataStore.getSyncJournal().head; });
  await a.engine.sync();
  assert.equal(a.engine.status().error.code, 'CURSOR_EXPIRED');
  const start = cloud.context.http.sync.bootstrap();
  const page = cloud.context.http.sync.snapshot({ snapshotId: start.snapshotId });
  a.store.syncTransaction(db => writeMeta(db, 'bootstrap', { ...start, entries: page.entries, offset: null }));
  await a.engine.sync();
  assert.equal(a.engine.status().error, null);
  assert.equal(a.knowledge.noteService.getNote(cloud.note.id).rawMarkdown, '过期后恢复的内容');
  assert.equal(a.store.readSync(db => readMeta(db, 'bootstrap')), null);
});

test('SQLite 拉取提交失败不推进游标、不覆盖本地正文，修复后可以继续', async t => {
  const cloud = await fixture(t); let fail = false; let workspace;
  workspace = openWorkspace(path.join(cloud.root, 'disk-failure'), { beforeCommit: () => {
    if (fail && workspace.store.state.notes.some(note => note.rawMarkdown === '远端新正文')) throw new Error('拉取落盘失败');
  } });
  const engine = createSyncEngine(workspace.store, { autoSync: false, noteService: workspace.knowledge.noteService });
  t.after(async () => { await engine.close(); workspace.store.close(); });
  await engine.configure({ serverUrl: cloud.origin });
  const cursor = workspace.store.readSync(db => readMeta(db, 'cursor'));
  cloud.knowledge.noteService.updateNote(cloud.note.id, { rawMarkdown: '远端新正文' });
  fail = true; await engine.sync();
  assert.equal(workspace.knowledge.noteService.getNote(cloud.note.id).rawMarkdown, '共同基线');
  assert.equal(workspace.store.readSync(db => readMeta(db, 'cursor')), cursor);
  fail = false; await engine.sync();
  assert.equal(engine.status().error, null);
  assert.equal(workspace.knowledge.noteService.getNote(cloud.note.id).rawMarkdown, '远端新正文');
});

test('采用云端与保留两篇都有可导出的恢复记录；再次并发必须重新处理', async t => {
  const cloud = await fixture(t); const a = cloud.device('a'); await a.connect();
  for (const choice of ['remote', 'copy']) {
    a.knowledge.noteService.updateNote(cloud.note.id, { rawMarkdown: `本地 ${choice}` });
    cloud.knowledge.noteService.updateNote(cloud.note.id, { rawMarkdown: `云端 ${choice}` });
    await a.engine.sync();
    const conflict = a.engine.status().conflicts[0];
    await a.engine.resolve({ ...conflict, choice });
    assert.equal(a.engine.status().error, null);
    assert.equal(a.knowledge.noteService.getNote(cloud.note.id).rawMarkdown, `云端 ${choice}`);
    if (choice === 'copy') assert(cloud.dataStore.state.notes.some(note => note.id !== cloud.note.id && note.rawMarkdown === '本地 copy'));
  }
  assert.equal(a.engine.recovery().length, 2);
  a.knowledge.noteService.updateNote(cloud.note.id, { rawMarkdown: '本地解决意图' });
  cloud.knowledge.noteService.updateNote(cloud.note.id, { rawMarkdown: '云端第一次变化' });
  await a.engine.sync(); const conflict = a.engine.status().conflicts[0];
  cloud.knowledge.noteService.updateNote(cloud.note.id, { rawMarkdown: '处理期间的第二次变化' });
  await a.engine.resolve({ ...conflict, choice: 'local' });
  assert.equal(a.engine.status().conflicts[0].remote.rawMarkdown, '处理期间的第二次变化');
  assert.equal(cloud.knowledge.noteService.getNote(cloud.note.id).rawMarkdown, '处理期间的第二次变化');
});

test('关闭并重新打开 SQLite 后，冻结请求仍按相同操作 ID 重试', async t => {
  const cloud = await fixture(t); const ids = []; let lose = true;
  const fetcher = async (url, options) => {
    const result = await fetch(url, options);
    if (url.endsWith('/push')) {
      ids.push(JSON.parse(options.body).operationId);
      if (lose) { lose = false; throw new Error('重启前响应丢失'); }
    }
    return result;
  };
  const directory = path.join(cloud.root, 'restart');
  let workspace = openWorkspace(directory);
  let engine = createSyncEngine(workspace.store, { fetcher, autoSync: false, noteService: workspace.knowledge.noteService });
  t.after(async () => { await engine.close(); workspace.store.close(); });
  await engine.configure({ serverUrl: cloud.origin });
  workspace.knowledge.noteService.updateNote(cloud.note.id, { rawMarkdown: '重启后继续确认' });
  await engine.sync(); await engine.close(); workspace.store.close();
  workspace = openWorkspace(directory);
  engine = createSyncEngine(workspace.store, { fetcher, autoSync: false, noteService: workspace.knowledge.noteService });
  await engine.sync();
  assert.equal(engine.status().error, null);
  assert.equal(ids.length, 2);
  assert.equal(ids[0], ids[1]);
  assert.equal(engine.status().pendingNotes, 0);
  assert(workspace.store.readOutbox().filter(row => row.changes.some(change => change.collection === 'notes')).every(row => row.state === 'acknowledged'));
});

test('冻结请求的永久依赖错误只阻塞该笔记，调整目录后自动恢复', async t => {
  const cloud = await fixture(t); let lose = true;
  const a = cloud.device('a', async (url, options) => {
    const response = await fetch(url, options);
    if (url.endsWith('/push') && lose) { lose = false; throw new Error('丢失依赖失败响应'); }
    return response;
  });
  await a.connect();
  const folder = a.knowledge.folderService.createFolder({ spaceId: cloud.space.id, name: '仅本地目录' });
  const blocked = a.knowledge.noteService.createNote({ title: '等待目录的笔记', rawMarkdown: '不丢失', spaceId: cloud.space.id, folderId: folder.id });
  await a.engine.sync();
  a.knowledge.noteService.createNote({ title: '没有依赖的笔记', rawMarkdown: '继续同步', spaceId: cloud.space.id });
  await a.engine.sync();
  assert.equal(a.engine.status().error, null);
  assert.equal(a.engine.status().blockedNotes.length, 1);
  assert(cloud.dataStore.state.notes.some(note => note.title === '没有依赖的笔记'));
  a.knowledge.noteService.updateNote(blocked.id, { folderId: null });
  await a.engine.sync();
  assert.equal(a.engine.status().blockedNotes.length, 0);
  assert.equal(a.engine.status().pendingNotes, 0);
});

test('已有标注与知识证据随正文事务同步，保持不可变来源引用和失效状态', async t => {
  const cloud = await fixture(t);
  const anchor = anchorFromProjectedRange(projectMarkdown(cloud.note.rawMarkdown), 0, 4);
  const annotation = cloud.knowledge.contentAnnotationService.createAnnotation({
    spaceId: cloud.space.id, noteId: cloud.note.id, schemaVersion: 2, scopeType: 'selection', kind: 'important', sourceMode: 'manual',
    quoteText: anchor.quoteText, fromPosition: anchor.sourceStart, toPosition: anchor.sourceEnd, prefixText: anchor.prefixText,
    suffixText: anchor.suffixText, headingPath: [], anchor, anchorFingerprint: 'test',
    noteContentHash: createHash('sha256').update(cloud.note.rawMarkdown).digest('hex'), idempotencyKey: randomUUID()
  });
  cloud.knowledge.knowledgeItemService.createCandidate({ title: '来源同步验证', canonicalStatement: '保持已有来源关系', sourceMode: 'selection', evidence: [{ sourceType: 'annotation', annotationId: annotation.id }] });
  const a = cloud.device('a'); await a.connect();
  assert.equal(a.engine.status().error, null);
  a.knowledge.noteService.updateNote(cloud.note.id, { rawMarkdown: '' });
  await a.engine.sync();
  assert.equal(a.engine.status().error, null);
  assert.equal(a.store.state.contentAnnotations[0].anchorStatus, cloud.dataStore.state.contentAnnotations[0].anchorStatus);
  assert.equal(a.store.state.knowledgeEvidence[0].status, cloud.dataStore.state.knowledgeEvidence[0].status);
  assert(a.store.state.noteVersions.some(version => version.id === a.store.state.knowledgeEvidence[0].noteVersionId));
  const items = cloud.dataStore.getSyncJournal().changes.at(-1).items;
  assert(items.some(item => item.collection === 'contentAnnotations'));
  assert(items.some(item => item.collection === 'knowledgeEvidence'));
});
