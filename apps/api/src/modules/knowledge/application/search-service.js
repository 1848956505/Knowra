function normalizeQuery(value) {
  return value?.trim().toLowerCase() || '';
}

export function createSearchService({ listNotes }) {
  return {
    searchNotes({ query, spaceId, folderId = null, tagId = null, tagIds = [], tagMatch, match, sortBy, order, limit, offset, includeDeleted, deletedOnly, favoriteOnly }) {
      const normalizedQuery = normalizeQuery(query);

      if (!normalizedQuery) {
        return [];
      }

      const results = listNotes({
        spaceId,
        folderId,
        tagId,
        tagIds,
        tagMatch: tagMatch ?? match,
        sortBy,
        order,
        includeDeleted,
        deletedOnly,
        favoriteOnly
      })
        .filter((note) => {
          const haystack = `${note.title} ${note.plainText}`.toLowerCase();
          return haystack.includes(normalizedQuery);
        });

      const start = offset ? Number(offset) : 0;

      if (limit) {
        return results.slice(start, start + Number(limit));
      }

      if (start > 0) {
        return results.slice(start);
      }

      return results;
    }
  };
}
