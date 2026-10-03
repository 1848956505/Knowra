import assert from 'node:assert/strict';
import path from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { createFileDataStore } from '../../api/src/infrastructure/file-data-store.js';
import { createAppContext } from '../../api/src/app.factory.js';
import { createServer } from '../../api/src/server.js';
import { createAttachmentTransfer } from '../../api/src/modules/sync/attachment-transfer.js';
import { createSyncEngine } from '../src/sync-engine.mjs';
import { nextEntityUpload } from '../src/entity-sync-state.mjs';
import { prepareBatchState } from '../../api/src/modules/sync/batch-domain.js';
import { TRAINING_COLLECTIONS } from '../../api/src/modules/sync/entity-contract.js';
import { assertSyncContract, syncContract } from '../../api/src/modules/sync/protocol-contract.js';
import { temporaryDirectory, openWorkspace } from './helpers.mjs';
import { createPostgresTestDatabase } from '../../../scripts/test-support/postgres-test-database.mjs';
import { readExamFocusReviewBoundaries } from '../src/exam-focus-review-boundaries.mjs';
import { readMeta, writeMeta } from '../src/sync-state.mjs';
import { anchorFromProjectedRange, projectMarkdown, calculateContentHash } from '@study-accelerator/content-anchor';
import { createSqliteDataStore } from '../src/sqlite-data-store.mjs';

