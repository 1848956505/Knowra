export function createInMemoryContentAnnotationRepository(options = {}) {
  const records = options.records ?? [];
  const persist = () => options.onChange?.(records);
  const normalized = item => item ? {
    ...item,
    schemaVersion: item.schemaVersion ?? 1,
    scopeType: item.scopeType ?? 'selection',
    revision: item.revision ?? 1,
    lifecycleStatus: item.lifecycleStatus ?? (item.status === 'archived' ? 'archived' : 'active'),
    anchorStatus: item.anchorStatus ?? (item.status === 'stale' ? 'needsReview' : 'resolved')
  } : null;
  const active = (item, includeDeleted) => includeDeleted || (item.lifecycleStatus ?? item.status) !== 'archived';
  return {
    save(annotation) { const index = records.findIndex((item) => item.id === annotation.id); if (index < 0) records.push(annotation); else records[index] = annotation; persist(); return annotation; },
    findById(id) { return normalized(records.find((item) => item.id === id)); },
    findByIdempotencyKey(noteId, idempotencyKey) { return normalized(records.find((item) => item.noteId === noteId && item.idempotencyKey === idempotencyKey)); },
    findDuplicate({ noteId, kind, scopeType, anchorFingerprint, quoteText, fromPosition, toPosition }) { return records.map(normalized).find((item) => item.noteId === noteId && item.lifecycleStatus !== 'archived' && item.kind === kind && (anchorFingerprint ? item.anchorFingerprint === anchorFingerprint && item.scopeType === scopeType : item.quoteText === quoteText && item.fromPosition === fromPosition && item.toPosition === toPosition)) ?? null; },
    list({ noteId, spaceId, includeDeleted = false, kind, scopeType, anchorStatus } = {}) { return records.map(normalized).filter((item) => (!noteId || item.noteId === noteId) && (!spaceId || item.spaceId === spaceId) && (!kind || item.kind === kind) && (!scopeType || item.scopeType === scopeType) && (!anchorStatus || item.anchorStatus === anchorStatus) && active(item, includeDeleted)); },
    deleteByNoteIds(noteIds) {
      const noteIdSet = new Set(noteIds);
      const deleted = [];

      for (let index = records.length - 1; index >= 0; index -= 1) {
        if (!noteIdSet.has(records[index].noteId)) {
          continue;
        }
        deleted.push(...records.splice(index, 1));
      }

      if (deleted.length > 0) {
        persist();
      }
      return deleted.reverse();
    },
    markStaleByNoteId(noteId, currentContentHash) {
      const changed = [];
      for (const item of records) {
        if (item.noteId !== noteId || !active(item, false) || item.noteContentHash === currentContentHash) continue;
        item.anchorStatus = 'needsReview';
        item.anchorReason = 'contentChanged';
        item.status = 'stale';
        item.revision = Number(item.revision ?? 1) + 1;
        item.updatedAt = new Date().toISOString();
        changed.push(item);
      }
      if (changed.length > 0) persist();
      return changed;
    }
  };
}
