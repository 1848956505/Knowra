import { selectEntityBatch } from './entity-batches.mjs';
import { reconcileSyncedSourceStates } from '../../api/src/infrastructure/local-data-relations.js';
import { randomUUID } from 'node:crypto';
import { WRITABLE_COLLECTIONS, sameEntity, referencesFor } from '../../api/src/modules/sync/entity-contract.js';
import { syncKey } from '../../api/src/modules/sync/journal.js';
import { LOCAL_DATA_COLLECTIONS, createEmptyLocalState, validatePersistedLocalState, createPersistedLocalDocument } from '../../api/src/infrastructure/local-data-schema.js';
import { readMeta, writeMeta } from './sync-state.mjs';

const replace = (state, entry) => {
  const index = state[entry.collection].findIndex(item => item.id === entry.id);
  if (index >= 0) state[entry.collection].splice(index, 1);
  if (entry.value) state[entry.collection].push(structuredClone(entry.value));
};
function bases(db) {
  return new Map(db.prepare('SELECT * FROM sync_base').all().map(row => [syncKey(row.collection, row.id), { collection: row.collection, id: row.id, revision: row.server_revision, value: JSON.parse(row.payload) }]));
}
function dirtyEntries(state, base) {
  const changes = [];
  const versionHashes = new Set([...base.values()].filter(entry => entry.collection === 'noteVersions' && entry.value).map(entry => `${entry.value.noteId}:${entry.value.contentHash}`));
  for (const collection of WRITABLE_COLLECTIONS) {
    const current = new Map(state[collection].map(item => [item.id, item]));
    const ids = new Set([...current.keys(), ...[...base.values()].filter(entry => entry.collection === collection).map(entry => entry.id)]);
    for (const id of ids) {
      const previous = base.get(syncKey(collection, id));
      const value = current.get(id) ?? null;
      // 云端版本去重后的本地历史副本仅供恢复，不再上传。
      if (collection === 'noteVersions' && value && versionHashes.has(`${value.noteId}:${value.contentHash}`)) continue;
      if (!sameEntity(collection, value, previous?.value)) changes.push({ collection, id, baseRevision: previous?.revision ?? null, value });
    }
  }
  return changes;
}
function stateFromBase(base) {
  const state = createEmptyLocalState();
  for (const entry of base.values()) if (entry.value) state[entry.collection].push(structuredClone(entry.value));
  return state;
}
function setState(target, next) { for (const collection of LOCAL_DATA_COLLECTIONS) target[collection].splice(0, target[collection].length, ...next[collection]); }
function persistBases(db, base) {
  db.prepare('DELETE FROM sync_base').run();
  const insert = db.prepare('INSERT INTO sync_base VALUES (?, ?, ?, ?)');
  for (const entry of base.values()) insert.run(entry.collection, entry.id, entry.revision, JSON.stringify(entry.value));
}
function canonicalizeVersions(state, base) {
  const aliases = new Map();
  const remoteVersions = new Map([...base.values()].filter(entry => entry.collection === 'noteVersions' && entry.value).map(entry => [`${entry.value.noteId}:${entry.value.contentHash}`, entry]));
  for (const version of state.noteVersions) {
    const remote = remoteVersions.get(`${version.noteId}:${version.contentHash}`);
    if (remote && remote.id !== version.id) aliases.set(version.id, remote.id);
  }
  function remap(value) {
    if (Array.isArray(value)) return value.map(remap);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, key === 'noteVersionId' && aliases.has(child) ? aliases.get(child) : remap(child)]));
  }
  for (const collection of ['contentAnnotations', 'annotationExclusions', 'annotationRevisions']) state[collection].splice(0, state[collection].length, ...state[collection].map(remap));
}