async function fixture(t, { postgres = false } = {}) {
  const root = temporaryDirectory(t);
  let store, context;
  if (postgres) {
    const database = await createPostgresTestDatabase();
    const { createPostgresAppContext } = await import('../../api/src/postgres-app.factory.js');
    try { context = await createPostgresAppContext({ databaseUrl: database.databaseUrl, uploadsDir: path.join(root, 'uploads'), storageRootDir: root }); }
    catch (failure) { await database.close(); throw failure; }
    t.after(async () => { try { await context.close(); } finally { await database.close(); } });
  } else {
    store = createFileDataStore(path.join(root, 'cloud.json'));
    context = createAppContext({ dataStore: store, uploadsDir: path.join(root, 'uploads'), storageRootDir: root });
  }
  await context.modules.knowledge.knowledgeSpaceService.createDefaultKnowledgeSpace({ userId: 'demo' });
  const server = createServer({ appContext: context, logger: { error() {} } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  function device(name, fetcher = fetch) {
    const directory = path.join(root, name);
    const target = {};
    const open = () => {
      Object.assign(target, openWorkspace(directory));
      target.engine = createSyncEngine(target.store, { autoSync: false, fetcher, noteService: target.knowledge.noteService, entityTransfer: createAttachmentTransfer({ uploadsDir: path.join(directory, 'uploads'), storageRootDir: directory }) });
    };
    open();
    target.connect = () => target.engine.configure({ serverUrl: origin });
    target.restart = async () => { await target.engine.close(); target.store.close(); open(); };
    t.after(async () => { await target.engine.close(); target.store.close(); });
    return target;
  }
  return { root, store, context, origin, knowledge: context.modules.knowledge, device };
}
function assets(knowledge, suffix = '') {
  const { item } = knowledge.knowledgeItemService.createCandidate({ title: `训练知识${suffix}`, canonicalStatement: '解释知识与学习目标', sourceMode: 'manual' });
  knowledge.knowledgeItemService.confirmItem(item.id);
  const objective = knowledge.learningObjectiveService.createCandidate({ knowledgeItemId: item.id, objective: '能够解释知识与学习目标的关系', actionVerb: 'explain', cognitiveLevel: 'understand' });
  knowledge.learningObjectiveService.confirmObjective(objective.id);
  const profile = knowledge.examProfileService.create({ name: `人工考试${suffix}`, scope: ['训练'], commonQuestionTypes: ['shortAnswer'] });
  const focus = knowledge.examFocusService.create({ examProfileId: profile.id, learningObjectiveId: objective.id, description: '人工考点', sourceType: 'manual' });
  knowledge.examFocusService.confirm(focus.id);
  const question = knowledge.questionService.createQuestion({ questionType: 'shortAnswer', stem: '解释知识与学习目标的关系？', referenceAnswer: '学习目标定义可观察的学习行为。', learningObjectiveIds: [objective.id], sources: [{ sourceType: 'learningObjective', sourceId: objective.id }] });
  knowledge.questionService.validateQuestion(question.id); knowledge.questionService.confirmQuestion(question.id);
  return { item, objective, profile, focus, question };
}
function clean(device) {
  const status = device.engine.status();
  assert.equal(status.error, null, JSON.stringify(status));
  assert.equal(status.entityConflict, null, JSON.stringify(status));
  assert.equal(status.pendingEntities, 0, JSON.stringify(status));
}

test('六集合人工训练离线创建确认跨重启，通过真实 HTTP 在两个 SQLite 设备原子收敛', async t => {
  const cloud = await fixture(t); let offline = false;
  const a = cloud.device('a', (...args) => offline ? Promise.reject(new Error('模拟离线')) : fetch(...args));
  const b = cloud.device('b'); await a.connect(); await b.connect(); offline = true;
  const created = assets(a.knowledge);
  await a.engine.sync(); assert(a.engine.status().error); await a.restart();
  assert.equal(a.knowledge.questionService.getQuestion(created.question.id).reviewStatus, 'confirmed');
  offline = false; await a.engine.sync(); clean(a); await b.engine.sync(); clean(b);
  for (const collection of TRAINING_COLLECTIONS) {
    assert.equal(cloud.store.state[collection].length, 1, collection);
    assert.deepEqual(b.store.state[collection], cloud.store.state[collection], collection);
  }
  const group = cloud.store.getSyncJournal().changes.find(entry => entry.items.some(item => item.id === created.question.id));
  for (const collection of TRAINING_COLLECTIONS) assert(group.items.some(entry => entry.collection === collection), collection);
});

test('学习目标内容变化失效云端未知已确认试题，考点状态维持既有 Web 行为', async t => {
  const cloud = await fixture(t); const a = cloud.device('a'); const b = cloud.device('b'); await a.connect(); await b.connect();
  const created = assets(a.knowledge); await a.engine.sync(); clean(a); await b.engine.sync(); clean(b);
  const unknown = cloud.knowledge.questionService.createQuestion({ stem: '云端追加题目？', referenceAnswer: '云端答案', learningObjectiveIds: [created.objective.id], sources: [{ sourceType: 'manual', quote: '人工来源' }] });
  cloud.knowledge.questionService.validateQuestion(unknown.id); cloud.knowledge.questionService.confirmQuestion(unknown.id);
  a.knowledge.learningObjectiveService.updateObjective(created.objective.id, { objective: '能够解释修订后的知识关系' });
  a.knowledge.learningObjectiveService.confirmObjective(created.objective.id);
  await a.engine.sync(); clean(a); await b.engine.sync(); clean(b);
  assert.equal(cloud.store.state.questions.find(row => row.id === unknown.id).reviewStatus, 'candidate');
  assert.equal(b.knowledge.questionService.getQuestion(unknown.id).reviewStatus, 'candidate');
  assert.equal(b.knowledge.examFocusService.get(created.focus.id).reviewStatus, 'confirmed');
});

test('题目关联ID保留，解除后重建换新ID且明确来源更新、版本递增跨端收敛', async t => {
  const cloud = await fixture(t); const a = cloud.device('a'); const b = cloud.device('b'); await a.connect(); await b.connect();
  const created = assets(a.knowledge); await a.engine.sync(); clean(a); await b.engine.sync(); clean(b);
  const oldLink = a.store.state.questionObjectives[0]; const oldSource = a.store.state.questionSources[0];
  a.knowledge.questionService.updateQuestion(created.question.id, { stem: '第一次修订？' });
  assert.equal(a.store.state.questionObjectives[0].id, oldLink.id);
  await a.engine.sync(); clean(a);
  a.knowledge.questionService.updateQuestion(created.question.id, { learningObjectiveIds: [] });
  await a.engine.sync(); clean(a);
  a.knowledge.questionService.updateQuestion(created.question.id, { learningObjectiveIds: [created.objective.id], sources: [{ id: oldSource.id, sourceType: 'manual', quote: '显式替换后的人工来源' }] });
  assert.notEqual(a.store.state.questionObjectives[0].id, oldLink.id);
  a.knowledge.questionService.validateQuestion(created.question.id); a.knowledge.questionService.confirmQuestion(created.question.id);
  await a.engine.sync(); clean(a); await b.engine.sync(); clean(b);
  assert.equal(b.knowledge.questionService.getQuestion(created.question.id).version, 4);
  assert.equal(b.store.state.questionSources[0].id, oldSource.id);
  assert.equal(b.store.state.questionSources[0].quote, '显式替换后的人工来源');
  assert(cloud.store.getSyncJournal().revisions[JSON.stringify(['questionObjectives', oldLink.id])] > 0);
});

test('四主体归档恢复和回收站恢复通过双 SQLite 同步，目标级联题目候选', async t => {
  const cloud = await fixture(t); const a = cloud.device('a'); const b = cloud.device('b'); await a.connect(); await b.connect();
  const created = assets(a.knowledge); await a.engine.sync(); clean(a); await b.engine.sync(); clean(b);
  const actors = [['learningObjective', created.objective.id, 'learningObjectives'], ['examProfile', created.profile.id, 'examProfiles'], ['examFocus', created.focus.id, 'examFocuses'], ['question', created.question.id, 'questions']];
  for (const [type, id, collection] of actors) {
    a.knowledge.trainingAssetLifecycle.trash(type, id); await a.engine.sync(); clean(a); await b.engine.sync(); clean(b);
    assert(b.store.state[collection].find(row => row.id === id).deletedAt);
    b.knowledge.trainingAssetLifecycle.restore(type, id); await b.engine.sync(); clean(b); await a.engine.sync(); clean(a);
    assert.equal(a.store.state[collection].find(row => row.id === id).deletedAt, null);
  }
  assert.equal(a.knowledge.questionService.getQuestion(created.question.id).reviewStatus, 'draft');
  a.knowledge.examProfileService.archive(created.profile.id); a.knowledge.examFocusService.archive(created.focus.id); a.knowledge.learningObjectiveService.archive(created.objective.id); a.knowledge.questionService.archiveQuestion(created.question.id);
  await a.engine.sync(); clean(a); await b.engine.sync(); clean(b);
  b.knowledge.examProfileService.restore(created.profile.id); b.knowledge.examFocusService.restore(created.focus.id); b.knowledge.learningObjectiveService.restore(created.objective.id); b.knowledge.questionService.restoreQuestion(created.question.id);
  await b.engine.sync(); clean(b); await a.engine.sync(); clean(a);
  assert.equal(a.knowledge.examProfileService.get(created.profile.id).archivedAt, null);
});

test('丢响应后的冻结训练请求跨重启重放，后续正文编辑保留', async t => {
  const cloud = await fixture(t); let lose = true; const ids = [];
  const a = cloud.device('a', async (url, options) => {
    const response = await fetch(url, options);
    if (url.endsWith('/batch')) { ids.push(JSON.parse(options.body).operationId); if (lose) { lose = false; throw new Error('模拟响应丢失'); } }
    return response;
  }); await a.connect(); const created = assets(a.knowledge);
  await a.engine.sync(); assert(a.engine.status().error); await a.restart();
  a.knowledge.questionService.updateQuestion(created.question.id, { stem: '重启后的正文？' });
  await a.engine.sync(); clean(a);
  assert.equal(ids[0], ids[1]); assert.equal(cloud.store.state.questions.length, 1);
  assert.equal(cloud.knowledge.questionService.getQuestion(created.question.id).stem, '重启后的正文？');
});

test('训练冲突可采用本地并保留恢复记录，旧编辑不能自动复活远端回收站对象', async t => {
  const cloud = await fixture(t); const created = assets(cloud.knowledge); const a = cloud.device('a'); const b = cloud.device('b'); await a.connect(); await b.connect();
  a.knowledge.questionService.updateQuestion(created.question.id, { stem: 'A 本地编辑？' }); b.knowledge.questionService.updateQuestion(created.question.id, { stem: 'B 编辑？' });
  await b.engine.sync(); clean(b); await a.engine.sync();
  await a.engine.resolve({ conflictId: a.engine.status().entityConflict.id, choice: 'local' }); clean(a);
  assert(a.engine.recovery().length); await b.engine.sync(); clean(b);
  a.knowledge.questionService.updateQuestion(created.question.id, { stem: '删除前旧编辑？' });
  b.knowledge.trainingAssetLifecycle.trash('question', created.question.id); await b.engine.sync(); clean(b); await a.engine.sync();
  const conflict = a.engine.status().entityConflict;
  await assert.rejects(a.engine.resolve({ conflictId: conflict.id, choice: 'local' }), /旧编辑不能恢复/);
  await assert.rejects(a.engine.resolve({ conflictId: conflict.id, choice: 'copy' }), /训练/);
  await a.engine.resolve({ conflictId: conflict.id, choice: 'remote' }); clean(a);
  a.knowledge.trainingAssetLifecycle.restore('question', created.question.id); await a.engine.sync(); clean(a); await b.engine.sync(); clean(b);
  assert.equal(b.store.state.questions[0].deletedAt, null);
});

test('训练契约保留schema7，双方旧能力拒绝，原始冻结请求哈希不改写', async t => {
  const cloud = await fixture(t); const a = cloud.device('a'); await a.connect(); assets(a.knowledge);
  const frozen = nextEntityUpload(a.store); const contract = syncContract();
  assert.equal(contract.entitySchemaVersion, 7);
  assert(contract.capabilities.includes('training-assets-v1'));
  assert.throws(() => assertSyncContract({ ...contract, capabilities: contract.capabilities.filter(value => value !== 'training-assets-v1') }), /升级/);
  const legacy = { ...frozen, capabilities: frozen.capabilities.filter(value => value !== 'training-assets-v1') };
  const response = await fetch(`${cloud.origin}/api/sync/batch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(legacy) });
  assert.equal(response.status, 422); assert.equal(cloud.store.state.questions.length, 0);
  assert.deepEqual(nextEntityUpload(a.store), frozen);
});

test('训练同步拒绝原始永久删除、归属变化、无题关系写入、版本倒退和伪造正式确认', async t => {
  const cloud = await fixture(t); const created = assets(cloud.knowledge); const before = structuredClone(cloud.store.state);
  const change = (collection, value, id = value?.id) => ({ collection, id, value });
  assert.throws(() => prepareBatchState(before, [change('questions', null, created.question.id)], 'demo'), error => error.code === 'SYNC_TRAINING_DELETE_UNSUPPORTED');
  const goal = before.learningObjectives[0];
  assert.throws(() => prepareBatchState(before, [change('learningObjectives', { ...goal, knowledgeItemId: 'other' })], 'demo'), error => error.code === 'SYNC_IDENTITY_CHANGED');
  assert.throws(() => prepareBatchState(before, [change('questionSources', { ...before.questionSources[0], quote: '改写' })], 'demo'), error => error.code === 'SYNC_TRAINING_QUESTION_REQUIRED');
  const question = before.questions[0];
  assert.throws(() => prepareBatchState(before, [change('questions', { ...question, stem: '无版本编辑' })], 'demo'), error => error.code === 'QUESTION_VERSION_CONFLICT');
  assert.throws(() => prepareBatchState(before, [change('questions', { ...question, referenceAnswer: null, version: question.version + 1 })], 'demo'));
});

test('相同正文版本去重也规范化明确试题来源，原摘录和身份保持', async t => {
  const cloud = await fixture(t); const created = assets(cloud.knowledge);
  const space = cloud.knowledge.knowledgeSpaceService.createDefaultKnowledgeSpace({ userId: 'demo' });
  const note = cloud.knowledge.noteService.createNote({ title: '训练版本来源', rawMarkdown: '旧正文', spaceId: space.id });
  const a = cloud.device('alias-a'); const b = cloud.device('alias-b'); await a.connect(); await b.connect();
  a.knowledge.noteService.updateNote(note.id, { rawMarkdown: '两端相同新正文' });
  b.knowledge.noteService.updateNote(note.id, { rawMarkdown: '两端相同新正文' });
  const version = a.store.state.noteVersions.find(row => row.noteId === note.id && row.content === '两端相同新正文');
  a.knowledge.questionService.updateQuestion(created.question.id, { sources: [{ sourceType: 'noteVersion', sourceId: version.id, quote: '保留来源摘录', contentHash: version.contentHash }] });
  const sourceId = a.store.state.questionSources[0].id;
  await b.engine.sync(); clean(b); await a.engine.sync(); clean(a); await b.engine.sync(); clean(b);
  const canonical = cloud.store.state.noteVersions.find(row => row.noteId === note.id && row.content === '两端相同新正文');
  assert.equal(cloud.store.state.questionSources[0].sourceId, canonical.id);
  assert.equal(b.store.state.questionSources[0].id, sourceId);
  assert.equal(b.store.state.questionSources[0].quote, '保留来源摘录');
  assert.equal(b.store.state.questionSources[0].contentHash, version.contentHash);
});

test('新端真实 HTTP 拒绝缺训练能力的旧服务器且原冻结请求及本地状态不变', async t => {
  const cloud = await fixture(t); let old = false;
  const a = cloud.device('old-capability', async (url, options) => {
    const response = await fetch(url, options);
    if (old && url.endsWith('/status')) {
      const body = await response.json(); body.data.capabilities = body.data.capabilities.filter(value => value !== 'training-assets-v1'); return Response.json(body);
    }
    return response;
  }); await a.connect(); assets(a.knowledge); const operation = nextEntityUpload(a.store); const before = structuredClone(a.store.state);
  old = true; await a.engine.sync();
  assert.equal(a.engine.status().error.code, 'SYNC_CLIENT_UPGRADE_REQUIRED');
  assert.deepEqual(nextEntityUpload(a.store), operation); assert.deepEqual(a.store.state, before);
  assert.equal(cloud.store.state.questions.length, 0);
  old = false; await a.engine.sync(); clean(a);
});

test('四主体离线先回收再恢复净零仍逐项交付生命周期，云端未知题失效而考点不强制降级', async t => {
  const cloud = await fixture(t); const a = cloud.device('net-zero-a'); const b = cloud.device('net-zero-b'); await a.connect(); await b.connect();
  const created = assets(a.knowledge); await a.engine.sync(); clean(a); await b.engine.sync(); clean(b);
  const unseen = cloud.knowledge.questionService.createQuestion({ stem: '云端未知的关联题？', referenceAnswer: '需要人工核对。', learningObjectiveIds: [created.objective.id], sources: [{ sourceType: 'manual', quote: '人工来源' }] });
  cloud.knowledge.questionService.validateQuestion(unseen.id); cloud.knowledge.questionService.confirmQuestion(unseen.id);
  const actors = [['learningObjective', created.objective.id, 'learningObjectives'], ['examProfile', created.profile.id, 'examProfiles'], ['examFocus', created.focus.id, 'examFocuses'], ['question', created.question.id, 'questions']];
  for (const [type, id, collection] of actors) {
    a.knowledge.trainingAssetLifecycle.trash(type, id); a.knowledge.trainingAssetLifecycle.restore(type, id);
    await a.restart(); await a.engine.sync(); clean(a); await b.engine.sync(); clean(b);
    const entries = cloud.store.getSyncJournal().changes.flatMap(group => group.items).filter(entry => entry.collection === collection && entry.id === id);
    assert(entries.some(entry => entry.value?.deletedAt), `${collection} trash边界必须真实送达`);
    assert.equal(entries.at(-1).value.deletedAt, null);
  }
  assert.equal(b.knowledge.questionService.getQuestion(unseen.id).reviewStatus, 'candidate');
  assert.equal(b.knowledge.questionService.getQuestion(created.question.id).reviewStatus, 'draft');
});

test('离线新建整图后立即回收恢复，先发布合法创建前像再逐项送达四主体边界', async t => {
  const cloud = await fixture(t); const a = cloud.device('new-net-zero-a'); const b = cloud.device('new-net-zero-b'); await a.connect(); await b.connect();
  for (const [type, field, collection] of [['learningObjective', 'objective', 'learningObjectives'], ['examProfile', 'profile', 'examProfiles'], ['examFocus', 'focus', 'examFocuses'], ['question', 'question', 'questions']]) {
    const created = assets(a.knowledge, type); const id = created[field].id;
    a.knowledge.trainingAssetLifecycle.trash(type, id); a.knowledge.trainingAssetLifecycle.restore(type, id);
    if (type === 'question') a.knowledge.questionService.updateQuestion(id, { stem: '恢复后再编辑的正文？', sources: [{ sourceType: 'manual', quote: '' }] });
    await a.restart(); await a.engine.sync(); clean(a); await b.engine.sync(); clean(b);
    const entries = cloud.store.getSyncJournal().changes.flatMap(group => group.items).filter(entry => entry.collection === collection && entry.id === id);
    assert(entries.some(entry => entry.value?.deletedAt), `${collection} 新建后的trash仍须送达`);
    assert.equal(entries.at(-1).value.deletedAt, null);
    assert.equal(b.store.state[collection].find(row => row.id === id).deletedAt, null);
  }
});

test('新知识带训练关联后离线回收恢复，必要创建前像保持父对象可用且回收边界不丢', async t => {
  const cloud = await fixture(t); const a = cloud.device('new-knowledge-training-a'); const b = cloud.device('new-knowledge-training-b'); await a.connect(); await b.connect();
  const created = assets(a.knowledge);
  a.knowledge.knowledgeItemService.trash(created.item.id); a.knowledge.knowledgeItemService.restoreDeleted(created.item.id);
  await a.restart(); await a.engine.sync(); clean(a); await b.engine.sync(); clean(b);
  const entries = cloud.store.getSyncJournal().changes.flatMap(group => group.items).filter(entry => entry.collection === 'knowledgeItems' && entry.id === created.item.id);
  assert.equal(entries[0].value.deletedAt, null);
  assert(entries.some(entry => entry.value?.deletedAt));
  assert.equal(entries.at(-1).value.deletedAt, null);
  assert.equal(b.knowledge.learningObjectiveService.getObjective(created.objective.id).reviewStatus, 'candidate');
  assert.equal(b.knowledge.examFocusService.get(created.focus.id).reviewStatus, 'confirmed');
  assert.deepEqual(b.store.state.questions, cloud.store.state.questions);
});

test('合法离线考点先确认后父目标编辑为候选，保持考点已确认且两端最终收敛', async t => {
  const cloud = await fixture(t); const a = cloud.device('focus-parent-a'); const b = cloud.device('focus-parent-b'); await a.connect(); await b.connect();
  const created = assets(a.knowledge);
  a.knowledge.learningObjectiveService.updateObjective(created.objective.id, { objective: '能够解释后来修订的目标内容' });
  assert.equal(a.knowledge.learningObjectiveService.getObjective(created.objective.id).reviewStatus, 'candidate');
  assert.equal(a.knowledge.examFocusService.get(created.focus.id).reviewStatus, 'confirmed');
  await a.restart(); await a.engine.sync(); clean(a); await b.engine.sync(); clean(b);
  assert.equal(b.knowledge.learningObjectiveService.getObjective(created.objective.id).reviewStatus, 'candidate');
  assert.equal(b.knowledge.examFocusService.get(created.focus.id).reviewStatus, 'confirmed');
});

test('考点依赖前像交付丢响应后重启仍重放原请求，后继目标及重新确认题目不会被覆盖', async t => {
  const cloud = await fixture(t); let lose = true; const operations = [];
  const a = cloud.device('review-loss', async (url, options) => {
    const response = await fetch(url, options);
    if (url.endsWith('/batch')) { operations.push(JSON.parse(options.body)); if (lose) { lose = false; throw new Error('模拟考点前像响应丢失'); } }
    return response;
  }); await a.connect(); const created = assets(a.knowledge);
  a.knowledge.learningObjectiveService.updateObjective(created.objective.id, { objective: '能够解释临时前像之后的目标' });
  await a.engine.sync(); assert(a.engine.status().error);
  assert.equal(operations[0].changes.find(entry => entry.id === created.objective.id).value.reviewStatus, 'confirmed');
  assert.equal(operations[0].changes.find(entry => entry.id === created.question.id).value.reviewStatus, 'candidate');
  assert.equal(a.knowledge.learningObjectiveService.getObjective(created.objective.id).reviewStatus, 'candidate');
  await a.restart();
  a.knowledge.learningObjectiveService.confirmObjective(created.objective.id);
  a.knowledge.questionService.validateQuestion(created.question.id); a.knowledge.questionService.confirmQuestion(created.question.id);
  await a.engine.sync(); clean(a);
  assert.deepEqual(operations[0], operations[1]);
  assert.equal(cloud.knowledge.learningObjectiveService.getObjective(created.objective.id).objective, '能够解释临时前像之后的目标');
  assert.equal(cloud.knowledge.questionService.getQuestion(created.question.id).reviewStatus, 'confirmed');
  assert.equal(a.knowledge.questionService.getQuestion(created.question.id).reviewStatus, 'confirmed');
  assert.equal(a.store.readSync(db => readExamFocusReviewBoundaries(db).length), 0);
});

test('考点旧审阅上传冻结时后继归档恢复与重新确认保留两个绑定，旧ack仅消费旧条目', async t => {
  const cloud = await fixture(t); let lose = true;
  const a = cloud.device('review-late', async (url, options) => {
    const response = await fetch(url, options);
    if (url.endsWith('/batch') && lose) { lose = false; throw new Error('模拟旧审阅冻结'); }
    return response;
  }); await a.connect(); const created = assets(a.knowledge);
  a.knowledge.learningObjectiveService.updateObjective(created.objective.id, { objective: '能够解释第一次后继内容' });
  await a.engine.sync(); assert(a.engine.status().error);
  const frozen = nextEntityUpload(a.store);
  a.knowledge.learningObjectiveService.confirmObjective(created.objective.id);
  a.knowledge.examFocusService.archive(created.focus.id); a.knowledge.examFocusService.restore(created.focus.id);
  a.knowledge.examFocusService.update(created.focus.id, { description: '后继人工重新确认的考点' });
  a.knowledge.examFocusService.confirm(created.focus.id);
  assert.equal(a.store.readSync(db => readExamFocusReviewBoundaries(db).length), 2);
  assert.deepEqual(nextEntityUpload(a.store), frozen);
  await a.restart(); await a.engine.sync(); clean(a);
  assert.equal(cloud.knowledge.examFocusService.get(created.focus.id).description, '后继人工重新确认的考点');
  assert.equal(a.store.readSync(db => readExamFocusReviewBoundaries(db).length), 0);
});

test('考点确认后真实远端父依赖 CAS 变化进入可恢复冲突，禁止采用本地旧审阅自动确认', async t => {
  const cloud = await fixture(t); const created = assets(cloud.knowledge); const a = cloud.device('review-cas-a'); const b = cloud.device('review-cas-b'); await a.connect(); await b.connect();
  const profile = a.knowledge.examProfileService.create({ name: '独立考点配置' }); await a.engine.sync(); clean(a); await b.engine.sync(); clean(b);
  const focus = a.knowledge.examFocusService.create({ examProfileId: profile.id, learningObjectiveId: created.objective.id, description: '实际本地审阅' }); a.knowledge.examFocusService.confirm(focus.id);
  b.knowledge.learningObjectiveService.updateObjective(created.objective.id, { objective: '能够解释另一设备后来变更的内容' }); b.knowledge.learningObjectiveService.confirmObjective(created.objective.id);
  await b.engine.sync(); clean(b); await a.engine.sync();
  const conflict = a.engine.status().entityConflict; assert(conflict, JSON.stringify(a.engine.status()));
  assert.equal(a.knowledge.examFocusService.get(focus.id).reviewStatus, 'confirmed');
  await assert.rejects(a.engine.resolve({ conflictId: conflict.id, choice: 'local' }), /考点审阅依赖已变化/);
  assert.equal(cloud.store.state.examFocuses.some(row => row.id === focus.id), false);
  await a.engine.resolve({ conflictId: conflict.id, choice: 'remote' }); clean(a);
  assert(a.engine.recovery().some(record => record.local?.examFocuses?.some(row => row.id === focus.id)));
});

test('考点私有审阅队列 JSON null、父前像 hash 损坏均 fail closed，实体/outbox/metadata保留', async t => {
  const cloud = await fixture(t); const a = cloud.device('review-corrupt'); await a.connect(); assets(a.knowledge);
  const queue = a.store.readSync(db => readMeta(db, 'examFocusReviewQueue'));
  for (const invalid of [null, [{ ...queue[0], parents: queue[0].parents.map((parent, index) => index ? parent : { ...parent, value: { ...parent.value, objective: '损坏前像' } }) }]]) {
    a.store.metadataTransaction(db => writeMeta(db, 'examFocusReviewQueue', invalid));
    const before = structuredClone(a.store.state); const outbox = a.store.readOutbox();
    const metadata = a.store.readSync(db => db.prepare('SELECT * FROM metadata ORDER BY key').all());
    assert.throws(() => nextEntityUpload(a.store), error => error.code === 'LOCAL_EXAM_FOCUS_REVIEW_INVALID');
    assert.deepEqual(a.store.state, before); assert.deepEqual(a.store.readOutbox(), outbox);
    assert.deepEqual(a.store.readSync(db => db.prepare('SELECT * FROM metadata ORDER BY key').all()), metadata);
    a.store.metadataTransaction(db => writeMeta(db, 'examFocusReviewQueue', queue));
  }
});

test('考点审阅队列 JSON null 重启也拒绝且不改 SQLite 实体/outbox/全部metadata', async t => {
  const cloud = await fixture(t); const a = cloud.device('review-startup'); await a.connect(); assets(a.knowledge);
  const queue = a.store.readSync(db => readMeta(db, 'examFocusReviewQueue'));
  a.store.metadataTransaction(db => writeMeta(db, 'examFocusReviewQueue', null));
  const snapshot = a.store.readSync(db => ({ entities: db.prepare('SELECT * FROM entities ORDER BY collection,id').all(), outbox: db.prepare('SELECT * FROM sync_outbox ORDER BY sequence').all(), metadata: db.prepare('SELECT * FROM metadata ORDER BY key').all() }));
  await a.engine.close(); a.store.close();
  const file = path.join(cloud.root, 'review-startup', 'local.sqlite');
  assert.throws(() => createSqliteDataStore(file), error => error.code === 'LOCAL_EXAM_FOCUS_REVIEW_INVALID');
  const db = new DatabaseSync(file);
  try {
    assert.deepEqual({ entities: db.prepare('SELECT * FROM entities ORDER BY collection,id').all(), outbox: db.prepare('SELECT * FROM sync_outbox ORDER BY sequence').all(), metadata: db.prepare('SELECT * FROM metadata ORDER BY key').all() }, snapshot);
    writeMeta(db, 'examFocusReviewQueue', queue);
  } finally { db.close(); }
  // fixture cleanup 继续使用正常重新打开的实例。
  Object.assign(a, openWorkspace(path.dirname(file)));
  a.engine = createSyncEngine(a.store, { autoSync: false, noteService: a.knowledge.noteService, entityTransfer: createAttachmentTransfer({ uploadsDir: path.join(path.dirname(file), 'uploads'), storageRootDir: path.dirname(file) }) });
});

test('来源笔记在考点确认后编辑，有限来源闭包前像交付后最新正文和失效审核状态保持', async t => {
  const cloud = await fixture(t); const a = cloud.device('review-source-a'); const b = cloud.device('review-source-b'); await a.connect(); await b.connect();
  const note = a.knowledge.noteService.createNote({ title: '考点来源', rawMarkdown: '这是需要学习的原始知识。', spaceId: a.space.id });
  const anchor = anchorFromProjectedRange(projectMarkdown(note.rawMarkdown), 0, 7);
  const annotation = a.knowledge.contentAnnotationService.createAnnotation({ spaceId: note.spaceId, noteId: note.id, schemaVersion: 2, scopeType: 'selection', quoteText: anchor.quoteText,
    fromPosition: anchor.sourceStart, toPosition: anchor.sourceEnd, anchorFingerprint: 'focus-source', anchor, noteContentHash: calculateContentHash(note.rawMarkdown), idempotencyKey: 'focus-source' });
  const { item } = a.knowledge.knowledgeItemService.createCandidate({ title: '有引用的知识', canonicalStatement: '可解释的原始知识', sourceMode: 'annotation', evidence: [{ sourceType: 'annotation', annotationId: annotation.id, expectedAnnotationRevision: annotation.revision }] }); a.knowledge.knowledgeItemService.confirmItem(item.id);
  const objective = a.knowledge.learningObjectiveService.createCandidate({ knowledgeItemId: item.id, objective: '能够解释原始知识含义', actionVerb: 'explain', cognitiveLevel: 'understand' }); a.knowledge.learningObjectiveService.confirmObjective(objective.id);
  const profile = a.knowledge.examProfileService.create({ name: '来源考点' }); const focus = a.knowledge.examFocusService.create({ examProfileId: profile.id, learningObjectiveId: objective.id, description: '按原始引用确认' }); a.knowledge.examFocusService.confirm(focus.id);
  a.knowledge.noteService.updateNote(note.id, { rawMarkdown: '后来完全替换的最新正文。' });
  await a.restart(); await a.engine.sync(); clean(a); await b.engine.sync(); clean(b);
  assert.equal(b.knowledge.noteService.getNote(note.id).rawMarkdown, '后来完全替换的最新正文。');
  assert.equal(b.knowledge.knowledgeItemService.getItem(item.id).reviewStatus, 'needsRevision');
  assert.equal(b.knowledge.learningObjectiveService.getObjective(objective.id).reviewStatus, 'candidate');
  assert.equal(b.knowledge.examFocusService.get(focus.id).reviewStatus, 'confirmed');
});

test('真实 PostgreSQL 六集合双 SQLite HTTP 同步，解除再关联同唯一组合先删除旧 ID', { skip: !process.env.KNOWRA_SYNC_TEST_DATABASE_URL, timeout: 60000 }, async t => {
  const cloud = await fixture(t, { postgres: true });
  const a = cloud.device('pg-a'); const b = cloud.device('pg-b'); await a.connect(); await b.connect();
  const created = assets(a.knowledge); await a.engine.sync(); clean(a); await b.engine.sync(); clean(b);
  for (const model of ['learningObjective', 'examProfile', 'examFocus', 'question', 'questionObjective', 'questionSource']) assert.equal(await cloud.context.prisma[model].count(), 1, model);
  const oldId = a.store.state.questionObjectives[0].id;
  // 两个本地业务事务折叠到同一上传，实际 PG 唯一键仍要求删除优先。
  a.knowledge.questionService.updateQuestion(created.question.id, { learningObjectiveIds: [] });
  a.knowledge.questionService.updateQuestion(created.question.id, { learningObjectiveIds: [created.objective.id] });
  const newId = a.store.state.questionObjectives[0].id; assert.notEqual(newId, oldId);
  await a.engine.sync(); clean(a); await b.engine.sync(); clean(b);
  assert.equal(await cloud.context.prisma.questionObjective.findUnique({ where: { id: oldId } }), null);
  assert.equal((await cloud.context.prisma.questionObjective.findUnique({ where: { id: newId } })).learningObjectiveId, created.objective.id);
  assert.equal(b.store.state.questionObjectives[0].id, newId);
  a.knowledge.trainingAssetLifecycle.trash('examProfile', created.profile.id); await a.engine.sync(); clean(a); await b.engine.sync(); clean(b);
  b.knowledge.trainingAssetLifecycle.restore('examProfile', created.profile.id); await b.engine.sync(); clean(b); await a.engine.sync(); clean(a);
  assert.equal((await cloud.context.prisma.examProfile.findUnique({ where: { id: created.profile.id } })).deletedAt, null);
});
