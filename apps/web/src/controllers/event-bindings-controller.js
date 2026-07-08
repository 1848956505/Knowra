import { reorderTabs } from '../../lib/editor/tab-workspace.js';
import { resolveEditorPanelKeyboardAction } from '../../lib/editor/find-navigation.js';
import { resolveEditorShortcutAction } from '../../lib/editor/shortcut-actions.js';
import { resolveClickTarget } from '../../lib/navigation/click-target.js';
import { resolveContextMenuTarget } from '../../lib/navigation/context-menu.js';
import { bindSearchEvents } from '../../lib/events/search-events.js';
import { bindWindowEvents } from '../../lib/events/window-events.js';
import { bindDocumentClickEvents } from '../../lib/events/document-click-events.js';
import { bindDocumentKeyboardEvents } from '../../lib/events/document-keyboard-events.js';
import { bindDocumentInputEvents } from '../../lib/events/document-input-events.js';
import { bindDocumentActionEvents } from '../../lib/events/document-action-events.js';
import { bindMenuEvents } from '../../lib/events/menu-events.js';
import { bindFolderTreeEvents } from '../../lib/events/folder-tree-events.js';
import { bindNoteTabEvents } from '../../lib/events/note-tab-events.js';
import { bindEditorContentEvents } from '../../lib/events/editor-content-events.js';
import { bindAsideEvents } from '../../lib/events/aside-events/index.js';

