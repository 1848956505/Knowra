import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { startLocalRuntime } from '../src/runtime-server.mjs';
import { inspectRuntimeBackup, backupPath, validateBackupDrafts } from '../src/backup.mjs';
import { readActiveDirectory } from '../src/restore-directory.mjs';
import { createSqliteDataStore } from '../src/sqlite-data-store.mjs';
import { temporaryDirectory } from './helpers.mjs';

async function setup(t) {
  const root = temporaryDirectory(t);
  const distRoot = path.join(root, 'dist'); fs.mkdirSync(distRoot);
  fs.writeFileSync(path.join(distRoot, 'index.html'), '<html><head></head><body>测试</body></html>');
  const options = { dataDirectory: path.join(root, 'data'), distRoot, syncOptions: { autoSync: false } };
  let runtime = await startLocalRuntime(options);
  let cookie;
  let datasetId;
  async function connect() {
    cookie = (await fetch(runtime.launchUrl, { redirect: 'manual' })).headers.get('set-cookie').split(';')[0];
    datasetId = runtime.store.getStatus().datasetId;
  }
  await connect();
  t.after(async () => runtime.close());
  const request = async (route, method = 'GET', body, dataset = datasetId) => {
    const response = await fetch(`${runtime.origin}${route}`, { method, headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-Knowra-Dataset': dataset }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, ...(await response.json()) };
  };
  const space = (await request('/api/knowledge/spaces/default', 'POST', {})).data;
  const note = (await request('/api/knowledge/notes', 'POST', { spaceId: space.id, title: '备份恢复测试', rawMarkdown: '备份正文' })).data;
  return { options, request, note, headers: () => ({ Cookie: cookie, 'Content-Type': 'application/json', 'X-Knowra-Dataset': datasetId }), runtime: () => runtime, dataset: () => datasetId,
    adoptDataset() { datasetId = runtime.store.getStatus().datasetId; },
    async restart() { await runtime.close(); runtime = await startLocalRuntime(options); await connect(); }
  };
}

test('知识和正文恢复草稿共同备份并原样导出；缺失知识 CAS 或伪造候选 id 拒绝备份', async t => {
  const app = await setup(t);
  const form = { title: '未保存知识', canonicalStatement: '陈述', userExplanation: '', knowledgeType: 'concept' };
  const draft = { version: 1, kind: 'edit', candidateId: 'k1', initialValue: form, value: { ...form, title: '草稿修改' }, expectedUpdatedAt: 'original-version' };
  const key = `knowra:knowledge-draft:v1:${JSON.stringify([app.dataset(), 'k1'])}`;
  const recoveryDrafts = { version: 1, drafts: { [key]: draft, 'knowra:note-draft:v1:["space","note"]': { markdown: '笔记草稿', baseMarkdown: '正文' } } };
  const backup = await app.request('/api/local-runtime/backup', 'POST', { recoveryDrafts });
  assert.equal(backup.status, 201);
  assert.deepEqual((await app.request(`/api/local-runtime/backups/${backup.data.id}/drafts`)).data, recoveryDrafts);
  assert.equal((await app.request(`/api/local-runtime/backups/${backup.data.id}/inspect`, 'POST', {})).data.draftCount, 2);
  assert.throws(() => validateBackupDrafts({ version: 1, drafts: { [key]: { ...draft, expectedUpdatedAt: undefined } } }));
  assert.throws(() => validateBackupDrafts({ version: 1, drafts: { [key]: { ...draft, candidateId: 'other' } } }));
});

test('备份检查可重复；恢复保留保护备份/草稿/队列，隔离旧窗口，并可重启继续读取', async t => {
  const app = await setup(t);
  const { request, note, options } = app;
  const attachment = await request('/api/storage/attachments', 'POST', { noteId: note.id, fileName: '附件.txt', contentBase64: Buffer.from('附件原文').toString('base64') });
  assert.equal(attachment.status, 201);
  const originalDataset = app.dataset();
  const drafts = { version: 1, drafts: { [`knowra:note-draft:v1:${JSON.stringify([originalDataset, note.id])}`]: { markdown: '未解决草稿', baseMarkdown: '备份正文' } } };
  fs.writeFileSync(path.join(options.dataDirectory, 'recovery-drafts.json'), JSON.stringify(drafts));
  const backup = (await request('/api/local-runtime/backup', 'POST', {})).data;
  const expectedQueue = app.runtime().store.readOutbox();
  for (let count = 0; count < 3; count++) {
    const checked = await request(`/api/local-runtime/backups/${backup.id}/inspect`, 'POST', {});
    assert.equal(checked.status, 200, JSON.stringify(checked));
    assert.equal(checked.data.noteCount, 1); assert.equal(checked.data.draftCount, 1);
  }
  assert.deepEqual((await request(`/api/local-runtime/backups/${backup.id}/drafts`)).data, drafts);
  await request(`/api/knowledge/notes/${note.id}`, 'PATCH', { rawMarkdown: '恢复前正文', expectedUpdatedAt: note.updatedAt });
  const protectedQueue = app.runtime().store.readOutbox();
  const missingConfirmation = await request(`/api/local-runtime/backups/${backup.id}/restore`, 'POST', {});
  assert.equal(missingConfirmation.status, 422);
  const restored = await request(`/api/local-runtime/backups/${backup.id}/restore`, 'POST', { confirmBackupId: backup.id });
  assert.equal(restored.status, 200, JSON.stringify(restored));
  assert.equal(restored.data.syncPaused, true);
  assert.notEqual(restored.data.datasetId, originalDataset);
  assert.equal(app.runtime().store.state.notes.find(item => item.id === note.id).rawMarkdown, '备份正文');
  assert.deepEqual(app.runtime().store.readOutbox(), expectedQueue);
  assert.equal((await request(`/api/knowledge/notes/${note.id}`, 'PATCH', { rawMarkdown: '旧窗口错误覆盖' })).error.code, 'LOCAL_DATASET_CHANGED');
  const oldStore = createSqliteDataStore(path.join(options.dataDirectory, 'local.sqlite'));
  try { assert.deepEqual(oldStore.readOutbox(), protectedQueue); assert.equal(oldStore.state.notes[0].rawMarkdown, '恢复前正文'); } finally { oldStore.close(); }
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(options.dataDirectory, 'recovery-drafts.json'), 'utf8')), drafts);
  app.adoptDataset();
  const protection = (await request('/api/local-runtime/backups')).data.items.find(item => item.id === restored.data.protectionBackupId);
  assert.equal(protection.purpose, 'before-restore');
  assert.equal(inspectRuntimeBackup(backupPath(options.dataDirectory, protection.id)).pendingOperations, protectedQueue.length);
  const restoredDataset = app.dataset();
  await app.restart();
  assert.equal(app.dataset(), restoredDataset);
  assert.equal((await request(`/api/knowledge/notes/${note.id}`)).data.rawMarkdown, '备份正文');
  assert.deepEqual(app.runtime().store.readOutbox(), expectedQueue);
  assert.equal(app.runtime().store.readSync(db => db.prepare("SELECT value FROM metadata WHERE key = 'sync:clientPaused'").get().value), 'true');
  assert.equal(readActiveDirectory(options.dataDirectory), restored.data.directory);
});

