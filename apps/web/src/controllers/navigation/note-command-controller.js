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
import { stripLegacyGeneratedTitle } from '../../../lib/notes/legacy-title.js';

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

async function runNoteMutation({
  apiMutation,
  localMutation,
  afterMutation
}) {
  const isApi = state.dataMode === 'api';
  const result = isApi
    ? await apiMutation()
    : localMutation();

  await afterMutation?.({ result, isApi });

  if (isApi) {
    await refreshKnowledgeData();
    await loadCurrentNoteSideData();
    renderAll();
  } else {
    syncLocalWorkspace();
  }

  return result;
}

async function createNote(folderId, title) {
  return runNoteMutation({
    apiMutation: () => knowledgeApi.createNote({
      title,
      rawMarkdown: '',
      folderId,
      spaceId: state.currentSpaceId,
      sourceType: 'manual',
      status: 'draft'
    }),
    localMutation: () => {
      const nextNote = createLocalManualNoteInput({
        title,
        folderId,
        spaceId: state.currentSpaceId
      });
      state.allNotes = insertLocalNote(state.allNotes, nextNote);
      return nextNote;
    },
    afterMutation: ({ result: created }) => {
      state.selectedNoteId = created.id;
      state.libraryIndex.selectedNoteId = created.id;
      state.view.screen = 'editor';
      state.selectedFolderId = folderId ?? null;
      if (folderId) {
        getController().openFolderBranch(folderId);
      }
    }
  });
}

async function renameNote(noteId, title) {
  return runNoteMutation({
    apiMutation: () => knowledgeApi.updateNote(noteId, { title }),
    localMutation: () => {
      state.allNotes = renameLocalNote(state.allNotes, noteId, title);
    }
  });
}

async function deleteNote(noteId) {
  return runNoteMutation({
    apiMutation: () => knowledgeApi.deleteNote(noteId),
    localMutation: () => {
      state.allNotes = softDeleteLocalNote(state.allNotes, noteId);
    },
    afterMutation: () => {
      if (state.selectedNoteId === noteId) {
        state.selectedNoteId = null;
      }
      state.libraryIndex.selectedNoteId = noteId;
      state.libraryIndex.tab = 'recycle';
      state.view.screen = 'index';
    }
  });
}

async function permanentlyDeleteNote(noteId) {
  return runNoteMutation({
    apiMutation: () => knowledgeApi.permanentlyDeleteNote(noteId),
    localMutation: () => {
      state.allNotes = permanentlyDeleteLocalNote(state.allNotes, noteId);
    },
    afterMutation: () => {
      if (state.selectedNoteId === noteId) {
        state.selectedNoteId = null;
      }
    }
  });
}

async function restoreNote(noteId) {
  return runNoteMutation({
    apiMutation: () => knowledgeApi.restoreNote(noteId),
    localMutation: () => {
      state.allNotes = restoreLocalNote(state.allNotes, noteId);
    },
    afterMutation: ({ isApi }) => {
      if (isApi && state.selectedNoteId === noteId) {
        state.selectedNoteId = null;
      }
    }
  });
}

async function emptyRecycleBin() {
  return runNoteMutation({
    apiMutation: () => knowledgeApi.emptyRecycleBin(state.currentSpaceId),
    localMutation: () => {
      state.allNotes = emptyLocalRecycleBin(state.allNotes);
    },
    afterMutation: ({ isApi }) => {
      const selectedNote = state.selectedNoteId
        ? getNoteById(state.selectedNoteId)
        : null;
      const shouldClearSelection = isApi
        ? selectedNote?.deleted
        : state.selectedNoteId && !selectedNote;
      if (shouldClearSelection) {
        state.selectedNoteId = null;
      }
    }
  });
}

async function setNoteFavorite(noteId, favorite) {
  return runNoteMutation({
    apiMutation: () => knowledgeApi.setNoteFavorite(noteId, favorite),
    localMutation: () => {
      state.allNotes = setLocalNoteFavorite(
        state.allNotes,
        noteId,
        favorite
      );
    }
  });
}

async function moveNote(noteId, nextFolderId) {
  return runNoteMutation({
    apiMutation: () => {
      const note = state.allNotes.find((item) => item.id === noteId);
      return knowledgeApi.updateNote(noteId, {
        title: note?.title,
        folderId: nextFolderId
      });
    },
    localMutation: () => {
      state.allNotes = moveLocalNoteToFolder(
        state.allNotes,
        noteId,
        nextFolderId
      );
    },
    afterMutation: () => {
      if (nextFolderId) {
        getController().openFolderBranch(nextFolderId);
      }
    }
  });
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
  state.draftMarkdown = stripLegacyGeneratedTitle({
    markdown: note.rawMarkdown,
    title: note.title,
    sourceType: note.sourceType
  });
  state.draftTitle = note.title;
  state.saveState = 'saved';
  state.lastSavedAt = note.updatedAt ?? null;

  if (syncFolder && note.folderId) {
    state.selectedFolderId = note.folderId;
    getController().openFolderBranch(note.folderId);
  }

  await loadCurrentNoteSideData();
  if (state.draftMarkdown !== (note.rawMarkdown ?? '')) {
    await deps.persistDraft();
  }
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
