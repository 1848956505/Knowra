import { ensureOpenTab } from '../../../../lib/editor/tab-workspace.js';
import {
  buildMarkdownImportItems,
  getMarkdownImportStatusMessage
} from '../../../../lib/editor/file-menu.js';
import { insertNote as insertLocalNote } from '../../../../lib/tree-workspace.js';
import { createLocalImportedNoteInput } from '../../../../lib/notes/state.js';

export function createMarkdownImportController(deps, fileTarget) {
  const {
    state,
    knowledgeApi,
    refreshKnowledgeData,
    loadCurrentNoteSideData,
    renderAll,
    syncLocalWorkspace,
    openFolderBranch,
    flashStatus
  } = deps;

  async function importMarkdownFiles(files) {
    const folderId = fileTarget.getMenuTargetFolderId();
    const importedItems = await buildMarkdownImportItems(files);

    if (state.dataMode === 'api') {
      const importedResponseItems = await knowledgeApi.importMarkdownNotes(importedItems.map((item) => ({
        title: item.title,
        rawMarkdown: item.rawMarkdown,
        folderId,
        spaceId: state.currentSpaceId,
        sourceType: item.sourceType
      })));
      const firstImported = importedResponseItems.find((item) => item?.id) ?? null;
      state.allNotes = importedResponseItems.reduce((notes, item) => (
        item?.id
          ? insertLocalNote(notes, { ...item, contentLoaded: true })
          : notes
      ), state.allNotes);

      if (firstImported?.id) {
        state.selectedNoteId = firstImported.id;
        state.selectedFolderId = firstImported.folderId ?? folderId ?? null;
        state.openNoteTabs = ensureOpenTab(state.openNoteTabs, firstImported.id);
        if (state.selectedFolderId) {
          openFolderBranch(state.selectedFolderId);
        }
      }

      await refreshKnowledgeData();
      await loadCurrentNoteSideData();
      renderAll();

      flashStatus(getMarkdownImportStatusMessage(importedItems, firstImported));
      return;
    }

    state.allNotes = importedItems.reduce((notes, item) => insertLocalNote(notes, createLocalImportedNoteInput({
      item,
      folderId,
      spaceId: state.currentSpaceId
    })), state.allNotes);
    state.selectedNoteId = importedItems[0]?.id ?? state.selectedNoteId;
    state.selectedFolderId = folderId ?? null;
    state.openNoteTabs = importedItems.reduce(
      (tabs, item) => ensureOpenTab(tabs, item.id),
      state.openNoteTabs
    );
    if (state.selectedFolderId) {
      openFolderBranch(state.selectedFolderId);
    }
    syncLocalWorkspace();

    flashStatus(getMarkdownImportStatusMessage(importedItems));
  }

  return {
    importMarkdownFiles
  };
}
