import { ensureOpenTab } from '../../../lib/editor/tab-workspace.js';
import { insertNote as insertLocalNote } from '../../../lib/tree-workspace.js';
import {
  createLocalManualNoteInput,
  emptyLocalRecycleBin,
  moveLocalNoteToFolder,
  permanentlyDeleteLocalNote,
  renameLocalNote,
  restoreLocalNote,
  setLocalNoteFavorite,
  softDeleteLocalNote
} from '../../../lib/notes/state.js';

export function createNavigationNoteCommandController(deps, getController) {
  const {
    state,
    knowledgeApi,
    getNoteById,
    renderAll,
    refreshKnowledgeData,
    loadCurrentNoteSideData,
    syncLocalWorkspace
  } = deps;

async function createNote(folderId, title) {
  if (state.dataMode === 'api') {
    const created = await knowledgeApi.createNote({
      title,
      rawMarkdown: `# ${title}\n\n`,
      folderId,
      spaceId: state.currentSpaceId,
      sourceType: 'manual',
      status: 'draft'
    });

    state.selectedNoteId = created.id;
    state.libraryIndex.selectedNoteId = created.id;
    state.view.screen = 'editor';
    state.selectedFolderId = folderId ?? null;
    if (folderId) {
      getController().openFolderBranch(folderId);
    }
    await refreshKnowledgeData();
    await loadCurrentNoteSideData();
    renderAll();
    return;
  }

  const nextNote = createLocalManualNoteInput({
    title,
    folderId,
    spaceId: state.currentSpaceId
  });
  state.allNotes = insertLocalNote(state.allNotes, nextNote);
  state.selectedNoteId = nextNote.id;
  state.libraryIndex.selectedNoteId = nextNote.id;
  state.view.screen = 'editor';
  state.selectedFolderId = folderId ?? null;
  if (folderId) {
    getController().openFolderBranch(folderId);
  }
  syncLocalWorkspace();
}

async function renameNote(noteId, title) {
  if (state.dataMode === 'api') {
    await knowledgeApi.updateNote(noteId, { title });
    await refreshKnowledgeData();
    await loadCurrentNoteSideData();
    renderAll();
    return;
  }

  state.allNotes = renameLocalNote(state.allNotes, noteId, title);
  syncLocalWorkspace();
}

async function deleteNote(noteId) {
  if (state.dataMode === 'api') {
    await knowledgeApi.deleteNote(noteId);
    if (state.selectedNoteId === noteId) {
      state.selectedNoteId = null;
    }
    state.libraryIndex.selectedNoteId = noteId;
    state.libraryIndex.tab = 'recycle';
    state.view.screen = 'index';
    await refreshKnowledgeData();
    await loadCurrentNoteSideData();
    renderAll();
    return;
  }

  state.allNotes = softDeleteLocalNote(state.allNotes, noteId);
  if (state.selectedNoteId === noteId) {
    state.selectedNoteId = null;
  }
  state.libraryIndex.selectedNoteId = noteId;
  state.libraryIndex.tab = 'recycle';
  state.view.screen = 'index';
  syncLocalWorkspace();
}

async function permanentlyDeleteNote(noteId) {
  if (state.dataMode === 'api') {
    await knowledgeApi.permanentlyDeleteNote(noteId);
    if (state.selectedNoteId === noteId) {
      state.selectedNoteId = null;
    }
    await refreshKnowledgeData();
    await loadCurrentNoteSideData();
    renderAll();
    return;
  }

  state.allNotes = permanentlyDeleteLocalNote(state.allNotes, noteId);
  if (state.selectedNoteId === noteId) {
    state.selectedNoteId = null;
  }
  syncLocalWorkspace();
}

async function restoreNote(noteId) {
  if (state.dataMode === 'api') {
    await knowledgeApi.restoreNote(noteId);
    if (state.selectedNoteId === noteId) {
      state.selectedNoteId = null;
    }
    await refreshKnowledgeData();
    await loadCurrentNoteSideData();
    renderAll();
    return;
  }

  state.allNotes = restoreLocalNote(state.allNotes, noteId);
  syncLocalWorkspace();
}

async function emptyRecycleBin() {
  if (state.dataMode === 'api') {
    await knowledgeApi.emptyRecycleBin(state.currentSpaceId);
    if (state.selectedNoteId && getNoteById(state.selectedNoteId)?.deleted) {
      state.selectedNoteId = null;
    }
    await refreshKnowledgeData();
    await loadCurrentNoteSideData();
    renderAll();
    return;
  }

  state.allNotes = emptyLocalRecycleBin(state.allNotes);
  if (state.selectedNoteId && !getNoteById(state.selectedNoteId)) {
    state.selectedNoteId = null;
  }
  syncLocalWorkspace();
}

async function setNoteFavorite(noteId, favorite) {
  if (state.dataMode === 'api') {
    await knowledgeApi.setNoteFavorite(noteId, favorite);
    await refreshKnowledgeData();
    await loadCurrentNoteSideData();
    renderAll();
    return;
  }

  state.allNotes = setLocalNoteFavorite(state.allNotes, noteId, favorite);
  syncLocalWorkspace();
}

async function moveNote(noteId, nextFolderId) {
  if (state.dataMode === 'api') {
    const note = state.allNotes.find((item) => item.id === noteId);
    await knowledgeApi.updateNote(noteId, {
      title: note?.title,
      folderId: nextFolderId
    });
    if (nextFolderId) {
      getController().openFolderBranch(nextFolderId);
    }
    await refreshKnowledgeData();
    await loadCurrentNoteSideData();
    renderAll();
    return;
  }

  state.allNotes = moveLocalNoteToFolder(state.allNotes, noteId, nextFolderId);
  if (nextFolderId) {
    getController().openFolderBranch(nextFolderId);
  }
  syncLocalWorkspace();
}

async function selectNote(noteId, { syncFolder = false, ensureTab = true } = {}) {
  const note = state.allNotes.find((item) => item.id === noteId);
  if (!note) {
    return;
  }

  await deps.persistDraft({ immediate: true });
  state.selectedNoteId = noteId;
  state.libraryIndex.selectedNoteId = noteId;
  state.view.screen = 'editor';
  state.noteTagComposer.draft = '';
  if (ensureTab) {
    state.openNoteTabs = ensureOpenTab(state.openNoteTabs, noteId);
  }
  state.draftMarkdown = note.rawMarkdown ?? '';
  state.saveState = 'saved';
  state.lastSavedAt = note.updatedAt ?? null;

  if (syncFolder && note.folderId) {
    state.selectedFolderId = note.folderId;
    getController().openFolderBranch(note.folderId);
  }

  await loadCurrentNoteSideData();
  deps.saveCurrentEditorScrollPosition();
  renderAll();
  deps.flashStatus(`已切换到：${note.title}`);
}

  return {
    createNote,
    renameNote,
    deleteNote,
    permanentlyDeleteNote,
    restoreNote,
    emptyRecycleBin,
    setNoteFavorite,
    moveNote,
    selectNote
  };
}
