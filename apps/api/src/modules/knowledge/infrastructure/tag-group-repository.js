export function createInMemoryTagGroupRepository(options = {}) {
  const groups = options.records ?? [];
  const persist = () => options.onChange?.(groups);
  return {
    save(group) {
      const index = groups.findIndex((item) => item.id === group.id);
      if (index === -1) groups.push(group);
      else groups[index] = group;
      persist();
      return group;
    },
    findById(id) { return groups.find((group) => group.id === id) ?? null; },
    delete(id) {
      const index = groups.findIndex((group) => group.id === id);
      if (index === -1) return null;
      const [deleted] = groups.splice(index, 1);
      persist();
      return deleted;
    },
    list(options = {}) {
      return groups
        .filter((group) => options.spaceId ? group.spaceId === options.spaceId : true)
        .sort((a, b) => (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name));
    }
  };
}