export function bindAppEvents({
  state,
  elements,
  editorRuntime,
  controllers,
  helpers
}) {
  const {
    editorController,
    knowledgePointController,
    navigationController,
    scrollController,
    searchController,
    shellController,
    sidebarController,
    tabController,
    tagController
  } = controllers;
  const pendingAttachmentJumpTimers = new Set();

  function cancelPendingAttachmentJump() {
    if (!pendingAttachmentJumpTimers.size) {
      return;
    }

    pendingAttachmentJumpTimers.forEach((timerId) => window.clearTimeout(timerId));
    pendingAttachmentJumpTimers.clear();
  }

  function scheduleAttachmentJump(callback) {
    // 220ms 防抖延迟：区分单击（跳转到下一个引用位置）和双击（跳转到上一个引用位置）。
    // 双击时 cancelPendingAttachmentJump 会在 dblclick 处理器中清除此定时器，阻止跳转。
    // 220ms 是标准 click/dblclick 区分阈值，低于多数用户的双击间隔，避免用户感觉单击响应迟钝。
    const timerId = window.setTimeout(() => {
      pendingAttachmentJumpTimers.delete(timerId);
      callback?.();
    }, 220);
    pendingAttachmentJumpTimers.add(timerId);
  }

  const deps = {
    toggleSearchTagFilter: (...args) => searchController.toggleSearchTagFilter(...args),
    focusSearchInput: (...args) => searchController.focusSearchInput(...args),
    renderSearchShell: (...args) => searchController.renderSearchShell(...args),
    clearSearchFilters: (...args) => searchController.clearSearchFilters(...args),
    getSearchResultNotes: (...args) => searchController.getSearchResultNotes(...args),
    selectNote: (...args) => navigationController.selectNote(...args),
    closeContextMenu: (...args) => navigationController.closeContextMenu(...args),
    renderFolders: (...args) => navigationController.renderFolders(...args),
    toggleFolderOpen: (...args) => navigationController.toggleFolderOpen(...args),
    selectFolder: (...args) => navigationController.selectFolder(...args),
    renderStatus: (...args) => shellController.renderStatus(...args),
    openContextMenu: (...args) => navigationController.openContextMenu(...args),
    syncDragIndicators: (...args) => navigationController.syncDragIndicators(...args),
    commitDrop: (...args) => navigationController.commitDrop(...args),
    resetDragState: (...args) => navigationController.resetDragState(...args),
    submitTreeEditor: (...args) => navigationController.submitTreeEditor(...args),
    cancelTreeEditor: (...args) => navigationController.cancelTreeEditor(...args),
    commitDelete: (...args) => navigationController.commitDelete(...args),
    clearDeleteIntent: (...args) => navigationController.clearDeleteIntent(...args),
    resolveClickTarget,
    resolveContextMenuTarget,
    resolveDropTarget: (...args) => navigationController.resolveDropTarget(...args),
    canDropOnTarget: (...args) => navigationController.canDropOnTarget(...args),
    reconcileSelection: (...args) => helpers.reconcileSelection(...args),
    renderAll: (...args) => shellController.renderAll(...args),
    importMarkdownFiles: (...args) => editorController.importMarkdownFiles(...args),
    flashStatus: (...args) => helpers.flashStatus(...args),

    handleContextMenuAction: (...args) => navigationController.handleContextMenuAction(...args),
    renderEditorMenuBar: (...args) => editorController.renderEditorMenuBar(...args),
    handleFileMenuAction: (...args) => editorController.handleFileMenuAction(...args),
    handleEditMenuAction: (...args) => editorController.handleEditMenuAction(...args),
    handleParagraphMenuAction: (...args) => editorController.handleParagraphMenuAction(...args),
    handleFormatMenuAction: (...args) => editorController.handleFormatMenuAction(...args),
    handleViewMenuAction: (...args) => editorController.handleViewMenuAction(...args),

    handleFormat: (...args) => editorController.handleFormat(...args),
    closeSectionMenu: (...args) => navigationController.closeSectionMenu(...args),
    closeTabMenu: (...args) => tabController.closeTabMenu(...args),
    closeEditorMenuBar: (...args) => editorController.closeEditorMenuBar(...args),
    closeEditorContextMenu: (...args) => editorController.closeEditorContextMenu(...args),

    closeTableInsertDialog: (...args) => editorController.closeTableInsertDialog(...args),
    submitTableInsertDialog: (...args) => editorController.submitTableInsertDialog(...args),
    resolveEditorPanelKeyboardAction,
    handleEditorPanelAction: (...args) => editorController.handleEditorPanelAction(...args),
    resolveEditorShortcutAction,
    shouldHandleEditorShortcut: (...args) => editorController.shouldHandleEditorShortcut(...args),
    handleResolvedEditorShortcut: (...args) => editorController.handleResolvedEditorShortcut(...args),
    closeEditorPanel: (...args) => editorController.closeEditorPanel(...args),
    getCurrentEditorHost: () => editorRuntime.currentEditorHost,
    getCurrentNote: () => helpers.getCurrentNote(),

    handleTabClose: (...args) => tabController.handleTabClose(...args),
    openTabMenu: (...args) => tabController.openTabMenu(...args),
    syncTabDragIndicators: (...args) => tabController.syncTabDragIndicators(...args),
    reorderTabs,
    resetTabDragState: (...args) => tabController.resetTabDragState(...args),
    handleTabMenuAction: (...args) => tabController.handleTabMenuAction(...args),

    openEditorContextMenu: (...args) => editorController.openEditorContextMenu(...args),
    focusKnowledgePointFromMarker: (...args) => knowledgePointController.focusKnowledgePointFromMarker(...args),
    handleEditorContextMenuAction: (...args) => editorController.handleEditorContextMenuAction(...args),
    scheduleAutosave: (...args) => editorController.scheduleAutosave(...args),
    syncSourcePreview: (...args) => editorController.syncSourcePreview(...args),
    persistDraft: (...args) => editorController.persistDraft(...args),

    renderSidebar: (...args) => sidebarController.renderSidebar(...args),
    openAttachment: (...args) => sidebarController.openAttachment(...args),
    jumpToAttachmentReference: (...args) => sidebarController.jumpToAttachmentReference(...args),
    scheduleAttachmentJump,
    cancelPendingAttachmentJump,
    startAttachmentRename: (...args) => sidebarController.startAttachmentRename(...args),
    updateAttachmentRenameDraft: (...args) => sidebarController.updateAttachmentRenameDraft(...args),
    cancelAttachmentRename: (...args) => sidebarController.cancelAttachmentRename(...args),
    submitAttachmentRename: (...args) => sidebarController.submitAttachmentRename(...args),
    addTagToCurrentNote: (...args) => tagController.addTagToCurrentNote(...args),
    removeTagFromCurrentNote: (...args) => tagController.removeTagFromCurrentNote(...args),
    createTagAndAssignToCurrentNote: (...args) => tagController.createTagAndAssignToCurrentNote(...args),
    updateCurrentKnowledgePoint: (...args) => knowledgePointController.updateCurrentKnowledgePoint(...args),
    attachSelectionToExistingKnowledgePoint: (...args) => knowledgePointController.attachSelectionToExistingKnowledgePoint(...args),
    removeKnowledgePointSourceFromCurrentNote: (...args) => knowledgePointController.removeKnowledgePointSourceFromCurrentNote(...args),
    deleteKnowledgePointFromLibrary: (...args) => knowledgePointController.deleteKnowledgePointFromLibrary(...args),
    selectKnowledgePointSource: (...args) => knowledgePointController.selectKnowledgePointSource(...args),
    findOutlineHeadingTarget: (...args) => sidebarController.findOutlineHeadingTarget(...args),

    saveCurrentEditorScrollPosition: (...args) => scrollController.saveCurrentEditorScrollPosition(...args),
    persistScrollPositions: (...args) => scrollController.persistScrollPositions(...args)
  };

  bindSearchEvents({ state, elements, deps });
  bindWindowEvents({ state, elements, deps });
  bindDocumentClickEvents({ state, elements, deps });
  bindDocumentKeyboardEvents({ state, elements, deps });
  bindDocumentInputEvents({ state, elements, deps });
  bindDocumentActionEvents({ state, elements, deps });
  bindMenuEvents({ state, elements, deps });
  bindFolderTreeEvents({ state, elements, deps });
  bindNoteTabEvents({ state, elements, deps });
  bindEditorContentEvents({ state, elements, deps });
  bindAsideEvents({ state, elements, deps });
}
