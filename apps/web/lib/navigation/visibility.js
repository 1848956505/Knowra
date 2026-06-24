import {
  hasActiveSearchFilters,
  matchesSearch as valueMatchesSearch,
  noteMatchesSelectedTags
} from '../search/state.js';

export function getDirectNotesForFolder(notes = [], folderId) {
  return notes.filter((note) => !note.deleted && (note.folderId ?? null) === (folderId ?? null));
}

export function isFolderWithinSelection({ foldersById = {}, selectedFolderId = null, folderId = null } = {}) {
  if (!selectedFolderId) {
    return true;
  }
  if (!folderId) {
    return false;
  }

  let cursor = foldersById[folderId] ?? null;
  while (cursor) {
    if (cursor.id === selectedFolderId) {
      return true;
    }
    cursor = cursor.parentId ? foldersById[cursor.parentId] : null;
  }

  return false;
}

export function isNoteVisibleForNavigation({
  note,
  foldersById = {},
  selectedFolderId = null,
  search = {}
} = {}) {
  if (hasActiveSearchFilters(search)) {
    return true;
  }

  if (!selectedFolderId) {
    return true;
  }

  return isFolderWithinSelection({
    foldersById,
    selectedFolderId,
    folderId: note?.folderId ?? null
  });
}

export function getVisibleNavigationNotes({
  notes = [],
  foldersById = {},
  selectedFolderId = null,
  search = {}
} = {}) {
  return notes.filter((note) => (
    !note.deleted
    && isNoteVisibleForNavigation({ note, foldersById, selectedFolderId, search })
    && valueMatchesSearch(note.title, search)
    && noteMatchesSelectedTags(note, search)
  ));
}

export function getSearchResultNotes(options = {}) {
  return getVisibleNavigationNotes(options)
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
}

export function matchesFolderSearch({ folder, notes = [], search = {} } = {}) {
  if (!hasActiveSearchFilters(search)) {
    return true;
  }

  if (valueMatchesSearch(folder?.name, search) && !(search.selectedTagIds ?? []).length) {
    return true;
  }

  if (
    getDirectNotesForFolder(notes, folder?.id)
      .some((note) => valueMatchesSearch(note.title, search) && noteMatchesSelectedTags(note, search))
  ) {
    return true;
  }

  return (folder?.children ?? []).some((child) => matchesFolderSearch({ folder: child, notes, search }));
}
