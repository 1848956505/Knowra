import { ensureOpenTab } from '../../../lib/editor/tab-workspace.js';
import {
  deleteFolder as deleteLocalFolderTree,
  insertFolder as insertLocalFolder,
  insertNote as insertLocalNote,
  moveFolder as moveLocalFolderTree,
  renameFolder as renameLocalFolderTree
} from '../../../lib/tree-workspace.js';
import { createLocalFolderInput } from '../../../lib/folders/state.js';
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
import { getVisibleNavigationNotes } from '../../../lib/navigation/visibility.js';
import {
  openFolderBranch as expandFolderBranch,
  resolveFolderSelection,
  toggleFolderOpen as toggleOpenFolderState
} from '../../../lib/navigation/selection.js';
import { validateTreeEditorName as validateNavigationTreeEditorName } from '../../../lib/navigation/tree-editor.js';

export function createNavigationTreeCommandController(deps, getController) {
  const {
    state,
    elements,
    knowledgeApi,
    getNoteById,
    renderAll,
    refreshKnowledgeData,
    loadCurrentNoteSideData,
    clearNoteSideData,
    persistDraft,
    syncLocalWorkspace,
    saveCurrentEditorScrollPosition,
    flashStatus
  } = deps;

function startTreeEditor({ mode, parentId = null, targetId = null, value = '' }) {
  state.treeEditor = {
    mode,
    parentId,
    targetId,
    value
  };
  getController().clearDeleteIntent({ rerender: false });
  getController().closeContextMenu();
  getController().getController().renderFolders();
}

function cancelTreeEditor() {
  if (!state.treeEditor) {
    return;
  }
  state.treeEditor = null;
  getController().getController().renderFolders();
}

async function submitTreeEditor() {
  if (!state.treeEditor) {
    return;
  }

  const trimmedValue = state.treeEditor.value.trim();
  if (!trimmedValue) {
    flashStatus('请输入名称');
    focusInlineEditor();
    return;
  }

  const editor = state.treeEditor;

  try {
    validateTreeEditorName(editor, trimmedValue);
    state.treeEditor = null;

    switch (editor.mode) {
      case 'create-folder':
        await createFolder(editor.parentId, trimmedValue);
        flashStatus(`目录已创建：${trimmedValue}`);
        return;
      case 'rename-folder':
        await renameFolder(editor.targetId, trimmedValue);
        flashStatus(`目录已重命名：${trimmedValue}`);
        return;
      case 'create-note':
        await createNote(editor.parentId, trimmedValue);
        flashStatus(`文件已创建：${trimmedValue}`);
        return;
      case 'rename-note':
        await renameNote(editor.targetId, trimmedValue);
        flashStatus(`文件已重命名：${trimmedValue}`);
        return;
      default:
        return;
    }
  } catch (error) {
    flashStatus(error.message || '操作失败');
    state.treeEditor = editor;
    getController().getController().renderFolders();
  }
}

async function commitDelete(kind, targetId) {
  getController().clearDeleteIntent({ rerender: false });

  try {
    if (kind === 'folder') {
      await deleteFolder(targetId);
      flashStatus('目录已删除');
    } else if (kind === 'note') {
      await deleteNote(targetId);
      flashStatus('文件已删除');
    }
  } catch (error) {
    flashStatus(error.message || '删除失败');
  }
}

async function createFolder(parentId, name) {
  if (state.dataMode === 'api') {
    const created = await knowledgeApi.createFolder({
      spaceId: state.currentSpaceId,
      parentId,
      name
    });

    if (parentId) {
      state.openFolders[parentId] = true;
    }
    state.selectedFolderId = created.id;
    await refreshKnowledgeData();
    return;
  }

  const nextFolder = createLocalFolderInput({
    name,
    parentId,
    spaceId: state.currentSpaceId
  });
  state.folderTree = insertLocalFolder(state.folderTree, nextFolder);
  if (parentId) {
    state.openFolders[parentId] = true;
  }
  state.selectedFolderId = nextFolder.id;
  syncLocalWorkspace();
}

async function renameFolder(folderId, name) {
  if (state.dataMode === 'api') {
    const folder = state.foldersById[folderId];
    await knowledgeApi.updateFolder(folderId, {
      name,
      parentId: folder?.parentId ?? null
    });
    await refreshKnowledgeData();
    return;
  }

  state.folderTree = renameLocalFolderTree(state.folderTree, folderId, name);
  syncLocalWorkspace();
}

async function deleteFolder(folderId) {
  if (state.dataMode === 'api') {
    const nextSelectedFolderId = state.foldersById[folderId]?.parentId ?? null;
    await knowledgeApi.deleteFolder(folderId);
    state.selectedFolderId = nextSelectedFolderId;
    await refreshKnowledgeData();
    return;
  }

  const nextSelectedFolderId = state.foldersById[folderId]?.parentId ?? null;
  const result = deleteLocalFolderTree(state.folderTree, state.allNotes, folderId);
  state.folderTree = result.tree;
  state.allNotes = result.notes;
  state.selectedFolderId = nextSelectedFolderId;
  syncLocalWorkspace();
}

async function moveFolder(folderId, nextParentId) {
  if (state.dataMode === 'api') {
    const folder = state.foldersById[folderId];
    await knowledgeApi.updateFolder(folderId, {
      name: folder?.name,
      parentId: nextParentId
    });
    if (nextParentId) {
      openFolderBranch(nextParentId);
    }
    await refreshKnowledgeData();
    return;
  }

  state.folderTree = moveLocalFolderTree(state.folderTree, folderId, nextParentId);
  if (nextParentId) {
    openFolderBranch(nextParentId);
  }
  syncLocalWorkspace();
}

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
    state.selectedFolderId = folderId ?? null;
    if (folderId) {
      openFolderBranch(folderId);
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
  state.selectedFolderId = folderId ?? null;
  if (folderId) {
    openFolderBranch(folderId);
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
    await refreshKnowledgeData();
    await loadCurrentNoteSideData();
    renderAll();
    return;
  }

  state.allNotes = softDeleteLocalNote(state.allNotes, noteId);
  if (state.selectedNoteId === noteId) {
    state.selectedNoteId = null;
  }
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
      openFolderBranch(nextFolderId);
    }
    await refreshKnowledgeData();
    await loadCurrentNoteSideData();
    renderAll();
    return;
  }

  state.allNotes = moveLocalNoteToFolder(state.allNotes, noteId, nextFolderId);
  if (nextFolderId) {
    openFolderBranch(nextFolderId);
  }
  syncLocalWorkspace();
}

