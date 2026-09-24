export function createInMemoryKnowledgeSpaceRepository(options = {}) {
  const spaces = options.records ?? [];

  function persist() {
    options.onChange?.(spaces);
  }

  return {
    save(space) {
      const existingIndex = spaces.findIndex((item) => item.id === space.id);

      if (existingIndex === -1) {
        spaces.push(space);
        persist();
        return space;
      }

      spaces[existingIndex] = space;
      persist();
      return space;
    },
    findById(spaceId) {
      return spaces.find((space) => space.id === spaceId) ?? null;
    },
    delete(spaceId) {
      const index = spaces.findIndex(space => space.id === spaceId);
      if (index < 0) return null;
      const [removed] = spaces.splice(index, 1);
      persist();
      return removed;
    },
    list(options = {}) {
      return spaces.filter((space) => (options.userId ? space.userId === options.userId : true));
    }
  };
}
