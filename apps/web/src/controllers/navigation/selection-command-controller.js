import { getVisibleNavigationNotes } from '../../../lib/navigation/visibility.js';
import {
  openFolderBranch as expandFolderBranch,
  resolveFolderSelection,
  toggleFolderOpen as toggleOpenFolderState
} from '../../../lib/navigation/selection.js';

export function createNavigationSelectionCommandController(deps, getController) {
  const {
    state,
    renderAll,
    loadCurrentNoteSideData,
    clearNoteSideData,
    persistDraft,
    flashStatus
  } = deps;

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
  state.libraryIndex.selectedNoteId = selection.selectedNoteId;
  state.libraryIndex.tab = 'all';
  state.libraryIndex.page = 1;
  state.view.screen = 'index';
  state.openNoteTabs = selection.openNoteTabs;

  if (selection.draftMarkdown !== undefined) {
    state.draftMarkdown = selection.draftMarkdown;
  }
  if (selection.draftTitle !== undefined) {
    state.draftTitle = selection.draftTitle;
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

function toggleFolderOpen(folderId) {
  state.openFolders = toggleOpenFolderState(state.openFolders, folderId);
  getController().renderFolders();
}

function openFolderBranch(folderId) {
  state.openFolders = expandFolderBranch({
    openFolders: state.openFolders,
    foldersById: state.foldersById,
    folderId
  });
}

  return {
    selectFolder,
    toggleFolderOpen,
    openFolderBranch
  };
}
