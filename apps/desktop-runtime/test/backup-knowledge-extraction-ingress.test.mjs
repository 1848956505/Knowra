import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { startLocalRuntime } from '../src/runtime-server.mjs';
import { readActiveDirectory } from '../src/restore-directory.mjs';
import { listRuntimeBackups } from '../src/backup.mjs';
import { extractionBackupFixture, copyBackup, selection, treeHashes } from './fixtures/extraction-backup.fixture.mjs';

test('坏提炼扩展在真实导入及HTTP恢复激活前拒绝，活动库、指针和来源均不变', async t => {
  const f = await extractionBackupFixture(t), dataDirectory = path.join(f.root, 'active');
  const distRoot = path.join(f.root, 'dist'); fs.mkdirSync(distRoot);
  fs.writeFileSync(path.join(distRoot, 'index.html'), '<html><head></head><body>合成恢复验收</body></html>');
  const runtime = await startLocalRuntime({ dataDirectory, distRoot, syncOptions: { autoSync: false } });
  t.after(() => runtime.close());
  const cookie = (await fetch(runtime.launchUrl, { redirect: 'manual' })).headers.get('set-cookie').split(';')[0];
  const request = async (route, method = 'GET', body) => {
    const response = await fetch(`${runtime.origin}${route}`, { method,
      headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-Knowra-Dataset': runtime.store.getStatus().datasetId },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, ...(await response.json()) };
  };
  const space = (await request('/api/knowledge/spaces/default', 'POST', {})).data;
  const note = (await request('/api/knowledge/notes', 'POST', { spaceId: space.id, title: '活动资料', rawMarkdown: '必须保留的活动正文' })).data;
  // 先建立真实活动指针，避免仅证明“本来就没有指针”。
  const valid = (await request('/api/local-runtime/backup', 'POST', {})).data;
  const restored = await request(`/api/local-runtime/backups/${valid.id}/restore`, 'POST', { confirmBackupId: valid.id });
  assert.equal(restored.status, 200);
  const currentStore = runtime.store, pointer = path.join(dataDirectory, 'active-dataset.json');
  const pointerBytes = fs.readFileSync(pointer), active = readActiveDirectory(dataDirectory);
  const state = () => ({ entities: structuredClone(runtime.store.state), outbox: runtime.store.readOutbox(),
    metadata: runtime.store.readSync(db => db.prepare('SELECT * FROM metadata ORDER BY key').all()) });
  const original = state();
  for (const [name, mutate] of [
    ['commit', db => db.exec("UPDATE knowledge_extraction_commits SET receipt_json = 'null'")],
    ['task', db => db.exec("UPDATE ai_knowledge_extraction_tasks SET descriptor_json = 'null'")]
  ]) await t.test(name, async () => {
    const source = copyBackup(f, `external-${name}`, mutate), sourceTree = treeHashes(source);
    const listed = listRuntimeBackups(dataDirectory);
    assert.throws(() => runtime.backupTransfer({ action: 'import', datasetId: runtime.store.getStatus().datasetId, selection: selection(source) }), /提炼/);
    assert.deepEqual(listRuntimeBackups(dataDirectory), listed, '坏备份不能进入内部列表');
    assert.deepEqual(treeHashes(source), sourceTree);
    const id = `${Date.now()}-${randomUUID()}`, managed = path.join(dataDirectory, 'backups', id);
    fs.cpSync(source, managed, { recursive: true });
    const managedTree = treeHashes(managed);
    const inspected = await request(`/api/local-runtime/backups/${id}/inspect`, 'POST', {});
    assert.equal(inspected.status, 422); assert.match(inspected.error.message, /提炼/);
    const result = await request(`/api/local-runtime/backups/${id}/restore`, 'POST', { confirmBackupId: id });
    assert.equal(result.status, 422); assert.match(result.error.message, /提炼/);
    assert.equal(runtime.store, currentStore, '应在关闭或替换当前store前拒绝');
    assert.deepEqual(state(), original);
    assert.deepEqual(fs.readFileSync(pointer), pointerBytes);
    assert.equal(readActiveDirectory(dataDirectory), active);
    assert.deepEqual(treeHashes(managed), managedTree);
    assert.deepEqual(treeHashes(source), sourceTree);
  });
  const updated = await request(`/api/knowledge/notes/${note.id}`, 'PATCH', { rawMarkdown: '拒绝后仍可编辑', expectedUpdatedAt: note.updatedAt });
  assert.equal(updated.status, 200);
  assert.equal((await request(`/api/knowledge/notes/${note.id}`)).data.rawMarkdown, '拒绝后仍可编辑');
  assert.equal(f.mock.calls.length, 1, '只读检查、导入与恢复拒绝不重放提炼');
});