test('损坏附件或非法路径拒绝恢复，现有资料仍可继续写入', async t => {
  const app = await setup(t);
  const { request, note } = app;
  const attachment = (await request('/api/storage/attachments', 'POST', { noteId: note.id, fileName: '样本.txt', contentBase64: Buffer.from('文件内容').toString('base64') })).data;
  const backup = (await request('/api/local-runtime/backup', 'POST', {})).data;
  const file = path.join(backup.directory, 'uploads', `${attachment.id}-${attachment.fileName}`);
  fs.writeFileSync(file, '坏内容');
  assert.equal((await request(`/api/local-runtime/backups/${backup.id}/inspect`, 'POST', {})).status, 422);
  // 即使文件清单重新签名，数据库中的附件哈希仍必须一致。
  const manifestFile = path.join(backup.directory, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const entry = manifest.files.find(item => item.path.startsWith('uploads/'));
  entry.sha256 = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  fs.writeFileSync(manifestFile, JSON.stringify(manifest));
  assert.match((await request(`/api/local-runtime/backups/${backup.id}/restore`, 'POST', { confirmBackupId: backup.id })).error.message, /附件/);
  assert.equal(readActiveDirectory(app.options.dataDirectory), app.options.dataDirectory);
  assert.equal((await request(`/api/knowledge/notes/${note.id}`, 'PATCH', { rawMarkdown: '失败后继续编辑', expectedUpdatedAt: note.updatedAt })).status, 200);
  assert.throws(() => backupPath(app.options.dataDirectory, '../elsewhere'), /编号/);
});

test('保护备份创建失败时停止恢复并重建可用的原资料服务', async t => {
  const app = await setup(t);
  const { request, note } = app;
  const backup = (await request('/api/local-runtime/backup', 'POST', {})).data;
  // 草稿符号链接触发保护备份失败，不能发布活动资料指针。
  fs.symlinkSync(path.join(backup.directory, 'local.sqlite'), path.join(app.options.dataDirectory, 'recovery-drafts.json'));
  const result = await request(`/api/local-runtime/backups/${backup.id}/restore`, 'POST', { confirmBackupId: backup.id });
  assert.equal(result.status, 422); assert.match(result.error.message, /符号链接/);
  assert.equal(readActiveDirectory(app.options.dataDirectory), app.options.dataDirectory);
  assert.equal((await request(`/api/knowledge/notes/${note.id}`, 'PATCH', { rawMarkdown: '仍可保存', expectedUpdatedAt: note.updatedAt })).status, 200);
  assert.equal(app.runtime().store.state.notes[0].rawMarkdown, '仍可保存');
});

test('浏览器恢复草稿随手动/恢复前保护备份保存，非法草稿拒绝而非写任意路径', async t => {
  const app = await setup(t);
  const key = `knowra:note-draft:v1:${JSON.stringify(['desktop:dataset:space', app.note.id])}`;
  const recoveryDrafts = { version: 1, drafts: { [key]: { markdown: '浏览器未保存正文', baseMarkdown: '备份正文' } } };
  const created = await app.request('/api/local-runtime/backup', 'POST', { recoveryDrafts });
  assert.equal(created.status, 201);
  assert.deepEqual((await app.request(`/api/local-runtime/backups/${created.data.id}/drafts`)).data, recoveryDrafts);
  const restored = await app.request(`/api/local-runtime/backups/${created.data.id}/restore`, 'POST', { confirmBackupId: created.data.id, recoveryDrafts });
  assert.equal(restored.status, 200);
  app.adoptDataset();
  assert.deepEqual((await app.request(`/api/local-runtime/backups/${restored.data.protectionBackupId}/drafts`)).data, recoveryDrafts);
  const invalid = await app.request('/api/local-runtime/backup', 'POST', { recoveryDrafts: { version: 1, drafts: { '../../outside': { markdown: 'a', baseMarkdown: 'b' } } } });
  assert.notEqual(invalid.status, 201);
  assert.equal(fs.existsSync(path.join(app.options.dataDirectory, 'outside')), false);
});


test('恢复等待既有写请求完成，停写期间的新请求拒绝，保护备份包含最后一次保存', async t => {
  const app = await setup(t);
  const backup = (await app.request('/api/local-runtime/backup', 'POST', {})).data;
  let completeBody;
  const writing = new Promise((resolve, reject) => {
    const request = http.request(`${app.runtime().origin}/api/knowledge/notes/${app.note.id}`, { method: 'PATCH', headers: app.headers() }, response => {
      let body = ''; response.on('data', chunk => { body += chunk; }); response.on('end', () => resolve({ status: response.statusCode, ...JSON.parse(body) }));
    });
    request.on('error', reject);
    request.write('{"rawMarkdown":"切换前最后保存",');
    completeBody = () => request.end(`"expectedUpdatedAt":${JSON.stringify(app.note.updatedAt)}}`);
  });
  // 等候请求进入服务端 parseBody，模拟附件/正文尚在传输。
  await new Promise(resolve => setTimeout(resolve, 20));
  const restoring = app.request(`/api/local-runtime/backups/${backup.id}/restore`, 'POST', { confirmBackupId: backup.id });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal((await app.request('/api/local-runtime/status')).status, 503);
  completeBody();
  assert.equal((await writing).status, 200);
  const result = await restoring;
  assert.equal(result.status, 200);
  const protectedStore = createSqliteDataStore(path.join(backupPath(app.options.dataDirectory, result.data.protectionBackupId), 'local.sqlite'));
  try { assert.equal(protectedStore.state.notes[0].rawMarkdown, '切换前最后保存'); } finally { protectedStore.close(); }
  app.adoptDataset();
  assert.equal((await app.request(`/api/knowledge/notes/${app.note.id}`)).data.rawMarkdown, '备份正文');
});

test('再次备份和重复恢复保留来源草稿；与当前草稿同键也不互相覆盖', async t => {
  const app = await setup(t);
  const key = `knowra:note-draft:v1:${JSON.stringify(['space', app.note.id])}`;
  const sourceDrafts = { version: 1, drafts: { [key]: { markdown: '备份来源草稿', baseMarkdown: '旧正文' } } };
  const currentDrafts = { version: 1, drafts: { [key]: { markdown: '恢复前同键的新草稿', baseMarkdown: '新正文' } } };
  const file = path.join(app.options.dataDirectory, 'recovery-drafts.json');
  fs.writeFileSync(file, JSON.stringify(sourceDrafts));
  let backup = (await app.request('/api/local-runtime/backup', 'POST', {})).data;
  fs.writeFileSync(file, JSON.stringify(currentDrafts));
  for (let round = 0; round < 2; round++) {
    const restored = await app.request(`/api/local-runtime/backups/${backup.id}/restore`, 'POST', { confirmBackupId: backup.id });
    assert.equal(restored.status, 200, JSON.stringify(restored));
    app.adoptDataset();
    const created = await app.request('/api/local-runtime/backup', 'POST', { recoveryDrafts: { version: 1, drafts: {} } });
    assert.equal(created.status, 201, JSON.stringify(created));
    backup = created.data;
    const exported = (await app.request(`/api/local-runtime/backups/${backup.id}/drafts`)).data;
    assert.deepEqual(exported.drafts, currentDrafts.drafts);
    assert.equal(exported.archivedDrafts.length, 1);
    assert.deepEqual(exported.archivedDrafts[0].drafts, sourceDrafts.drafts);
    const checked = await app.request(`/api/local-runtime/backups/${backup.id}/inspect`, 'POST', {});
    assert.equal(checked.data.draftCount, 2);
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), currentDrafts);
  }
});
