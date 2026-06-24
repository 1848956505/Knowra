import { ensureOpenTab } from '../editor/tab-workspace.js';

export function toggleFolderOpen(openFolders = {}, folderId) {
  if (!folderId) {
    return { ...openFolders };
  }

  return {
    ...openFolders,
    [folderId]: !(openFolders[folderId] ?? true)
  };
}

export function openFolderBranch({ openFolders = {}, foldersById = {}, folderId = null } = {}) {
  const nextOpenFolders = { ...openFolders };
  let cursor = folderId ? foldersById[folderId] ?? null : null;

  while (cursor) {
    nextOpenFolders[cursor.id] = true;
    cursor = cursor.parentId ? foldersById[cursor.parentId] ?? null : null;
  }

  return nextOpenFolders;
}

export function resolveNavigationSelection({
  selectedFolderId = null,
  foldersById = {},
  activeNotes = [],
  visibleNotes = [],
  selectedNoteId = null,
  openNoteTabs = []
} = {}) {
  const nextSelectedFolderId = selectedFolderId && !foldersById[selectedFolderId]
    ? null
    : selectedFolderId;
  const existingNoteIds = new Set(activeNotes.map((note) => note.id));
  const filteredTabs = openNoteTabs.filter((noteId) => existingNoteIds.has(noteId));

  if (visibleNotes.length === 0) {
    return {
      selectedFolderId: nextSelectedFolderId,
      selectedNoteId: null,
      openNoteTabs: [],
      draftMarkdown: '',
      noteTagDraft: '',
      saveState: 'idle',
      lastSavedAt: null,
      shouldClearSideData: true
    };
  }

  const currentNoteStillVisible = visibleNotes.some((note) => note.id === selectedNoteId);
  const selectedNote = currentNoteStillVisible
    ? visibleNotes.find((note) => note.id === selectedNoteId)
    : visibleNotes[0];

  return {
    selectedFolderId: nextSelectedFolderId,
    selectedNoteId: selectedNote?.id ?? null,
    openNoteTabs: ensureOpenTab(filteredTabs, selectedNote?.id ?? null),
    draftMarkdown: selectedNote?.rawMarkdown ?? '',
    noteTagDraft: currentNoteStillVisible ? undefined : '',
    saveState: selectedNote ? 'saved' : 'idle',
    lastSavedAt: selectedNote?.updatedAt ?? null,
    shouldClearSideData: false
  };
}

export function resolveFolderSelection({
  folderId = null,
  selectedNoteId = null,
  visibleNotes = [],
  openNoteTabs = []
} = {}) {
  if (visibleNotes.length === 0) {
    return {
      selectedFolderId: folderId,
      selectedNoteId: null,
      openNoteTabs,
      draftMarkdown: '',
      shouldClearSideData: true,
      shouldLoadSideData: false
    };
  }

  const currentNoteStillVisible = visibleNotes.some((note) => note.id === selectedNoteId);
  if (currentNoteStillVisible) {
    return {
      selectedFolderId: folderId,
      selectedNoteId,
      openNoteTabs,
      shouldClearSideData: false,
      shouldLoadSideData: false
    };
  }

  const nextNote = visibleNotes[0];
  return {
    selectedFolderId: folderId,
    selectedNoteId: nextNote.id,
    openNoteTabs: ensureOpenTab(openNoteTabs, nextNote.id),
    draftMarkdown: nextNote.rawMarkdown ?? '',
    shouldClearSideData: false,
    shouldLoadSideData: true
  };
}