export function applyEntityRemote(store, entries, cursor, epoch, { reset = false } = {}) {
  return store.syncTransaction((db, state) => {
    const base = bases(db);
    const previousEpoch = readMeta(db, 'epoch');
    const changedEpoch = previousEpoch && previousEpoch !== epoch;
    const previousConflict = readMeta(db, 'entityConflict');
    const remote = reset ? new Map() : previousConflict?.epoch === epoch ? new Map(previousConflict.remote.map(entry => [syncKey(entry.collection, entry.id), entry])) : new Map(base);
    for (const entry of entries) {
      if (!LOCAL_DATA_COLLECTIONS.includes(entry.collection)) throw new Error('同步实体类型不兼容，请升级应用。');
      const key = syncKey(entry.collection, entry.id);
      if (reset || !remote.has(key) || (remote.get(key).revision ?? 0) <= (entry.revision ?? 0)) remote.set(key, entry);
    }
    // 规范化本地版本引用后再比较，避免相同正文版本造成虚假冲突。
    const local = structuredClone(state);
    canonicalizeVersions(local, base);
    const dirty = dirtyEntries(local, base);
    const conflicts = dirty.filter(entry => {
      const old = base.get(syncKey(entry.collection, entry.id));
      const next = remote.get(syncKey(entry.collection, entry.id));
      return !sameEntity(entry.collection, entry.value, next?.value)
        && (changedEpoch || (!previousEpoch && next?.value) || (old?.revision ?? null) !== (next?.revision ?? null));
    });
    const merged = stateFromBase(remote);
    for (const entry of dirty) replace(merged, entry);
    // 未修改的历史别名仍可在本地按稳定 ID 读取。
    const versionIds = new Set(merged.noteVersions.map(item => item.id));
    const noteIds = new Set(merged.notes.map(item => item.id));
    for (const version of local.noteVersions) if (!versionIds.has(version.id) && noteIds.has(version.noteId)) merged.noteVersions.push(version);
    let valid;
    try { valid = validatePersistedLocalState(createPersistedLocalDocument(reconcileSyncedSourceStates(merged))); }
    catch (error) { conflicts.push({ collection: 'dependencies', id: 'references', message: error.message }); }
    if (conflicts.length) {
      const existing = readMeta(db, 'entityConflict');
      const blocked = new Set(conflicts.map(entry => syncKey(entry.collection, entry.id)));
      const dirtyKeys = new Set(dirty.map(entry => syncKey(entry.collection, entry.id)));
      if (!valid) for (const key of dirtyKeys) blocked.add(key);
      let expanded = true;
      while (expanded) {
        expanded = false;
        for (const entry of dirty) {
          const key = syncKey(entry.collection, entry.id);
          const refs = referencesFor(entry.collection, entry.value ?? base.get(key)?.value).map(ref => syncKey(ref.collection, ref.id)).filter(ref => dirtyKeys.has(ref));
          if (blocked.has(key) || refs.some(ref => blocked.has(ref))) for (const ref of [key, ...refs]) if (!blocked.has(ref)) { blocked.add(ref); expanded = true; }
        }
      }
      writeMeta(db, 'entityConflict', { id: existing?.cursor === cursor && existing?.epoch === epoch ? existing.id : randomUUID(), epoch, cursor, remote: [...remote.values()],
        blocked: [...blocked], conflicts, changedEpoch: Boolean(changedEpoch), changedAt: new Date().toISOString() });
      writeMeta(db, 'bootstrap', null);
      if (valid) {
        setState(state, valid);
        const acceptedBase = new Map(remote);
        for (const key of blocked) { if (base.has(key)) acceptedBase.set(key, base.get(key)); else acceptedBase.delete(key); }
        persistBases(db, acceptedBase);
        writeMeta(db, 'epoch', epoch); writeMeta(db, 'cursor', cursor);
        if (changedEpoch) writeMeta(db, 'entityUpload', null);
        writeMeta(db, 'generation', (readMeta(db, 'generation') ?? 0) + 1);
      }
      return false;
    }
    setState(state, valid);
    persistBases(db, remote);
    writeMeta(db, 'epoch', epoch); writeMeta(db, 'cursor', cursor); writeMeta(db, 'bootstrap', null);
    writeMeta(db, 'entityConflict', null);
    if (changedEpoch) writeMeta(db, 'entityUpload', null);
    settle(db, state);
    writeMeta(db, 'generation', (readMeta(db, 'generation') ?? 0) + 1);
    return true;
  });
}

function settle(db, state) {
  if (!dirtyEntries(state, bases(db)).length && !readMeta(db, 'entityUpload')) db.prepare("UPDATE sync_outbox SET state = 'acknowledged'").run();
}

export function nextEntityUpload(store) {
  return store.syncTransaction((db, state) => {
    const blocked = new Set(readMeta(db, 'entityConflict')?.blocked ?? []);
    const frozen = readMeta(db, 'entityUpload');
    if (frozen) return frozen;
    const base = bases(db);
    const changes = selectEntityBatch(dirtyEntries(state, base).filter(entry => !blocked.has(syncKey(entry.collection, entry.id))), state, base);
    if (!changes.length) { settle(db, state); return null; }
    const own = new Set(changes.map(entry => syncKey(entry.collection, entry.id)));
    const dependencies = new Map();
    for (const entry of changes) for (const ref of referencesFor(entry.collection, entry.value)) {
      const key = syncKey(ref.collection, ref.id);
      if (!own.has(key)) dependencies.set(key, { ...ref, baseRevision: base.get(key)?.revision ?? null });
    }
    const operation = { protocolVersion: 2, datasetEpoch: readMeta(db, 'epoch'), deviceId: store.getStatus().deviceId,
      operationId: randomUUID(), sequence: (readMeta(db, 'entitySequence') ?? 0) + 1, changes, dependencies: [...dependencies.values()] };
    writeMeta(db, 'entitySequence', operation.sequence);
    writeMeta(db, 'entityUpload', operation);
    return operation;
  });
}

