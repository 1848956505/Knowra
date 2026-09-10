import { assertSyncDeviceEnabled } from './rollout-policy.js';
import { randomUUID } from 'node:crypto';
import { cursorFor, readCursor, entriesFor, syncKey, syncError, requestHash, thenResult, NOTE_FIELDS } from './journal.js';

export function createSyncService(provider, ownerId) {
  const describe = journal => ({ protocolVersion: 1, entitySchemaVersion: 5, datasetEpoch: journal.epoch, ownerId, scope: 'notes', capabilities: ['atomic-entities-v2', 'attachment-transfer-v1'], pushEnabled: process.env.KNOWRA_SYNC_PUSH_ENABLED !== 'false', cursor: cursorFor(journal, ownerId) });
  return {
    device: ({ deviceId }) => provider.read((_state, journal) => ({ sequence: journal.deviceSequences?.[String(deviceId)] ?? 0 })),
    status: () => provider.read((_state, journal) => describe(journal)),
    bootstrap: () => provider.mutate((state, journal) => {
      for (const [id, snapshot] of Object.entries(journal.snapshots)) if (snapshot.expiresAt < Date.now()) delete journal.snapshots[id];
      if (Object.keys(journal.snapshots).length >= 8) throw syncError('SYNC_BUSY', '快照数量已达上限，请稍后重试。', 429);
      const id = randomUUID();
      journal.snapshots[id] = { entries: entriesFor(state, journal), cursor: cursorFor(journal, ownerId), expiresAt: Date.now() + 24 * 60 * 60 * 1000 };
      return { ...describe(journal), snapshotId: id, count: journal.snapshots[id].entries.length };
    }),
    releaseSnapshot: ({ snapshotId }) => provider.mutate((_state, journal) => { delete journal.snapshots[snapshotId]; return { released: true }; }),
    snapshot: ({ snapshotId, offset = 0, limit = 200 }) => {
      const start = Number(offset); const size = pageSize(limit);
      if (!Number.isSafeInteger(start) || start < 0) throw syncError('CURSOR_INVALID', '快照分页无效。', 422);
      if (provider.snapshotPage) return provider.snapshotPage({ snapshotId, start, size });
      return provider.read((_state, journal) => {
      const snapshot = journal.snapshots[snapshotId];
      if (!snapshot || snapshot.expiresAt < Date.now()) throw syncError('CURSOR_EXPIRED', '初始化快照已过期。');
      const start = Number(offset);
      if (!Number.isSafeInteger(start) || start < 0 || start > snapshot.entries.length) throw syncError('CURSOR_INVALID', '快照分页无效。', 422);
      const end = Math.min(snapshot.entries.length, start + pageSize(limit));
      return { entries: snapshot.entries.slice(start, end), nextOffset: end < snapshot.entries.length ? end : null, cursor: snapshot.cursor, datasetEpoch: journal.epoch };
      });
    },
    changes: ({ cursor, limit = 50 }) => provider.read((_state, journal) => {
      const sequence = readCursor(cursor, journal, ownerId);
      const groups = journal.changes.filter(group => group.sequence > sequence).slice(0, pageSize(limit));
      const end = groups.at(-1)?.sequence ?? sequence;
      return { groups, cursor: cursorFor(journal, ownerId, end), hasMore: end < journal.head, datasetEpoch: journal.epoch };
    }),
    push: operation => provider.mutate((state, journal) => {
      validateOperation(operation);
      if (operation.datasetEpoch !== journal.epoch) throw syncError('DATASET_CHANGED', '云端资料库基线已变化。');
      const key = JSON.stringify([operation.deviceId, operation.operationId]);
      const hash = requestHash(operation);
      const receipt = journal.receipts[key];
      if (receipt) {
        if (receipt.hash !== hash) throw syncError('OPERATION_REUSED', '同一操作 ID 的内容不能改变。', 422);
        return receipt.result;
      }
      assertSyncDeviceEnabled(operation.deviceId);
      const entityKey = syncKey('notes', operation.noteId);
      const revision = journal.revisions[entityKey] ?? null;
      const current = state.notes.find(note => note.id === operation.noteId) ?? null;
      if (revision !== operation.baseRevision) {
        const result = { status: 'conflict', current: { collection: 'notes', id: operation.noteId, revision, value: structuredClone(current) } };
        journal.receipts[key] = { hash, result };
        return result;
      }
      if (!current && revision !== null) throw syncError('NOTE_DELETED', '笔记已永久删除，请保留为新副本。');
      const value = operation.value;
      if (!value.spaceId || !state.spaces.some(space => space.id === value.spaceId && space.userId === ownerId)) throw syncError('DEPENDENCY_MISSING', '目标空间不存在。');
      if ((value.folderId && !state.folders.some(folder => folder.id === value.folderId && folder.spaceId === value.spaceId))
        || value.tagIds.some(id => !state.tags.some(tag => tag.id === id && tag.spaceId === value.spaceId))) throw syncError('DEPENDENCY_MISSING', '目录或标签尚未同步，请调整笔记归属后重试。');
      return thenResult(provider.applyNote(operation, current), () => thenResult(provider.preview(), ({ state: next, journal: preview }) => {
        const result = { status: 'accepted', current: {
          collection: 'notes', id: operation.noteId, revision: preview.revisions[entityKey], value: structuredClone(next.notes.find(note => note.id === operation.noteId))
        } };
        journal.receipts[key] = { hash, result };
        return result;
      }));
    })
  };
}

function pageSize(value) {
  const size = Number(value);
  if (!Number.isSafeInteger(size) || size < 1 || size > 500) throw syncError('SYNC_LIMIT_INVALID', '同步分页大小无效。', 422);
  return size;
}

function validateOperation(op) {
  if (!op || op.protocolVersion !== 1) throw syncError('PROTOCOL_UNSUPPORTED', '请升级同步客户端。', 422);
  if (![op.deviceId, op.operationId, op.noteId, op.datasetEpoch].every(value => typeof value === 'string' && value.length > 0 && value.length <= 200)) throw syncError('SYNC_OPERATION_INVALID', '操作标识无效。', 422);
  if (op.baseRevision !== null && (!Number.isSafeInteger(op.baseRevision) || op.baseRevision < 1)) throw syncError('SYNC_OPERATION_INVALID', '基线修订无效。', 422);
  if (!op.value || typeof op.value.title !== 'string' || typeof op.value.rawMarkdown !== 'string'
    || typeof op.value.deleted !== 'boolean' || !Array.isArray(op.value.tagIds)
    || Object.keys(op.value).some(key => !NOTE_FIELDS.includes(key))) throw syncError('SYNC_OPERATION_INVALID', '笔记同步内容无效。', 422);
}
