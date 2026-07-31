import { createAppError } from '../../../errors/app-error.js';

export function createInMemoryNoteVersionRepository(options = {}) {
  const records = options.records ?? [];
  const persist = () => options.onChange?.(records);

  return {
    save(version) {
      const existing = records.find((item) => item.id === version.id);
      if (existing) {
        if (existing.noteId !== version.noteId || existing.contentHash !== version.contentHash) {
          throw createAppError('NOTE_VERSION_IMMUTABLE', 'NoteVersion cannot be changed', 409);
        }
        return existing;
      }
      if (records.some((item) => item.noteId === version.noteId && item.contentHash === version.contentHash)) {
        return records.find((item) => item.noteId === version.noteId && item.contentHash === version.contentHash);
      }
      records.push(version);
      persist();
      return version;
    },
    findById(id) {
      return records.find((item) => item.id === id) ?? null;
    },
    findByNoteIdAndContentHash(noteId, contentHash) {
      return records.find((item) => item.noteId === noteId && item.contentHash === contentHash) ?? null;
    },
    list({ noteId } = {}) {
      return records
        .filter((item) => !noteId || item.noteId === noteId)
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
    },
    deleteByNoteIds(noteIds) {
      const ids = new Set(noteIds);
      const deleted = records.filter((item) => ids.has(item.noteId));
      if (deleted.length) {
        for (const item of deleted) records.splice(records.indexOf(item), 1);
        persist();
      }
      return deleted;
    }
  };
}