async function selectFolder(folderId) {
  await persistDraft({ immediate: true });
  const selection = resolveFolderSelection({
    folderId,
    selectedNoteId: state.selectedNoteId,
    visibleNotes: getVisibleNavigationNotes({
      notes: state.allNotes,
      foldersById: state.foldersById,
      selectedFolderId: folderId,
      search: state.search
    }),
    openNoteTabs: state.openNoteTabs
  });

  state.selectedFolderId = selection.selectedFolderId;
  state.selectedNoteId = selection.selectedNoteId;
  state.openNoteTabs = selection.openNoteTabs;

  if (selection.draftMarkdown !== undefined) {
    state.draftMarkdown = selection.draftMarkdown;
  }

  if (selection.shouldClearSideData) {
    clearNoteSideData();
  }

  if (selection.shouldLoadSideData) {
    await loadCurrentNoteSideData();
  }

  renderAll();
  flashStatus(`已切换到目录：${state.foldersById[folderId]?.name ?? ''}`);
}

async function selectNote(noteId, { syncFolder = false, ensureTab = true } = {}) {
  const note = state.allNotes.find((item) => item.id === noteId);
  if (!note) {
    return;
  }

  await persistDraft({ immediate: true });
  state.selectedNoteId = noteId;
  state.noteTagComposer.draft = '';
  if (ensureTab) {
    state.openNoteTabs = ensureOpenTab(state.openNoteTabs, noteId);
  }
  state.draftMarkdown = note.rawMarkdown ?? '';
  state.saveState = 'saved';
  state.lastSavedAt = note.updatedAt ?? null;

  if (syncFolder && note.folderId) {
    state.selectedFolderId = note.folderId;
    openFolderBranch(note.folderId);
  }

  await loadCurrentNoteSideData();
  saveCurrentEditorScrollPosition();
  renderAll();
  flashStatus(`已切换到：${note.title}`);
}

function toggleFolderOpen(folderId) {
  state.openFolders = toggleOpenFolderState(state.openFolders, folderId);
  getController().getController().renderFolders();
}

function openFolderBranch(folderId) {
  state.openFolders = expandFolderBranch({
    openFolders: state.openFolders,
    foldersById: state.foldersById,
    folderId
  });
}

function validateTreeEditorName(editor, candidateName) {
  validateNavigationTreeEditorName({
    editor,
    candidateName,
    foldersById: state.foldersById,
    folderTree: state.folderTree,
    notes: state.allNotes
  });
}

function focusInlineEditor() {
  if (!state.treeEditor) {
    return;
  }

  window.requestAnimationFrame(() => {
    const input = elements.folderTree?.querySelector('[data-inline-editor-input]');
    if (!input) {
      return;
    }
    input.focus();
    input.select();
  });
}

  return {
    startTreeEditor,
    cancelTreeEditor,
    submitTreeEditor,
    commitDelete,
    createFolder,
    renameFolder,
    deleteFolder,
    moveFolder,
    createNote,
    renameNote,
    deleteNote,
    permanentlyDeleteNote,
    restoreNote,
    emptyRecycleBin,
    setNoteFavorite,
    moveNote,
    selectFolder,
    selectNote,
    toggleFolderOpen,
    openFolderBranch,
    validateTreeEditorName,
    focusInlineEditor
  };
}
