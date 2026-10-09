import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { reclaimFreeSpace } from '../src/sqlite-space-reclaim.mjs';
import { createSqliteDataStore } from '../src/sqlite-data-store.mjs';
import { temporaryDirectory } from './helpers.mjs';

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
