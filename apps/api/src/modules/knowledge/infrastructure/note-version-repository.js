import { createAppError } from '../../../errors/app-error.js';
import { versionPage } from '../domain/note-version-page.js';

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
    listPage({ noteId, limit, after, currentContentHash }) {
      const hashes = new Set();
      const ordered = records.filter((item) => item.noteId === noteId)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt) || b.id.localeCompare(a.id))
        .filter((item) => {
          if (hashes.has(item.contentHash)) return false;
          hashes.add(item.contentHash);
          return true;
        });
      const items = after ? ordered.filter((item) => Date.parse(item.createdAt) < Date.parse(after.createdAt)
        || (Date.parse(item.createdAt) === Date.parse(after.createdAt) && item.id.localeCompare(after.id) < 0)) : ordered;
      return versionPage(items.slice(0, limit + 1), {
        limit, total: ordered.length, currentVersionId: ordered.find((item) => item.contentHash === currentContentHash)?.id ?? null
      });
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
