import { createNoteSummary } from '../note-summary.js';

function normalizeQuery(value) {
  return value?.trim().toLowerCase() || '';
}

export function createAsyncSearchService({ listNotes }) {
  return {
    async searchNotes({ query, spaceId, folderId = null, tagId = null, sortBy, order, limit, offset, includeDeleted, deletedOnly, favoriteOnly }) {
      const normalizedQuery = normalizeQuery(query);
      if (!normalizedQuery) return [];
      const results = (await listNotes({
        spaceId,
        folderId,
        tagId,
        sortBy,
        order,
        includeDeleted,
        deletedOnly,
        favoriteOnly
      })).filter((note) => `${note.title} ${note.plainText}`.toLowerCase().includes(normalizedQuery));
      const start = offset ? Number(offset) : 0;
      if (limit) return results.slice(start, start + Number(limit));
      return start > 0 ? results.slice(start) : results;
    }
  };
}

export { createNoteSummary };
