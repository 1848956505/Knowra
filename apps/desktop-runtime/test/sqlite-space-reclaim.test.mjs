import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { reclaimFreeSpace } from '../src/sqlite-space-reclaim.mjs';
import { createSqliteDataStore } from '../src/sqlite-data-store.mjs';
import { temporaryDirectory, openWorkspace, createNote } from './helpers.mjs';

function bloatedDatabase(file, { remove = true } = {}) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; CREATE TABLE blobs (id INTEGER PRIMARY KEY, body BLOB)');
  const insert = db.prepare('INSERT INTO blobs (body) VALUES (?)');
  const chunk = Buffer.alloc(64 * 1024, 1);
  db.exec('BEGIN');
  for (let i = 0; i < 400; i++) insert.run(chunk);
  db.exec('COMMIT');
  if (remove) db.exec('DELETE FROM blobs WHERE id > 20');
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  return db;
}
const small = { minFreeBytes: 1024 * 1024 };

test('空闲页超过阈值时整理，保留剩余数据并缩小文件', t => {
  const file = path.join(temporaryDirectory(t), 'a.sqlite');
  const db = bloatedDatabase(file);
  const before = fs.statSync(file).size;
  const result = reclaimFreeSpace(db, file, small);
  assert.equal(result.reclaimed, true);
  assert.equal(db.prepare('SELECT count(*) AS n FROM blobs').get().n, 20);
  assert.ok(fs.statSync(file).size < before / 5, `${fs.statSync(file).size} 应远小于 ${before}`);
  db.close();
});

test('空闲页不多、磁盘余量不足或处于事务中时不整理', t => {
  const file = path.join(temporaryDirectory(t), 'b.sqlite');
  const full = bloatedDatabase(file, { remove: false });
  assert.equal(reclaimFreeSpace(full, file, small).reason, 'below-threshold');
  full.exec('DELETE FROM blobs WHERE id > 20');
  assert.equal(reclaimFreeSpace(full, file, { ...small, availableBytes: () => 1024 }).reason, 'low-disk-space');
  full.exec('BEGIN');
  assert.equal(reclaimFreeSpace(full, file, small).reason, 'in-transaction');
  full.exec('ROLLBACK');
  assert.equal(reclaimFreeSpace(full, file, small).reclaimed, true);
  full.close();
});

test('打开资料库时自动回收历史清理留下的空闲页，且业务数据不变', t => {
  const file = path.join(temporaryDirectory(t), 'local.sqlite');
  const first = createSqliteDataStore(file);
  const noteCount = first.state.notes.length;
  first.close();
  const db = new DatabaseSync(file);
  db.exec('CREATE TABLE scratch_blobs (id INTEGER PRIMARY KEY, body BLOB)');
  const insert = db.prepare('INSERT INTO scratch_blobs (body) VALUES (?)');
  const chunk = Buffer.alloc(64 * 1024, 1);
  db.exec('BEGIN');
  for (let i = 0; i < 3000; i++) insert.run(chunk);
  db.exec('COMMIT');
  db.exec('DROP TABLE scratch_blobs; PRAGMA wal_checkpoint(TRUNCATE)');
  db.close();
  const bloated = fs.statSync(file).size;
  const second = createSqliteDataStore(file);
  assert.equal(second.state.notes.length, noteCount);
  second.close();
  assert.ok(fs.statSync(file).size < bloated / 10, '应在打开时整理空闲页');
});

test('磁盘空间查询抛出 EIO 时跳过整理并保留数据，之后可以重试', t => {
  const file = path.join(temporaryDirectory(t), 'disk-error.sqlite');
  const db = bloatedDatabase(file);
  t.after(() => db.close());
  const before = fs.statSync(file).size;
  const error = Object.assign(new Error('injected statfs failure'), { code: 'EIO' });
  const result = reclaimFreeSpace(db, file, { ...small, availableBytes: () => { throw error; } });
  assert.equal(result.reason, 'failed');
  assert.equal(result.error, error);
  assert.equal(result.reclaimed, false);
  assert.equal(fs.statSync(file).size, before);
  assert.equal(db.prepare('SELECT count(*) AS n FROM blobs').get().n, 20);
  assert.equal(reclaimFreeSpace(db, file, small).reclaimed, true);
});

test('页统计、VACUUM、checkpoint 和整理后查询失败均不向调用方抛错', () => {
  for (const failure of ['PRAGMA page_size', 'PRAGMA page_count', 'PRAGMA freelist_count', 'VACUUM', 'PRAGMA wal_checkpoint(TRUNCATE)', 'after-count']) {
    const error = new Error(`injected ${failure}`);
    let countReads = 0;
    const db = {
      isTransaction: false,
      prepare(sql) {
        if (sql === 'PRAGMA page_count') countReads++;
        if (sql === failure || failure === 'after-count' && sql === 'PRAGMA page_count' && countReads === 2) throw error;
        return { get: () => ({ page_size: 4096, page_count: 100000, freelist_count: 90000 }) };
      },
      exec(sql) { if (sql === failure) throw error; }
    };
    const result = reclaimFreeSpace(db, 'unused.sqlite', { availableBytes: () => Number.MAX_SAFE_INTEGER });
    assert.equal(result.reason, 'failed', failure);
    assert.equal(result.error, error);
  }
});

test('启动中默认 statfsSync 抛出 EIO 后仍可打开、保存和再次打开本地资料库', t => {
  const root = temporaryDirectory(t), file = path.join(root, 'local.sqlite');
  const workspace = openWorkspace(root);
  createNote(workspace, '磁盘查询失败前的正文');
  const first = workspace.store;
  const notes = structuredClone(first.state.notes);
  first.close();
  const db = new DatabaseSync(file);
  db.exec('CREATE TABLE scratch (body BLOB); BEGIN');
  const insert = db.prepare('INSERT INTO scratch (body) VALUES (zeroblob(1048576))');
  for (let i = 0; i < 140; i++) insert.run();
  db.exec('COMMIT; DROP TABLE scratch; PRAGMA wal_checkpoint(TRUNCATE)');
  db.close();
  const statfs = fs.statfsSync;
  let queries = 0;
  fs.statfsSync = () => { queries++; throw Object.assign(new Error('disk EIO'), { code: 'EIO' }); };
  try {
    const second = createSqliteDataStore(file);
    try {
      assert.deepEqual(second.state.notes, notes);
      second.runTransaction(() => {
        second.state.notes[0].title = '磁盘查询失败后仍可保存';
        second.flush();
      });
    } finally { second.close(); }
    const third = createSqliteDataStore(file);
    try { assert.equal(third.state.notes[0].title, '磁盘查询失败后仍可保存'); }
    finally { third.close(); }
    assert.equal(queries, 2, '必须实际进入两次启动的空间检查');
  } finally { fs.statfsSync = statfs; }
});
