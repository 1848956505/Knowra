import { createNavigationController } from './navigation-controller.js';
import { createEditorController } from './editor-controller.js';
import { createAnnotationController } from './annotation-controller.js';
import { createSidebarController } from './sidebar-controller.js';
import { createSearchController } from './search-controller.js';
import { createTagController } from './tag-controller.js';
import { createTabController } from './tab-controller.js';
import { createWorkspaceController } from './workspace-controller.js';
import { createShellController } from './shell-controller.js';
import { createEditorScrollController } from './editor/scroll-controller.js';

export function createAppControllers({
  state,
  elements,
  editorRuntime,
  knowledgeApi,
  constants,
  helpers
}) {
  const scrollController = createEditorScrollController({
    editorRuntime,
    storageKey: constants.scrollPositionsKey
  });

  const searchController = createSearchController({
    state,
    elements,
    getActiveNotes: helpers.getActiveNotes,
    reconcileSelection: helpers.reconcileSelection,
    renderAll: helpers.renderAll
  });

  const tagController = createTagController({
    state,
    knowledgeApi,
    getCurrentNote: helpers.getCurrentNote,
    replaceNoteInState: helpers.replaceNoteInState,
    persistBackendCache: helpers.persistBackendCache,
    renderAll: helpers.renderAll,
    renderSidebar: helpers.renderSidebar,
    flashStatus: helpers.flashStatus
  });

  const annotationController = createAnnotationController({
    state,
    elements,
    editorRuntime,
    knowledgeApi,
    getCurrentNote: helpers.getCurrentNote,
    renderSidebar: helpers.renderSidebar,
    flashStatus: helpers.flashStatus
  });

  const sidebarController = createSidebarController({
    state,
    elements,
    knowledgeApi,
    getCurrentNote: helpers.getCurrentNote,
    syncAnnotationMarkers: helpers.syncAnnotationMarkers,
    flashStatus: helpers.flashStatus,
    formatDate: helpers.formatDate
  });

  const workspaceController = createWorkspaceController({
    state,
    knowledgeApi,
    cacheKey: constants.backendCacheKey,
    flashStatus: helpers.flashStatus,
    loadCurrentNoteSideData: helpers.loadCurrentNoteSideData,
    loadLocalNoteSideData: helpers.loadLocalNoteSideData,
    persistScrollPositions: helpers.persistScrollPositions,
    reconcileSelection: helpers.reconcileSelection,
    renderAll: helpers.renderAll,
    saveCurrentEditorScrollPosition: helpers.saveCurrentEditorScrollPosition
  });

  const editorController = createEditorController({
    state,
    elements,
    editorRuntime,
    knowledgeApi,
    autosaveDelayMs: constants.autosaveDelayMs,
    getCurrentNote: helpers.getCurrentNote,
    getEffectiveViewState: helpers.getEffectiveViewState,
    renderAll: helpers.renderAll,
    renderTabs: helpers.renderTabs,
    renderFolders: helpers.renderFolders,
    renderSidebar: helpers.renderSidebar,
    renderStatus: helpers.renderStatus,
    persistBackendCache: helpers.persistBackendCache,
    refreshKnowledgeData: helpers.refreshKnowledgeData,
    loadCurrentNoteSideData: helpers.loadCurrentNoteSideData,
    syncLocalWorkspace: helpers.syncLocalWorkspace,
    openFolderBranch: helpers.openFolderBranch,
    closeContextMenu: helpers.closeContextMenu,
    closeSectionMenu: helpers.closeSectionMenu,
    closeTabMenu: helpers.closeTabMenu,
    createAnnotationFromCurrentSelection: helpers.createAnnotationFromCurrentSelection,
    syncAnnotationMarkers: helpers.syncAnnotationMarkers,
    restoreEditorScrollPosition: (...args) => scrollController.restoreEditorScrollPosition(...args),
    flashStatus: helpers.flashStatus,
    formatDate: helpers.formatDate,
    escapeHtml: helpers.escapeHtml,
    escapeAttribute: helpers.escapeAttribute
  });

  const navigationController = createNavigationController({
    state,
    elements,
    knowledgeApi,
    getActiveNotes: helpers.getActiveNotes,
    getRecycleNotes: helpers.getRecycleNotes,
    getNoteById: helpers.getNoteById,
    noteMatchesSelectedTags: helpers.noteMatchesSelectedTags,
    matchesSearch: helpers.matchesSearch,
    matchesFolderSearch: helpers.matchesFolderSearch,
    renderAll: helpers.renderAll,
    renderStatus: helpers.renderStatus,
    refreshKnowledgeData: helpers.refreshKnowledgeData,
    loadCurrentNoteSideData: helpers.loadCurrentNoteSideData,
    clearNoteSideData: helpers.clearNoteSideData,
    persistDraft: helpers.persistDraft,
    syncLocalWorkspace: helpers.syncLocalWorkspace,
    saveCurrentEditorScrollPosition: helpers.saveCurrentEditorScrollPosition,
    flashStatus: helpers.flashStatus,
    jumpToAttachmentReference: (...args) => sidebarController.jumpToAttachmentReference(...args),
    openAttachment: (...args) => sidebarController.openAttachment(...args),
    copyAttachmentLink: (...args) => sidebarController.copyAttachmentLink(...args),
    deleteAttachment: (...args) => sidebarController.deleteAttachment(...args),
    startAttachmentRename: (...args) => sidebarController.startAttachmentRename(...args),
    insertAttachmentAtCursor: (...args) => editorController.insertAttachmentAtCursor(...args),
    removeAttachmentFromCurrentNote: (...args) => editorController.removeAttachmentFromCurrentNote(...args),
    escapeHtml: helpers.escapeHtml
  });

  const tabController = createTabController({
    state,
    elements,
    closeContextMenu: helpers.closeContextMenu,
    closeSectionMenu: helpers.closeSectionMenu,
    flashStatus: helpers.flashStatus,
    persistBackendCache: helpers.persistBackendCache,
    persistDraft: helpers.persistDraft,
    renderAll: helpers.renderAll,
    selectNote: helpers.selectNote
  });

  const shellController = createShellController({
    state,
    elements,
    railItems: helpers.railItems,
    getCurrentNote: helpers.getCurrentNote,
    getVisibleNotes: helpers.getVisibleNotes,
    renderEditor: helpers.renderEditor,
    renderEditorContextMenu: helpers.renderEditorContextMenu,
    renderEditorMenuBar: helpers.renderEditorMenuBar,
    renderFolders: helpers.renderFolders,
    renderSearchShell: helpers.renderSearchShell,
    renderSidebar: helpers.renderSidebar,
    renderTabs: helpers.renderTabs,
    reportRuntimeError: helpers.reportRuntimeError
  });

  return {
    scrollController,
    searchController,
    tagController,
    annotationController,
    sidebarController,
    workspaceController,
    navigationController,
    tabController,
    editorController,
    shellController
  };
}
