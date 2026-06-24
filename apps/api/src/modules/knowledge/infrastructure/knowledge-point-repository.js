function createCollectionRepository(records, onChange, getKey) {
  const items = records ?? [];

  function persist() {
    onChange?.(items);
  }

  return {
    save(item) {
      const key = getKey(item);
      const existingIndex = items.findIndex((current) => getKey(current) === key);

      if (existingIndex === -1) {
        items.push(item);
      } else {
        items[existingIndex] = item;
      }

      persist();
      return item;
    },
    findById(id) {
      return items.find((item) => getKey(item) === id) ?? null;
    },
    deleteById(id) {
      const existingIndex = items.findIndex((item) => getKey(item) === id);
      if (existingIndex === -1) {
        return null;
      }

      const [deleted] = items.splice(existingIndex, 1);
      persist();
      return deleted;
    },
    deleteWhere(predicate) {
      const deleted = [];
      for (let index = items.length - 1; index >= 0; index -= 1) {
        if (!predicate(items[index])) {
          continue;
        }
        deleted.push(items[index]);
        items.splice(index, 1);
      }
      if (deleted.length) {
        persist();
      }
      return deleted.reverse();
    },
    list(predicate = () => true) {
      return items.filter(predicate);
    }
  };
}

export function createInMemoryKnowledgePointRepository(options = {}) {
  return createCollectionRepository(options.records, options.onChange, (item) => item.id);
}

export function createInMemoryKnowledgePointSourceRepository(options = {}) {
  return createCollectionRepository(options.records, options.onChange, (item) => item.id);
}

export function createInMemoryTagGroupRepository(options = {}) {
  return createCollectionRepository(options.records, options.onChange, (item) => item.id);
}

export function createInMemoryKnowledgePointTagRepository(options = {}) {
  return createCollectionRepository(
    options.records,
    options.onChange,
    (item) => `${item.knowledgePointId}:${item.tagId}`
  );
}

export function createInMemoryNoteKnowledgePointRepository(options = {}) {
  return createCollectionRepository(
    options.records,
    options.onChange,
    (item) => `${item.noteId}:${item.knowledgePointId}`
  );
}
