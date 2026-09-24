import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import {
  measureJsonStorage, measureManagedFiles, measureSqliteStorage
} from '../asset-storage-metrics.mjs';

const now = Date.parse('2026-09-24T00:00:00.000Z');

test('阶段4 JSON 只读统计区分正文、版本、来源、墓碑和备份，不输出资产内容', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'knowra-measure-json-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sourcePath = path.join(root, 'data.json');
  const document = {
    notes: [{ id: 'note-1', rawMarkdown: '中文正文', deleted: false }, { id: 'note-2', rawMarkdown: '已回收正文', deleted: true }],
    noteVersions: [{ id: 'version-1', noteId: 'note-1', content: '旧版内容', createdAt: '2026-09-23T00:00:00.000Z' }],
    knowledgeEvidence: [{ id: 'evidence-1', quoteText: '来源摘录' }],
    sync: { changes: [], tombstones: { one: { collection: 'notes', id: 'removed' } } }
  };
  fs.writeFileSync(sourcePath, JSON.stringify(document));
  const before = fs.readFileSync(sourcePath);
  const backupsDir = path.join(root, 'backups');
  const backup = path.join(backupsDir, 'backup-1');
  fs.mkdirSync(backup, { recursive: true });
  fs.writeFileSync(path.join(backup, 'manifest.json'), JSON.stringify({ purpose: 'manual', createdAt: '2026-09-20T00:00:00.000Z' }));
  fs.writeFileSync(path.join(backup, 'local.sqlite'), Buffer.alloc(15));
  const legacyBackup = path.join(backupsDir, 'backup-2');
  fs.mkdirSync(legacyBackup);
  fs.writeFileSync(path.join(legacyBackup, 'manifest.json'), JSON.stringify({ createdAt: '2026-09-19T00:00:00.000Z' }));
  const uploadsDir = path.join(root, 'uploads');
  fs.mkdirSync(uploadsDir);
  fs.writeFileSync(path.join(uploadsDir, 'file.bin'), Buffer.alloc(9));
  fs.symlinkSync(sourcePath, path.join(uploadsDir, 'outside-link'));
  const files = measureManagedFiles({ uploadsDir, tempDir: path.join(root, 'temp'), exportsDir: path.join(root, 'exports'), backupsDir });
  const report = measureJsonStorage({ sourcePath, files, now });
  assert.equal(report.content.currentNoteBodyBytes, Buffer.byteLength('中文正文'));
  assert.equal(report.content.recycledNoteBodyBytes, Buffer.byteLength('已回收正文'));
  assert.equal(report.content.noteVersionContentBytes, Buffer.byteLength('旧版内容'));
  assert.equal(report.content.versionCadence.last7Days, 1);
  assert.equal(report.sync.tombstones, 1);
  assert.equal(report.files.attachments.bytes, 9);
  assert.equal(report.files.attachments.symlinksSkipped, 1);
  assert.equal(report.files.backups.byPurpose.manual, 1);
  assert.equal(report.files.backups.byPurpose['legacy-unspecified'], 1);
  assert.equal(report.categories.backups.bytes, report.files.backups.bytes);
  assert.equal(report.categories.searchIndexes.dedicatedIndexBytes, null);
  assert.equal(report.policy.automaticRecyclePurge, 'disabled');
  assert.equal(fs.readFileSync(sourcePath).equals(before), true);
  assert(!JSON.stringify(report).includes('中文正文'));
  assert(!JSON.stringify(report).includes('note-1'));
});

test('阶段4 SQLite 只读统计报告表页、同步恢复占用和空版本集合', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'knowra-measure-sqlite-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sourcePath = path.join(root, 'local.sqlite');
  const db = new DatabaseSync(sourcePath);
  db.exec(`
    CREATE TABLE entities (collection TEXT, payload TEXT);
    CREATE TABLE sync_base (payload TEXT);
    CREATE TABLE sync_outbox (changes TEXT, state TEXT);
    CREATE TABLE sync_recovery (payload TEXT);
    CREATE TABLE sync_conflicts (payload TEXT);
    CREATE TABLE sync_uploads (request TEXT);
    CREATE TABLE local_revisions (id TEXT);
  `);
  db.prepare('INSERT INTO entities VALUES (?, ?)').run('notes', JSON.stringify({ id: 'note-1', rawMarkdown: '正文', deleted: false }));
  db.prepare('INSERT INTO sync_recovery VALUES (?)').run(JSON.stringify({ retained: '恢复副本' }));
  db.close();
  const before = fs.statSync(sourcePath).size;
  const files = measureManagedFiles({ uploadsDir: path.join(root, 'uploads'), tempDir: path.join(root, 'temp'), exportsDir: path.join(root, 'exports'), backupsDir: path.join(root, 'backups') });
  const report = measureSqliteStorage({ sourcePath, files, now });
  assert.equal(report.content.versionCount, 0);
  assert.equal(report.content.currentNoteBodyBytes, Buffer.byteLength('正文'));
  assert.equal(report.sync.tableCounts.sync_recovery, 1);
  assert(report.sync.tableAllocatedBytes.sync_recovery > 0);
  assert(report.categories.syncLog.bytes >= report.sync.tableAllocatedBytes.sync_recovery);
  assert.equal(report.database.fileBytes, before);
  assert.equal(fs.statSync(sourcePath).size, before);
  assert(!JSON.stringify(report).includes('恢复副本'));
});
