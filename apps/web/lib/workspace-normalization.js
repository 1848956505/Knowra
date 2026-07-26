export function normalizeFolderTree(nodes) {
  if (!Array.isArray(nodes)) {
    return [];
  }

  return nodes
    .filter((node) => node && typeof node === 'object' && !Array.isArray(node))
    .map((node) => ({
      ...node,
      id: String(node.id ?? ''),
      name: String(node.name ?? '未命名目录'),
      parentId: node.parentId ?? null,
      children: normalizeFolderTree(node.children ?? [])
    }))
    .filter((node) => node.id);
}

export function normalizeNotes(notes) {
  if (!Array.isArray(notes)) {
    return [];
  }

  return notes
    .filter((note) => note && typeof note === 'object' && !Array.isArray(note))
    .map((note) => ({
      ...note,
      id: String(note.id ?? ''),
      title: String(note.title ?? '未命名笔记'),
      folderId: note.folderId ?? null,
      tagIds: Array.isArray(note.tagIds) ? [...note.tagIds] : [],
      internalLinks: Array.isArray(note.internalLinks) ? [...note.internalLinks] : [],
      rawMarkdown: typeof note.rawMarkdown === 'string' ? note.rawMarkdown : '',
      contentLoaded: typeof note.contentLoaded === 'boolean'
        ? note.contentLoaded
        : typeof note.rawMarkdown === 'string',
      favorite: Boolean(note.favorite),
      deleted: Boolean(note.deleted)
    }))
    .filter((note) => note.id);
}

export function mergeNoteSummariesWithLoadedContent(summaries, currentNotes = []) {
  const loadedById = new Map(
    currentNotes
      .filter((note) => note?.contentLoaded && typeof note.rawMarkdown === 'string')
      .map((note) => [note.id, note])
  );

  return normalizeNotes(summaries).map((summary) => {
    const loaded = loadedById.get(summary.id);
    if (!loaded) {
      return summary;
    }

    return {
      ...summary,
      rawMarkdown: loaded.rawMarkdown,
      plainText: loaded.plainText,
      contentLoaded: true
    };
  });
}

export function replaceNoteInCollection(notes, updatedNote, fallbackFields = {}) {
  const normalizedNote = normalizeNotes([{
    ...fallbackFields,
    ...updatedNote
  }])[0];

  if (!normalizedNote) {
    return notes;
  }

  return (notes ?? []).map((note) => (
    note.id === normalizedNote.id
      ? {
        ...note,
        ...normalizedNote
      }
      : note
  ));
}
