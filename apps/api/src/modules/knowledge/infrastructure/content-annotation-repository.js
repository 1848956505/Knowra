export function createInMemoryContentAnnotationRepository(options = {}) {
  const records = options.records ?? [];
  const persist = () => options.onChange?.(records);
  const active = (item, includeDeleted) => includeDeleted || item.status !== 'archived';
  return {
    save(annotation) { const index = records.findIndex((item) => item.id === annotation.id); if (index < 0) records.push(annotation); else records[index] = annotation; persist(); return annotation; },
    findById(id) { return records.find((item) => item.id === id) ?? null; },
    findByIdempotencyKey(noteId, idempotencyKey) { return records.find((item) => item.noteId === noteId && item.idempotencyKey === idempotencyKey) ?? null; },
    findDuplicate({ noteId, quoteText, fromPosition, toPosition }) { return records.find((item) => item.noteId === noteId && item.status !== 'archived' && item.quoteText === quoteText && item.fromPosition === fromPosition && item.toPosition === toPosition) ?? null; },
    list({ noteId, spaceId, includeDeleted = false } = {}) { return records.filter((item) => (!noteId || item.noteId === noteId) && (!spaceId || item.spaceId === spaceId) && active(item, includeDeleted)); },
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
    }
  };
}
