import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { compactHistory, fileDigest } from '../compact-history.mjs';
import { createFileDataStore } from '../../apps/api/src/infrastructure/file-data-store.js';
import { acquireDataFileWriteLock } from '../../apps/api/src/infrastructure/data-file-write-lock.js';
import { createAppContext } from '../../apps/api/src/app.factory.js';
import { NoteVersion } from '../../apps/api/src/modules/knowledge/domain/note-version.js';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'knowra-history-maintenance-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, 'library.json'), preview = path.join(root, 'preview.json'), backupDirectory = path.join(root, 'backups');
  const store = createFileDataStore(file);
  const context = createAppContext({ dataStore: store, storageRootDir: root });
  const k = context.modules.knowledge;
  const space = k.knowledgeSpaceService.createDefaultKnowledgeSpace({ userId: 'demo' });
  const note = k.noteService.createNote({ title: '不清理当前正文', rawMarkdown: '当前正文', spaceId: space.id });
  store.runSyncBatchTransaction(() => {
    for (let i = 0; i < 35; i++) store.state.noteVersions.push(new NoteVersion({ id: `old-${i}`, noteId: note.id,
      content: `旧正文${i}`, createdAt: new Date(Date.now() - (40 + i) * 86400000).toISOString() }));
  });
  return { root, file, preview, backupDirectory, store, note };
}

test('清理预览只读，应用先备份并在同一提交中生成墓碑，当前内容完整保留', async t => {
  const f = fixture(t), original = await fileDigest(f.file);
  const report = await compactHistory({ file: f.file });
  assert.equal(report.summary.noteVersions.removed, 35);
  assert.equal(await fileDigest(f.file), original);
  fs.writeFileSync(f.preview, JSON.stringify(report));
  const result = await compactHistory({ ...f, apply: true });
  assert.equal(result.mode, 'applied');
  assert.equal(await fileDigest(result.backupPath), original);
  const next = createFileDataStore(f.file);
  assert.deepEqual(next.state.notes, structuredClone(f.store.state.notes));
  assert.equal(next.state.noteVersions.length, 1);
  assert.equal(Object.values(next.getSyncJournal().tombstones).filter(item => item.collection === 'noteVersions').length, 35);
  assert.throws(() => f.store.runTransaction(() => { f.store.state.notes[0].title = '旧进程'; f.store.flush(); }),
    error => error.cause?.code === 'STORAGE_EXTERNAL_CHANGE', '清理后仍持有旧内存的进程也不能覆盖新文件');
  assert.ok(fs.statSync(f.file).size < result.beforeBytes + 20000, '同步墓碑有空间成本，但不保留旧正文');
});

test('预览后发生修改或规则摘要被改动时拒绝清理，不生成删除结果', async t => {
  const f = fixture(t);
  const report = await compactHistory({ file: f.file });
  fs.writeFileSync(f.preview, JSON.stringify({ ...report, planHash: 'wrong' }));
  const original = await fileDigest(f.file);
  await assert.rejects(compactHistory({ ...f, apply: true }), /规则或引用与预览不一致/);
  assert.equal(await fileDigest(f.file), original);
  fs.writeFileSync(f.preview, JSON.stringify(report));
  await assert.rejects(compactHistory({ ...f, apply: true, now: Date.now() + 25 * 3600000 }), /超过 24 小时/);
  assert.equal(await fileDigest(f.file), original);
  f.store.runTransaction(() => { f.store.state.notes[0].title = '清理预览后的修改'; f.store.flush(); });
  const updated = await fileDigest(f.file);
  await assert.rejects(compactHistory({ ...f, apply: true }), /预览后已变化/);
  assert.equal(await fileDigest(f.file), updated);
});

test('原子替换失败时主体和墓碑均不落盘，完整备份仍在并能安全重试', async t => {
  const f = fixture(t), original = await fileDigest(f.file);
  fs.writeFileSync(f.preview, JSON.stringify(await compactHistory({ file: f.file })));
  const rename = fs.renameSync;
  fs.renameSync = (from, to) => {
    if (to === f.file) throw new Error('injected history replacement failure');
    return rename(from, to);
  };
  try { await assert.rejects(compactHistory({ ...f, apply: true }), /persist local data safely/); }
  finally { fs.renameSync = rename; }
  assert.equal(await fileDigest(f.file), original);
  const backup = path.join(f.backupDirectory, fs.readdirSync(f.backupDirectory)[0]);
  assert.equal(await fileDigest(backup), original);
  assert.equal(createFileDataStore(f.file).state.noteVersions.length, 36);
  assert.equal((await compactHistory({ ...f, apply: true })).mode, 'applied');
});

test('维护锁阻止另一数据存储实例写入，锁释放后事务可重试', async t => {
  const f = fixture(t), original = await fileDigest(f.file);
  const competing = createFileDataStore(f.file), lock = acquireDataFileWriteLock(f.file);
  try {
    assert.throws(() => competing.runTransaction(() => {
      competing.state.notes[0].title = '并发保存'; competing.flush();
    }), error => error.code === 'STORAGE_WRITE_FAILED' && error.cause?.code === 'STORAGE_MAINTENANCE_BUSY');
    assert.equal(await fileDigest(f.file), original);
    assert.equal(competing.state.notes[0].title, f.note.title);
  } finally { lock.release(); }
  competing.runTransaction(() => { competing.state.notes[0].title = '重试成功'; competing.flush(); });
  assert.equal(createFileDataStore(f.file).state.notes[0].title, '重试成功');
});

test('已退出进程遗留的写锁可回收，存活进程持锁不被接管', t => {
  const f = fixture(t);
  const child = spawnSync(process.execPath, ['--input-type=module', '-e',
    'import {acquireDataFileWriteLock} from "./apps/api/src/infrastructure/data-file-write-lock.js"; acquireDataFileWriteLock(process.argv[1]);', f.file], { encoding: 'utf8' });
  assert.equal(child.status, 0, child.stderr);
  const lock = acquireDataFileWriteLock(f.file);
  try { assert.throws(() => acquireDataFileWriteLock(f.file), { code: 'STORAGE_MAINTENANCE_BUSY' }); }
  finally { lock.release(); }
});
