export function createInMemoryTagRepository(options = {}) {
  const tags = options.records ?? [];

  function persist() {
    options.onChange?.(tags);
  }

  return {
    save(tag) {
      const existingIndex = tags.findIndex((item) => item.id === tag.id);

      if (existingIndex === -1) {
        tags.push(tag);
        persist();
        return tag;
      }

      tags[existingIndex] = tag;
      persist();
      return tag;
    },
    findById(tagId) {
      return tags.find((tag) => tag.id === tagId) ?? null;
    },
    delete(tagId) {
      const existingIndex = tags.findIndex((tag) => tag.id === tagId);

      if (existingIndex === -1) {
        return null;
      }

      const [deletedTag] = tags.splice(existingIndex, 1);
      options.onChange?.(tags);
      return deletedTag;
    },
    list(options = {}) {
      return tags
        .filter((tag) => (options.spaceId ? tag.spaceId === options.spaceId : true))
        .sort((a, b) => ((a.sortOrder ?? 0) - (b.sortOrder ?? 0)) || a.name.localeCompare(b.name));
    }
  };
}
