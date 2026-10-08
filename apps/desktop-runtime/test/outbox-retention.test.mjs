import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { OUTBOX_FULL_RETENTION, compactAcknowledgedOutbox } from '../src/outbox-retention.mjs';
import { openWorkspace, temporaryDirectory } from './helpers.mjs';

const BODY = '长正文'.repeat(500);

const addNote = (workspace, rawMarkdown, index = 0) => workspace.knowledge.noteService.createNote({ title: `笔记${index}-${rawMarkdown.length}`, rawMarkdown, spaceId: workspace.space.id });

function rows(root) {
  const db = new DatabaseSync(path.join(root, 'local.sqlite'));
  try { return db.prepare('SELECT sequence, operation_id, state, changes, dependencies FROM sync_outbox ORDER BY sequence').all(); } finally { db.close(); }
}

test('已确认行超出保留数后只剩元数据，近期与未确认行保持全文', t => {
  const root = temporaryDirectory(t);
  const workspace = openWorkspace(root);
  for (let index = 0; index < 6; index++) addNote(workspace, `${BODY}${index}`, index);
  const before = workspace.store.readOutbox();
  const total = before.length;
  assert(total > 4);
  workspace.store.metadataTransaction(db => {
    db.prepare("UPDATE sync_outbox SET state = 'acknowledged' WHERE sequence <= ?").run(total - 1);
    assert.equal(compactAcknowledgedOutbox(db, { keep: 2 }), total - 3);
    assert.equal(compactAcknowledgedOutbox(db, { keep: 2 }), 0);
  });
  const after = rows(root);
  assert.equal(after.length, total);
  assert.deepEqual(after.map(row => row.operation_id), before.map(row => row.operationId));
  assert.deepEqual(after.map(row => JSON.parse(row.dependencies)), before.map(row => row.dependencies));
  after.forEach((row, index) => {
    const changes = JSON.parse(row.changes);
    if (index < total - 3) {
      assert.equal(row.state, 'acknowledged');
      assert(changes.every(change => change.compacted && !('before' in change) && !('value' in change)));
      assert(!row.changes.includes('长正文'));
      assert.deepEqual(changes.map(({ collection, entityId, localRevision }) => ({ collection, entityId, localRevision })),
        before[index].changes.map(({ collection, entityId, localRevision }) => ({ collection, entityId, localRevision })));
    } else assert.deepEqual(changes, before[index].changes);
  });
  assert.equal(after.at(-1).state, 'pending');
  assert.equal(workspace.store.getStatus().pendingOperations, 1);
  workspace.store.close();
});

test('未确认行即使很多也不会被压缩', t => {
  const root = temporaryDirectory(t);
  const workspace = openWorkspace(root);
  addNote(workspace, BODY);
  const before = workspace.store.readOutbox();
  workspace.store.metadataTransaction(db => assert.equal(compactAcknowledgedOutbox(db, { keep: 0 }), 0));
  assert.deepEqual(workspace.store.readOutbox(), before);
  workspace.store.close();
});

test('重启时压缩历史库中的旧已确认行，之后继续写入与恢复正常', t => {
  const root = temporaryDirectory(t);
  let workspace = openWorkspace(root);
  for (let index = 0; index < OUTBOX_FULL_RETENTION + 3; index++) addNote(workspace, `${BODY}${index}`, index);
  const total = workspace.store.readOutbox().length;
  workspace.store.metadataTransaction(db => db.prepare("UPDATE sync_outbox SET state = 'acknowledged'").run());
  workspace.store.close();
  workspace = openWorkspace(root);
  const compacted = workspace.store.readOutbox().filter(row => row.changes.every(change => change.compacted));
  assert.equal(compacted.length, total - OUTBOX_FULL_RETENTION);
  const note = addNote(workspace, '重启后新增', 'new');
  assert.equal(workspace.knowledge.noteService.getNote(note.id).rawMarkdown, '重启后新增');
  assert.equal(workspace.store.getStatus().pendingOperations > 0, true);
  workspace.store.close();
});

test('正文内部的 compacted 标记不会跳过压缩，事务失败保留原始快照', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE sync_outbox(sequence INTEGER PRIMARY KEY, state TEXT, changes TEXT)');
  const original = JSON.stringify([{ collection: 'notes', entityId: 'n1', before: null, value: { compacted: true, rawMarkdown: BODY } }]);
  db.prepare('INSERT INTO sync_outbox VALUES (1, ?, ?)').run('acknowledged', original);
  try {
    db.exec('BEGIN');
    assert.equal(compactAcknowledgedOutbox(db, { keep: 0 }), 1);
    db.exec('ROLLBACK');
    assert.equal(db.prepare('SELECT changes FROM sync_outbox').get().changes, original);
    db.exec('BEGIN');
    assert.equal(compactAcknowledgedOutbox(db, { keep: 0 }), 1);
    assert.equal(compactAcknowledgedOutbox(db, { keep: 0 }), 0);
    db.exec('COMMIT');
    assert.deepEqual(JSON.parse(db.prepare('SELECT changes FROM sync_outbox').get().changes), [{ collection: 'notes', entityId: 'n1', compacted: true }]);
  } finally { db.close(); }
});
