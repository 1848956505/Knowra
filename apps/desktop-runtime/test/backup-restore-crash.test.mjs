import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { startLocalRuntime } from '../src/runtime-server.mjs';
import { backupPath, inspectRuntimeBackup } from '../src/backup.mjs';
import { readActiveDirectory } from '../src/restore-directory.mjs';

const boundaries = {
  'during-copy': 'first-staging-file-copied',
  'before-pointer': 'complete-dataset-before-pointer',
  'after-pointer': 'pointer-published-before-response'
};
for (const [phase, boundary] of Object.entries(boundaries)) {
  test(`真实恢复子进程SIGKILL：${phase} 重启选择完整资料并保留恢复点及删除事实`, { timeout: 30000 }, async t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'knowra-restore-crash-'));
    let runtime;
    const child = fork(new URL('./fixtures/backup-restore-crash-child.mjs', import.meta.url), [root, phase],
      { execArgv: [], stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk; });
    t.after(async () => {
      if (child.exitCode === null && child.signalCode === null) {
        const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited;
      }
      await runtime?.close();
      fs.rmSync(root, { recursive: true, force: true });
    });
    const ready = new Promise(resolve => {
      let output = '';
      child.stdout.on('data', chunk => { output += chunk; if (output.includes('boundary-ready\n')) resolve(); });
    });
    await Promise.race([ready, once(child, 'exit').then(() => { throw new Error(`未到边界：${stderr}`); })]);
    const exited = once(child, 'exit'); child.kill('SIGKILL');
    assert.equal((await exited)[1], 'SIGKILL', stderr);
    const evidence = JSON.parse(fs.readFileSync(path.join(root, 'boundary.json'), 'utf8'));
    assert.equal(evidence.boundary, boundary);
    const dataDirectory = path.join(root, 'data');
    const published = phase === 'after-pointer';
    const active = readActiveDirectory(dataDirectory);
    assert.equal(active === dataDirectory, !published);
    const pointer = published ? JSON.parse(fs.readFileSync(path.join(dataDirectory, 'active-dataset.json'), 'utf8')) : null;
    // 真实重启须回收强杀遗留的实例锁，不能手动删锁或指定恢复候选目录。
    runtime = await startLocalRuntime({ dataDirectory, distRoot: path.join(root, 'dist'), syncOptions: { autoSync: false } });
    const cookie = (await fetch(runtime.launchUrl, { redirect: 'manual' })).headers.get('set-cookie').split(';')[0];
    const request = async (route, method = 'GET', body, dataset = runtime.store.getStatus().datasetId) => {
      const response = await fetch(`${runtime.origin}${route}`, { method,
        headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-Knowra-Dataset': dataset },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      return { status: response.status, ...(await response.json()) };
    };
    const status = runtime.store.getStatus();
    assert.equal(status.datasetId === evidence.datasetId, !published);
    assert.equal(runtime.store.state.notes.find(note => note.id === evidence.noteId).rawMarkdown, published ? '备份正文' : '恢复前正文');
    assert.deepEqual(runtime.store.readOutbox(), published ? evidence.backupQueue : evidence.currentQueue);
    assert.equal(runtime.store.deletionFacts.has('tags', evidence.deletedTagId), true);
    assert.equal(runtime.store.state.tags.some(tag => tag.id === evidence.deletedTagId), false);
    assert.deepEqual(runtime.store.readSync(db => db.prepare('SELECT * FROM deletion_facts ORDER BY collection,entity_id').all().map(row => ({ ...row }))), evidence.deletionRows);
    assert.equal(runtime.store.readSync(db => db.prepare("SELECT value FROM metadata WHERE key='deletionFactsScope'").get().value), evidence.deletionScope);
    assert.deepEqual(runtime.store.deletionFacts.getCoverage(), evidence.deletionCoverage);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dataDirectory, 'recovery-drafts.json'), 'utf8')), evidence.currentDrafts);
    const source = backupPath(dataDirectory, evidence.backupId);
    assert.equal(inspectRuntimeBackup(source).valid, true);
    async function attachmentReadable() {
      const response = await fetch(`${runtime.origin}/api/storage/attachments/${evidence.attachmentId}/content`, {
        headers: { Cookie: cookie, 'X-Knowra-Dataset': runtime.store.getStatus().datasetId } });
      assert.equal(response.status, 200); assert.equal(await response.text(), 'synthetic attachment');
    }
    await attachmentReadable();
    if (published) {
      assert.equal(runtime.store.readSync(db => db.prepare("SELECT value FROM metadata WHERE key = 'sync:clientPaused'").get().value), 'true');
      assert.equal((await request(`/api/knowledge/notes/${evidence.noteId}`, 'PATCH', { rawMarkdown: '旧窗口覆盖' }, evidence.datasetId)).error.code, 'LOCAL_DATASET_CHANGED');
      const protection = backupPath(dataDirectory, pointer.protectionBackupId);
      assert.equal(inspectRuntimeBackup(protection).purpose, 'before-restore');
      const db = new DatabaseSync(path.join(protection, 'local.sqlite'), { readOnly: true });
      try {
        assert.equal(JSON.parse(db.prepare("SELECT payload FROM entities WHERE collection = 'notes' AND id = ?").get(evidence.noteId).payload).rawMarkdown, '恢复前正文');
      } finally { db.close(); }
      // 实际使用保护备份恢复回来，证明它不是仅有目录/清单的空恢复点。
      const restored = await request(`/api/local-runtime/backups/${pointer.protectionBackupId}/restore`, 'POST', { confirmBackupId: pointer.protectionBackupId });
      assert.equal(restored.status, 200, JSON.stringify(restored));
      assert.notEqual(runtime.store.getStatus().datasetId, status.datasetId);
      assert.equal(runtime.store.state.notes.find(note => note.id === evidence.noteId).rawMarkdown, '恢复前正文');
      assert.deepEqual(runtime.store.readOutbox(), evidence.currentQueue);
      assert.deepEqual(runtime.store.readSync(db => db.prepare('SELECT * FROM deletion_facts ORDER BY collection,entity_id').all().map(row => ({ ...row }))), evidence.deletionRows);
      await attachmentReadable();
    } else if (phase === 'before-pointer') {
      const backups = (await request('/api/local-runtime/backups')).data.items;
      assert.equal(backups.filter(item => item.purpose === 'before-restore').length, 1);
      assert.equal(inspectRuntimeBackup(backupPath(dataDirectory, backups.find(item => item.purpose === 'before-restore').id)).valid, true);
    }
    const saved = await request(`/api/knowledge/notes/${evidence.noteId}`, 'PATCH', {
      rawMarkdown: '强杀后仍可编辑', expectedUpdatedAt: runtime.store.state.notes.find(note => note.id === evidence.noteId).updatedAt });
    assert.equal(saved.status, 200, JSON.stringify(saved));
    const resurrection = await request('/api/knowledge/tags', 'POST', {
      id: evidence.deletedTagId, name: '禁止强杀后复活', spaceId: runtime.store.state.notes.find(note => note.id === evidence.noteId).spaceId });
    assert.equal(resurrection.status, 409, JSON.stringify(resurrection));
    assert.equal(resurrection.error.code, 'LOCAL_DELETION_FACT_CONFLICT');
  });
}
