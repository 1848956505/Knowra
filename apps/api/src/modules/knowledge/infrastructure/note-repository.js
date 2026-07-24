export function createInMemoryNoteRepository(options = {}) {
  const notes = options.records ?? [];

  function persist() {
    options.onChange?.(notes);
  }

  function isTruthy(value) {
    return value === true || value === 'true';
  }

  function compareValues(left, right, sortBy, order) {
    if (left?.favorite !== right?.favorite) {
      return left?.favorite ? -1 : 1;
    }

    const direction = order === 'asc' ? 1 : -1;
    const leftValue = left?.[sortBy] ?? '';
    const rightValue = right?.[sortBy] ?? '';

    if (sortBy === 'createdAt' || sortBy === 'updatedAt') {
      return (new Date(leftValue).getTime() - new Date(rightValue).getTime()) * direction;
    }

    return String(leftValue).localeCompare(String(rightValue)) * direction;
  }

  return {
    save(note) {
      const existingIndex = notes.findIndex((item) => item.id === note.id);

      if (existingIndex === -1) {
        notes.push(note);
        persist();
        return note;
      }

      notes[existingIndex] = note;
      persist();
      return note;
    },
    findById(noteId) {
      return notes.find((note) => note.id === noteId) ?? null;
    },
    delete(noteId) {
      const existingIndex = notes.findIndex((note) => note.id === noteId);
      if (existingIndex === -1) {
        return null;
      }

      const [deletedNote] = notes.splice(existingIndex, 1);
      persist();
      return deletedNote;
    },
    list(options = {}) {
      const results = notes
        .filter((note) => {
          if (isTruthy(options.deletedOnly)) {
            return note.deleted;
          }

          return isTruthy(options.includeDeleted) ? true : !note.deleted;
        })
        .filter((note) => (options.spaceId ? note.spaceId === options.spaceId : true))
        .filter((note) => (options.folderId ? note.folderId === options.folderId : true))
        .filter((note) => (options.tagId ? note.tagIds.includes(options.tagId) : true))
        .filter((note) => (isTruthy(options.favoriteOnly) ? note.favorite : true));

      const sortBy = options.sortBy ?? 'updatedAt';
      const order = options.order ?? 'desc';
      results.sort((left, right) => compareValues(left, right, sortBy, order));

      const offset = options.offset ? Number(options.offset) : 0;

      if (options.limit) {
        return results.slice(offset, offset + Number(options.limit));
      }

      if (offset > 0) {
        return results.slice(offset);
      }

      return results;
    },
    deleteWhere(predicate) {
      const deletedNotes = [];

      for (let index = notes.length - 1; index >= 0; index -= 1) {
        if (!predicate(notes[index])) {
          continue;
        }

        deletedNotes.push(notes[index]);
        notes.splice(index, 1);
      }

      if (deletedNotes.length > 0) {
        persist();
      }

      return deletedNotes.reverse();
    }
  };
}
