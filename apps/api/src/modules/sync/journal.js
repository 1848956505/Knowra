import { randomUUID, createHash } from 'node:crypto';
import { LOCAL_DATA_COLLECTIONS } from '../../infrastructure/local-data-schema.js';
import { createAppError } from '../../errors/app-error.js';

export const syncKey = (collection, id) => JSON.stringify([collection, id]);
export const syncError = (code, message, status = 409) => createAppError(code, message, status);
export const requestHash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const thenResult = (value, callback) => value && typeof value.then === 'function' ? value.then(callback) : callback(value);

export function createJournal(state) {
  const revisions = {};
  for (const collection of LOCAL_DATA_COLLECTIONS) for (const item of state[collection] ?? []) revisions[syncKey(collection, item.id)] = 1;
  return { version: 1, epoch: randomUUID(), head: 0, floor: 0, revisions, changes: [], receipts: {}, snapshots: {} };
}

export function loadJournal(value, state) {
  if (value === undefined) return createJournal(state);
  if (!value || value.version !== 1 || typeof value.epoch !== 'string'
    || !Number.isSafeInteger(value.head) || !Array.isArray(value.changes)
    || !value.revisions || !value.receipts || !value.snapshots) throw syncError('SYNC_STORAGE_INVALID', '同步日志格式无效，已停止加载。', 500);
  return structuredClone(value);
}

export function appendChanges(journal, before, after) {
  const items = [];
  for (const collection of LOCAL_DATA_COLLECTIONS) {
    const old = new Map((before[collection] ?? []).map(item => [item.id, item]));
    const next = new Map((after[collection] ?? []).map(item => [item.id, item]));
    for (const id of new Set([...old.keys(), ...next.keys()])) {
      const value = next.get(id) ?? null;
      if (JSON.stringify(old.get(id) ?? null) === JSON.stringify(value)) continue;
      const key = syncKey(collection, id);
      const revision = (journal.revisions[key] ?? 0) + 1;
      journal.revisions[key] = revision;
      items.push({ collection, id, revision, value: structuredClone(value) });
    }
  }
  if (items.length) journal.changes.push({ sequence: ++journal.head, items });
  // 只裁剪已完整提交的事务组；落后设备通过固定快照重新建立基线。
  const keep = 512;
  if (journal.changes.length > keep) {
    const removed = journal.changes.splice(0, journal.changes.length - keep);
    journal.floor = removed.at(-1).sequence;
  }
  let bytes = journal.changes.reduce((sum, group) => sum + Buffer.byteLength(JSON.stringify(group)), 0);
  while (journal.changes.length > 1 && bytes > 16 * 1024 * 1024) {
    const removed = journal.changes.shift();
    bytes -= Buffer.byteLength(JSON.stringify(removed)); journal.floor = removed.sequence;
  }
  for (const [id, snapshot] of Object.entries(journal.snapshots)) if (snapshot.expiresAt < Date.now()) delete journal.snapshots[id];
  return journal;
}

export function entriesFor(state, journal) {
  const current = new Map();
  for (const collection of LOCAL_DATA_COLLECTIONS) for (const item of state[collection] ?? []) current.set(syncKey(collection, item.id), item);
  return Object.entries(journal.revisions).map(([key, revision]) => {
    const [collection, id] = JSON.parse(key);
    return { collection, id, revision, value: structuredClone(current.get(key) ?? null) };
  });
}

export function cursorFor(journal, ownerId, sequence = journal.head) {
  return Buffer.from(JSON.stringify({ epoch: journal.epoch, ownerId, sequence })).toString('base64url');
}

export function readCursor(token, journal, ownerId) {
  let cursor;
  try { cursor = JSON.parse(Buffer.from(String(token), 'base64url').toString()); } catch { throw syncError('CURSOR_INVALID', '同步游标无效。', 422); }
  if (cursor.ownerId !== ownerId) throw syncError('CURSOR_INVALID', '同步游标不属于当前资料库。', 422);
  if (cursor.epoch !== journal.epoch) throw syncError('DATASET_CHANGED', '云端资料库已恢复或重建，需要重新核对基线。');
  if (!Number.isSafeInteger(cursor.sequence) || cursor.sequence < 0 || cursor.sequence > journal.head) throw syncError('CURSOR_INVALID', '同步游标超出有效范围。', 422);
  if (cursor.sequence < journal.floor) throw syncError('CURSOR_EXPIRED', '同步游标已过期，需要重新下载基线。');
  return cursor.sequence;
}

export const NOTE_FIELDS = ['title', 'rawMarkdown', 'spaceId', 'folderId', 'tagIds', 'favorite', 'status', 'sourceType', 'deleted'];
export function noteContent(note) {
  if (!note) return null;
  return Object.fromEntries(NOTE_FIELDS.map(key => [key, key === 'tagIds' ? [...(note.tagIds ?? [])].sort()
    : key === 'folderId' ? note.folderId ?? null : key === 'favorite' || key === 'deleted' ? Boolean(note[key]) : note[key] ?? null]));
}

export function rememberBatchReceipt(journal, key, hash, result, operation) {
  journal.deviceSequences ??= {};
  journal.deviceSequences[operation.deviceId] = Math.max(journal.deviceSequences[operation.deviceId] ?? 0, operation.sequence);
  journal.receipts[key] = { hash, result, sequence: operation.sequence };
  const receipts = Object.entries(journal.receipts).filter(([, receipt]) => receipt.sequence !== undefined);
  let bytes = receipts.reduce((sum, [, receipt]) => sum + Buffer.byteLength(JSON.stringify(receipt)), 0);
  while (receipts.length > 1 && (receipts.length > 512 || bytes > 16 * 1024 * 1024)) {
    const [oldKey, receipt] = receipts.shift(); bytes -= Buffer.byteLength(JSON.stringify(receipt)); delete journal.receipts[oldKey];
  }
}