export function acknowledgeEntityUpload(store, operation, result) {
  store.syncTransaction((db, state) => {
    if (result.status === 'accepted') {
      const base = bases(db);
      for (const entry of result.entries) {
        const submitted = operation.changes.find(item => item.collection === entry.collection && (item.id === entry.id || result.aliases?.[item.id] === entry.id));
        const local = state[entry.collection].find(item => item.id === submitted?.id) ?? null;
        if (sameEntity(entry.collection, local, submitted?.value)) replace(state, entry);
        base.set(syncKey(entry.collection, entry.id), entry);
      }
      canonicalizeVersions(state, base);
      persistBases(db, base);
    }
    // 冲突结果先解除冻结，下一次拉取会保存包含完整远端事务的冲突。
    writeMeta(db, 'entityUpload', null);
    settle(db, state);
  });
}

export function getEntitySyncState(store) {
  return store.readSync((db, state) => {
    const dirty = dirtyEntries(state, bases(db));
    const conflict = readMeta(db, 'entityConflict');
    return {
      pendingEntities: dirty.length,
      pendingAttachments: dirty.filter(entry => entry.collection === 'attachments').length,
      entityConflict: conflict ? {
        id: conflict.id, changedEpoch: conflict.changedEpoch,
        items: dirty.filter(entry => !conflict.blocked || conflict.blocked.includes(syncKey(entry.collection, entry.id))).map(entry => ({ collection: entry.collection, id: entry.id, local: entry.value,
          base: bases(db).get(syncKey(entry.collection, entry.id))?.value ?? null,
          remote: conflict.remote.find(item => item.collection === entry.collection && item.id === entry.id)?.value ?? null })),
        reasons: conflict.conflicts.map(entry => ({ collection: entry.collection, id: entry.id, message: entry.message }))
      } : null
    };
  });
}

export function resolveEntityConflict(store, { conflictId, choice, rawMarkdown }, noteService) {
  store.syncTransaction((db, state) => {
    const conflict = readMeta(db, 'entityConflict');
    if (!conflict || conflict.id !== conflictId) throw new Error('冲突已变化，请重新查看。');
    if (!['remote', 'local', 'manual', 'copy'].includes(choice)) throw new Error('请选择有效的冲突处理方式。');
    const allDirty = dirtyEntries(state, bases(db));
    const blocked = new Set(conflict.blocked ?? allDirty.map(entry => syncKey(entry.collection, entry.id)));
    const dirty = allDirty.filter(entry => blocked.has(syncKey(entry.collection, entry.id)));
    db.prepare('INSERT INTO sync_recovery VALUES (?, ?)').run(randomUUID(), JSON.stringify({
      kind: 'entity-conflict', choice, local: structuredClone(state), base: [...bases(db).values()], remote: conflict.remote, resolvedAt: new Date().toISOString()
    }));
    const remote = new Map(conflict.remote.map(entry => [syncKey(entry.collection, entry.id), entry]));
    for (const [key, entry] of bases(db)) if (!blocked.has(key)) remote.set(key, entry);
    const merged = stateFromBase(remote);
    for (const entry of allDirty) if (!blocked.has(syncKey(entry.collection, entry.id))) replace(merged, entry);
    if (choice !== 'remote' && choice !== 'copy') {
      for (const entry of dirty) {
        const current = remote.get(syncKey(entry.collection, entry.id));
        if (entry.value && !current?.value && (entry.baseRevision !== null || conflict.changedEpoch)) throw new Error('云端已永久删除相关对象。请先导出恢复记录，再采用云端版本；原内容保存在恢复记录中。');
        replace(merged, entry);
      }
    }
    setState(state, merged);
    if (choice === 'copy') {
      const notes = dirty.filter(entry => entry.collection === 'notes' && entry.value);
      if (notes.length !== 1) throw new Error('保留两篇仅适用于一篇笔记的冲突。');
      const original = notes[0].value;
      if (!state.spaces.some(space => space.id === original.spaceId)) throw new Error('云端已删除此空间，请导出恢复记录。');
      noteService.createNote({ ...original, id: randomUUID(), title: `${original.title}（本地副本 ${randomUUID().slice(0, 4)}）`, deleted: false,
        folderId: state.folders.some(folder => folder.id === original.folderId) ? original.folderId : null,
        tagIds: original.tagIds.filter(id => state.tags.some(tag => tag.id === id)) });
    }
    if (choice === 'manual') {
      const notes = dirty.filter(entry => entry.collection === 'notes' && entry.value);
      if (notes.length !== 1 || typeof rawMarkdown !== 'string') throw new Error('手动合并需要且只能包含一篇笔记。');
      if (notes[0].value.deleted) noteService.restoreNote(notes[0].id);
      noteService.updateNote(notes[0].id, { rawMarkdown });
    }
    persistBases(db, remote);
    writeMeta(db, 'epoch', conflict.epoch); writeMeta(db, 'cursor', conflict.cursor);
    writeMeta(db, 'entityConflict', null); writeMeta(db, 'entityUpload', null);
    writeMeta(db, 'generation', (readMeta(db, 'generation') ?? 0) + 1);
    settle(db, state);
  }, { local: true });
}
