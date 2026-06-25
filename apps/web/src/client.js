import { knowledgeBaseSeed } from '../lib/mock-knowledge-base.js';
import { createMilkdownHost } from '../lib/editor/milkdown-bundle.js';
import {
  buildNoteTabPath,
  closeOtherTabs,
  closeTab,
  ensureOpenTab,
  reorderTabs
} from '../lib/editor/tab-workspace.js';
import {
  buildMarkdownImportItems,
  buildNoteExportHtml,
  buildExportFileName,
  createDuplicateTitle,
  createLocalDuplicateNoteInput,
  createUntitledName,
  deriveNoteTitleFromMarkdown,
  getSiblingNamesForFolder,
  getMarkdownImportStatusMessage
} from '../lib/editor/file-menu.js';
import {
  applyEditorPanelMatchResult,
  createOpenedEditorPanelState
} from '../lib/editor/editor-panel-state.js';
import {
  createLocalDraftNote,
  resolveDraftSaveState
} from '../lib/editor/draft-state.js';
import { renderEditorPanelMarkup } from '../lib/editor/editor-panel-renderers.js';
import { resolveEditorPanelKeyboardAction } from '../lib/editor/find-navigation.js';
import {
  captureScrollPosition,
  getSavedScrollTop,
  readScrollPositions,
  writeScrollPositions
} from '../lib/editor/scroll-positions.js';
import { extractMarkdownHeadings, renderMarkdownPreview } from '../lib/markdown.js';
import {
  createBackendSnapshot,
  mergeWorkspaceSnapshots,
  selectInitialWorkspaceSource,
  selectLoadRecovery
} from '../lib/workspace-loading.js';
import {
  clearWorkspaceCache,
  readInitialWorkspaceSnapshot as readInitialWorkspaceSnapshotFromSource,
  readWorkspaceCache,
  writeWorkspaceCache
} from '../lib/workspace-cache.js';
import {
  normalizeFolderTree,
  normalizeNotes,
  replaceNoteInCollection
} from '../lib/workspace-normalization.js';
import { buildMockWorkspaceState } from '../lib/mock-workspace.js';
import {
  deleteFolder as deleteLocalFolderTree,
  flattenFolderTree,
  insertFolder as insertLocalFolder,
  insertNote as insertLocalNote,
  moveFolder as moveLocalFolderTree,
  renameFolder as renameLocalFolderTree,
  resolveNoteVisualType
} from '../lib/tree-workspace.js';
import { createLocalFolderInput } from '../lib/folders/state.js';
import {
  createLocalImportedNoteInput,
  createLocalManualNoteInput,
  emptyLocalRecycleBin,
  moveLocalNoteToFolder,
  permanentlyDeleteLocalNote,
  renameLocalNote,
  restoreLocalNote,
  setLocalNoteFavorite,
  softDeleteLocalNote
} from '../lib/notes/state.js';
import {
  getEditorShortcutLabel,
  resolveEditorShortcutAction
} from '../lib/editor/shortcut-actions.js';
import { EDITOR_CONTEXT_PRIMARY_ACTIONS } from '../lib/editor/context-menu-model.js';
import { renderEditorContextMenuMarkup } from '../lib/editor/context-menu-renderers.js';
import { renderEditorMenuBarMarkup } from '../lib/editor/menu-renderers.js';
import { getSaveStateLabel } from '../lib/editor/save-indicator.js';
import {
  renderPreviewPane as renderPreviewPaneMarkup,
  renderSourceEditorPane as renderSourceEditorPaneMarkup,
  renderSourceEditorView as renderSourceEditorViewMarkup
} from '../lib/editor/preview-renderers.js';
import {
  renderEmptyNoteTabs,
  renderNoteTabs as renderNoteTabsMarkup
} from '../lib/editor/tab-renderers.js';
import { renderRichEditorHost } from '../lib/editor/view-renderers.js';
import { resolveEditorRenderState } from '../lib/editor/view-state.js';
import {
  normalizeTableDialogValue,
  renderTableInsertDialogMarkup
} from '../lib/editor/table-dialog-renderers.js';
import { renderNoteTabMenuItems } from '../lib/editor/tab-menu-renderers.js';
import { renderKnowledgePointPanel } from '../lib/knowledge-points/panel.js';
import { getKnowledgePointFormUpdates } from '../lib/knowledge-points/form.js';
import {
  buildKnowledgePointInputFromSelection,
  buildKnowledgePointSourceInputFromSelection
} from '../lib/knowledge-points/selection.js';
import {
  addLocalKnowledgePointSource,
  buildCurrentNoteKnowledgePointSources,
  createLocalKnowledgePointAggregate,
  insertKnowledgePointCollections,
  removeLocalKnowledgePointSource,
  removeKnowledgePointCollections,
  replaceKnowledgePointCollections,
  syncKnowledgePointMembershipCollections
} from '../lib/knowledge-points/state.js';
import {
  buildTagInput,
  findTagByName,
  normalizeTagName,
  removeTagFromCollections,
  upsertTag
} from '../lib/tags/state.js';
import {
  getSelectedSearchTags as selectSearchTags,
  getTagUsageCount as countTagUsage,
  getVisibleSearchTags as selectVisibleSearchTags,
  hasActiveSearchFilters as hasSearchFilters,
  matchesSearch as valueMatchesSearch,
  noteMatchesSelectedTags as noteHasSelectedSearchTags,
  toggleSearchTagId,
  withTagUsageCounts
} from '../lib/search/state.js';
import {
  renderSearchPanel as renderSearchPanelMarkup,
  renderSearchShell as renderSearchShellMarkup,
  renderSelectedSearchChips
} from '../lib/search/renderers.js';
import {
  renderDeleteIntentRow as renderDeleteIntentRowMarkup,
  renderEmptyTreeItem,
  renderFolderIcon,
  renderInlineEditorRow as renderInlineEditorRowMarkup,
  renderNavigationSection,
  renderNoteIcon,
  renderNoteNode as renderNoteNodeMarkup,
  renderRecycleNoteNode as renderRecycleNoteNodeMarkup
} from '../lib/navigation/tree-renderers.js';
import {
  getDirectNotesForFolder as selectDirectNotesForFolder,
  getSearchResultNotes as selectSearchResultNotes,
  getVisibleNavigationNotes,
  matchesFolderSearch as folderMatchesNavigationSearch
} from '../lib/navigation/visibility.js';
import {
  canDropOnTarget as canDropOnNavigationTarget,
  resolveDropTarget as resolveNavigationDropTarget
} from '../lib/navigation/drag-drop.js';
import { resolveClickTarget } from '../lib/navigation/click-target.js';
import {
  getContextMenuItems as getNavigationContextMenuItems,
  resolveContextMenuTarget
} from '../lib/navigation/context-menu.js';
import { renderContextMenuItems } from '../lib/navigation/context-menu-renderers.js';
import {
  SECONDARY_SECTION_ITEMS,
  renderSectionMenuItems
} from '../lib/navigation/section-menu-renderers.js';
import {
  createClearedNoteSideData,
  createLocalNoteSideData
} from '../lib/sidebar/state.js';
import {
  ASIDE_TABS,
  resolveAsideContentKey
} from '../lib/sidebar/tabs.js';
import {
  renderAiTab,
  renderAsideEmptyInline,
  renderAsideTabs,
  renderAsideEmptyState
} from '../lib/sidebar/renderers.js';
import { renderInfoTab as renderInfoTabMarkup } from '../lib/sidebar/info-panel.js';
import { renderOutlineTab as renderOutlineTabMarkup } from '../lib/sidebar/outline-panel.js';
import {
  renderStatusIndicators,
  renderStatusMeta
} from '../lib/status/renderers.js';
import { renderModuleRail } from '../lib/shell/rail-renderers.js';
import { getEffectiveViewState as selectEffectiveViewState } from '../lib/shell/view-state.js';
import {
  buildFolderPath,
  openFolderBranch as expandFolderBranch,
  resolveFolderSelection,
  resolveNavigationSelection,
  toggleFolderOpen as toggleOpenFolderState
} from '../lib/navigation/selection.js';
import { validateTreeEditorName as validateNavigationTreeEditorName } from '../lib/navigation/tree-editor.js';
import { bindSearchEvents } from '../lib/events/search-events.js';
import { bindWindowEvents } from '../lib/events/window-events.js';
import { bindDocumentClickEvents } from '../lib/events/document-click-events.js';
import { bindDocumentKeyboardEvents } from '../lib/events/document-keyboard-events.js';
import { bindDocumentInputEvents } from '../lib/events/document-input-events.js';
import { knowledgeApi } from './services/knowledge-api.js';

const BACKEND_CACHE_KEY = 'study-accelerator.backend-workspace-cache';
const AUTOSAVE_DELAY_MS = 700;

const state = {
  dataMode: 'loading',
  spaces: [],
  currentSpaceId: null,
  folderTree: [],
  foldersById: {},
  allNotes: [],
  tags: [],
  selectedNoteId: null,
  selectedFolderId: null,
  navSections: {
    materials: true,
    favorites: false,
    recent: false,
    recycle: false
  },
  secondarySections: {
    favorites: true,
    recent: true,
    recycle: true
  },
  asideTab: 'info',
  openFolders: {},
  draftMarkdown: '',
  search: {
    keyword: '',
    selectedTagIds: [],
    isOpen: false
  },
  noteTagComposer: {
    draft: '',
    isExpanded: false
  },
  linkedNotes: [],
  attachments: [],
  knowledgePoints: [],
  allKnowledgePoints: [],
  knowledgePointTagGroups: [],
  knowledgePointFilters: {
    query: '',
    tagIds: [],
    isOpen: false
  },
  knowledgePointAttachComposer: {
    query: '',
    isOpen: false
  },
  expandedKnowledgePointIds: {},
  knowledgePointEditing: null,
  openNoteTabs: [],
  editorMenuOpen: null,
  view: {
    mode: 'edit',
    showLeftSidebar: true,
    showRightSidebar: true,
    showSourceEditor: false
  },
  editorPanel: {
    open: false,
    mode: null,
    query: '',
    replacement: '',
    matchIndex: -1,
    matchCount: 0,
    autoFocusInput: false
  },
  editorTableDialog: {
    open: false,
    rows: '4',
    cols: '3',
    autoFocusInput: false
  },
  sectionMenuOpen: false,
  contextMenu: {
    open: false,
    x: 0,
    y: 0,
    targetKind: null,
    targetId: null
  },
  tabMenu: {
    open: false,
    x: 0,
    y: 0,
    noteId: null
  },
  editorContextMenu: {
    open: false,
    x: 0,
    y: 0
  },
  treeEditor: null,
  deleteIntent: null,
  dragState: {
    activeKind: null,
    activeId: null,
    overKind: null,
    overId: null
  },
  tabDragState: {
    activeId: null,
    overId: null
  },
  saveState: 'idle',
  lastSavedAt: null,
  statusMessage: '正在加载知识库...'
};

const railItems = [
  { key: 'knowledge', active: true },
  { key: 'paper', active: false },
  { key: 'ai', active: false },
  { key: 'task', active: false },
  { key: 'review', active: false },
  { key: 'settings', active: false }
];

const elements = {};
let autosaveTimer = null;
let currentEditorHost = null;
let currentEditorNoteId = null;
let pendingEditorNoteId = null;
let editorMountToken = 0;

/** 笔记编辑器滚动位置记录（noteId → scrollTop） */
const editorScrollPositions = {};
const SCROLL_POSITIONS_KEY = 'study-accelerator.editor-scroll-positions';

function saveCurrentEditorScrollPosition() {
  const root = document.getElementById('milkdown-editor');
  if (root) {
    captureScrollPosition(editorScrollPositions, currentEditorNoteId, root.scrollTop);
  }
}

function restoreEditorScrollPosition(noteId) {
  const root = document.getElementById('milkdown-editor');
  const saved = getSavedScrollTop(editorScrollPositions, noteId);
  if (root && saved) {
    requestAnimationFrame(() => {
      root.scrollTop = saved;
    });
  }
}

function persistScrollPositions() {
  writeScrollPositions(window.localStorage, SCROLL_POSITIONS_KEY, editorScrollPositions);
}

function loadScrollPositions() {
  Object.assign(editorScrollPositions, readScrollPositions(window.localStorage, SCROLL_POSITIONS_KEY));
}

initialize();

function initialize() {
  cacheElements();
  bindRuntimeErrorHandlers();
  renderRail();
  bindEvents();

  // 读取本地保存的编辑器滚动位置
  loadScrollPositions();

  const initialSnapshot = readInitialWorkspaceSnapshot();
  const cachedSnapshot = readBackendCache();
  let startupSnapshot = mergeWorkspaceSnapshots(initialSnapshot, cachedSnapshot);

  if (selectInitialWorkspaceSource({ cachedSnapshot: startupSnapshot }) === 'cache') {
    state.dataMode = 'cache';
    state.statusMessage = initialSnapshot ? '后端资料已同步' : '正在同步后端资料...';
    try {
      loadCachedWorkspaceData(startupSnapshot);

      if (initialSnapshot) {
        persistBackendCache();
      }
    } catch (error) {
      clearWorkspaceCache(window.localStorage, BACKEND_CACHE_KEY);
      startupSnapshot = null;
      resetWorkspaceDataForStartupRecovery();
      flashStatus('本地缓存已失效，正在重新加载资料...');
    }
  } else {
    renderAll();
  }

  void loadWorkspaceData({ cachedSnapshot: startupSnapshot });
}

function resetWorkspaceDataForStartupRecovery() {
  state.dataMode = 'loading';
  state.spaces = [];
  state.currentSpaceId = null;
  state.folderTree = [];
  state.foldersById = {};
  state.tags = [];
  state.allNotes = [];
  state.selectedFolderId = null;
  state.selectedNoteId = null;
  state.openFolders = {};
  state.openNoteTabs = [];
  Object.assign(state, createClearedNoteSideData());
  renderAll();
}

function cacheElements() {
  elements.globalSearchShell = document.getElementById('global-search-shell');
  elements.moduleRail = document.getElementById('module-rail');
  elements.workspace = document.getElementById('kb-workspace');
  elements.sidebar = document.getElementById('kb-sidebar');
  elements.folderTree = document.getElementById('folder-tree');
  elements.secondaryNavToggle = document.getElementById('secondary-nav-toggle');
  elements.contextMenu = document.getElementById('library-context-menu');
  elements.sectionMenu = document.getElementById('library-section-menu');
  elements.noteTabs = document.getElementById('note-tabs');
  elements.editorMenuBar = document.getElementById('editor-menu-bar');
  elements.noteTabMenu = document.getElementById('note-tab-menu');
  elements.editorContextMenu = document.getElementById('editor-context-menu');
  elements.markdownImportInput = document.getElementById('markdown-import-input');
  elements.editorContent = document.getElementById('editor-content');
  elements.aside = document.getElementById('kb-aside');
  elements.asideTabs = document.getElementById('aside-tabs');
  elements.asideContent = document.getElementById('aside-content');
  elements.statusIndicators = document.getElementById('status-indicators');
  elements.statusMeta = document.getElementById('status-meta');
}

function bindRuntimeErrorHandlers() {
  window.addEventListener('error', (event) => {
    reportRuntimeError('runtime', event.error || event.message);
  });
  window.addEventListener('unhandledrejection', (event) => {
    reportRuntimeError('promise', event.reason);
  });
}

function reportRuntimeError(scope, error) {
  const message = error?.message || String(error || '未知错误');
  state.statusMessage = `前端运行异常（${scope}）：${message}`;
  renderStatus();
  console.error(`[study:${scope}]`, error);
}

function bindEvents() {
  // ─────────────────────────────────────────────────────────────
  // Claude Code 拆分 bindEvents 改动记录（2026-06-25）
  // ─────────────────────────────────────────────────────────────
  // 本函数从 ~830 行收缩为 orchestrator（~35 行）。原事件绑定按事件域
  // 拆到 apps/web/lib/events/ 下 11 个 binder（按依赖顺序）：
  //   1. search-events.js              （原 L449-545）
  //   2. window-events.js              （原 L1273-1276）
  //   3. document-click-events.js      （原 L933-958）
  //   4. document-keyboard-events.js   （原 L960-973 + L1207-1246）
  //   5. document-input-events.js      （原 L1175-1205）
  //   6. document-action-events.js     （原 L1248-1271）
  //   7. menu-events.js                （原 L709-726 + L1108-1153）
  //   8. folder-tree-events.js         （原 L547-707）
  //   9. note-tab-events.js            （原 L1037-1114）
  //  10. editor-content-events.js      （原 L897-921 + L923-931 + L1155-1173）
  //  11. aside-events/ (index/click/input/forms)  （原 L728-735 + L737-1035）
  // DOM 选择器、事件名、L1207 的 addEventListener(..., true) 捕获阶段
  // 一律保留；行为不变。子 binder 通过 deps 注入获得辅助函数。
  // ─────────────────────────────────────────────────────────────
  const deps = {
    // 搜索
    toggleSearchTagFilter, focusSearchInput, renderSearchShell, clearSearchFilters,
    getSearchResultNotes, selectNote, closeContextMenu, renderFolders,
    reconcileSelection, renderAll, importMarkdownFiles, flashStatus,
    // document.click 外部点击
    handleFormat, closeSectionMenu, closeTabMenu,
    closeEditorMenuBar, closeEditorContextMenu,
    // document.keydown：Escape 关闭链 + 捕获阶段编辑器快捷键/表格/查找
    closeTableInsertDialog, submitTableInsertDialog,
    resolveEditorPanelKeyboardAction, handleEditorPanelAction,
    resolveEditorShortcutAction, shouldHandleEditorShortcut,
    handleResolvedEditorShortcut, closeEditorPanel,
    // document.input：表格对话框字段 + 查找面板字段（host 通过 getter
    // 保持 live binding，编辑器切换时拿到新实例）
    getCurrentEditorHost: () => currentEditorHost,
    // 滚动位置（window beforeunload）
    saveCurrentEditorScrollPosition, persistScrollPositions
  };

  bindSearchEvents({ state, elements, deps });
  bindWindowEvents({ state, elements, deps });
  bindDocumentClickEvents({ state, elements, deps });
  bindDocumentKeyboardEvents({ state, elements, deps });
  bindDocumentInputEvents({ state, elements, deps });
  // document-action / menu / folder-tree / note-tab /
  // editor-content / aside 由后续拆分 commit 逐步加入。
  elements.folderTree?.addEventListener('click', (event) => {
    const clickTarget = resolveClickTarget(event.target);
    if (!clickTarget) {
      return;
    }

    if (clickTarget.type === 'toggle-section') {
      state.navSections[clickTarget.sectionKey] = !(state.navSections[clickTarget.sectionKey] ?? false);
      closeContextMenu();
      renderFolders();
      return;
    }

    if (clickTarget.type === 'toggle-folder') {
      event.stopPropagation();
      toggleFolderOpen(clickTarget.folderId);
      return;
    }

    if (clickTarget.type === 'select-folder') {
      void selectFolder(clickTarget.folderId);
      return;
    }

    if (clickTarget.type === 'select-note') {
      void selectNote(clickTarget.noteId, { syncFolder: true });
    }
  });

  elements.folderTree?.addEventListener('contextmenu', (event) => {
    const contextTarget = resolveContextMenuTarget(event.target);
    if (!contextTarget) {
      return;
    }

    event.preventDefault();

    if (contextTarget.selectFolderId) {
      state.selectedFolderId = contextTarget.selectFolderId;
      renderStatus();
    }

    openContextMenu({
      x: event.clientX,
      y: event.clientY,
      targetKind: contextTarget.kind,
      targetId: contextTarget.id
    });
  });

  elements.folderTree?.addEventListener('dragstart', (event) => {
    const draggable = event.target.closest('[data-drag-kind][data-drag-id]');
    if (!draggable || state.treeEditor) {
      event.preventDefault();
      return;
    }

    const dragKind = draggable.dataset.dragKind;
    const dragId = draggable.dataset.dragId;
    state.dragState = {
      activeKind: dragKind,
      activeId: dragId,
      overKind: null,
      overId: null
    };

    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', `${dragKind}:${dragId}`);
    syncDragIndicators();
  });

  elements.folderTree?.addEventListener('dragover', (event) => {
    const dropTarget = resolveDropTarget(event.target);
    if (!dropTarget || !canDropOnTarget(state.dragState, dropTarget)) {
      if (state.dragState.overKind || state.dragState.overId) {
        state.dragState.overKind = null;
        state.dragState.overId = null;
        syncDragIndicators();
      }
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';

    if (
      state.dragState.overKind !== dropTarget.kind
      || state.dragState.overId !== dropTarget.id
    ) {
      state.dragState.overKind = dropTarget.kind;
      state.dragState.overId = dropTarget.id;
      syncDragIndicators();
    }
  });

  elements.folderTree?.addEventListener('drop', (event) => {
    const dropTarget = resolveDropTarget(event.target);
    if (!dropTarget || !canDropOnTarget(state.dragState, dropTarget)) {
      return;
    }

    event.preventDefault();
    void commitDrop(dropTarget);
  });

  elements.folderTree?.addEventListener('dragend', () => {
    if (!state.dragState.activeKind) {
      return;
    }
    resetDragState();
  });

  elements.folderTree?.addEventListener('submit', (event) => {
    const form = event.target.closest('[data-inline-editor-form]');
    if (!form) {
      return;
    }

    event.preventDefault();
    void submitTreeEditor();
  });

  elements.folderTree?.addEventListener('keydown', (event) => {
    const input = event.target.closest('[data-inline-editor-input]');
    if (!input) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      cancelTreeEditor();
    }
  });

  elements.folderTree?.addEventListener('input', (event) => {
    const input = event.target.closest('[data-inline-editor-input]');
    if (!input || !state.treeEditor) {
      return;
    }

    state.treeEditor.value = input.value;
  });

  elements.folderTree?.addEventListener('click', (event) => {
    const cancelButton = event.target.closest('[data-editor-cancel]');
    if (cancelButton) {
      cancelTreeEditor();
      return;
    }

    const confirmDelete = event.target.closest('[data-delete-confirm]');
    if (confirmDelete) {
      void commitDelete(confirmDelete.dataset.deleteConfirm, confirmDelete.dataset.targetId);
      return;
    }

    const cancelDelete = event.target.closest('[data-delete-cancel]');
    if (cancelDelete) {
      clearDeleteIntent();
    }
  });

  elements.contextMenu?.addEventListener('click', (event) => {
    const menuItem = event.target.closest('[data-context-action]');
    if (!menuItem) {
      return;
    }
    void handleContextMenuAction(menuItem.dataset.contextAction);
  });

  elements.sectionMenu?.addEventListener('click', (event) => {
    const menuItem = event.target.closest('[data-section-toggle]');
    if (!menuItem) {
      return;
    }

    const key = menuItem.dataset.sectionToggle;
    state.secondarySections[key] = !state.secondarySections[key];
    renderFolders();
  });

  elements.asideTabs?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-aside-tab]');
    if (!button?.dataset.asideTab || state.asideTab === button.dataset.asideTab) {
      return;
    }
    state.asideTab = button.dataset.asideTab;
    renderSidebar(getCurrentNote());
  });

  elements.asideContent?.addEventListener('click', (event) => {
    const linkedButton = event.target.closest('[data-linked-id]');
    if (linkedButton?.dataset.linkedId) {
      void selectNote(linkedButton.dataset.linkedId, { syncFolder: true });
      return;
    }

    const attachmentButton = event.target.closest('[data-attachment-name]');
    if (attachmentButton?.dataset.attachmentName) {
      flashStatus(`已选中附件：${attachmentButton.dataset.attachmentName}`);
      return;
    }

    const noteTagAddButton = event.target.closest('[data-note-tag-add]');
    if (noteTagAddButton?.dataset.noteTagAdd) {
      state.noteTagComposer.isExpanded = true;
      void addTagToCurrentNote(noteTagAddButton.dataset.noteTagAdd);
      return;
    }

    const noteTagRemoveButton = event.target.closest('[data-note-tag-remove]');
    if (noteTagRemoveButton?.dataset.noteTagRemove) {
      void removeTagFromCurrentNote(noteTagRemoveButton.dataset.noteTagRemove);
      return;
    }

    const noteTagToggleButton = event.target.closest('[data-note-tag-toggle]');
    if (noteTagToggleButton) {
      state.noteTagComposer.isExpanded = !state.noteTagComposer.isExpanded;
      renderSidebar(getCurrentNote());
      return;
    }

    const noteTagCreateButton = event.target.closest('[data-note-tag-create]');
    if (noteTagCreateButton) {
      void createTagAndAssignToCurrentNote(state.noteTagComposer.draft);
      return;
    }

    const knowledgePointFilterToggle = event.target.closest('[data-knowledge-point-filter-toggle]');
    if (knowledgePointFilterToggle) {
      state.knowledgePointFilters.isOpen = !state.knowledgePointFilters.isOpen;
      renderSidebar(getCurrentNote());
      return;
    }

    const knowledgePointFilterClear = event.target.closest('[data-knowledge-point-filter-clear]');
    if (knowledgePointFilterClear) {
      state.knowledgePointFilters = { query: '', tagIds: [], isOpen: false };
      renderSidebar(getCurrentNote());
      return;
    }

    const knowledgePointFilterTag = event.target.closest('[data-knowledge-point-filter-tag]');
    if (knowledgePointFilterTag?.dataset.knowledgePointFilterTag) {
      const tagId = knowledgePointFilterTag.dataset.knowledgePointFilterTag;
      const selectedTagIds = new Set(state.knowledgePointFilters.tagIds ?? []);
      if (selectedTagIds.has(tagId)) {
        selectedTagIds.delete(tagId);
      } else {
        selectedTagIds.add(tagId);
      }
      state.knowledgePointFilters = {
        ...state.knowledgePointFilters,
        tagIds: [...selectedTagIds],
        isOpen: true
      };
      renderSidebar(getCurrentNote());
      return;
    }

    const knowledgePointToggle = event.target.closest('[data-knowledge-point-toggle]');
    if (knowledgePointToggle?.dataset.knowledgePointToggle) {
      const pointId = knowledgePointToggle.dataset.knowledgePointToggle;
      state.expandedKnowledgePointIds = {
        ...state.expandedKnowledgePointIds,
        [pointId]: !state.expandedKnowledgePointIds[pointId]
      };
      renderSidebar(getCurrentNote());
      return;
    }

    const knowledgePointEdit = event.target.closest('[data-knowledge-point-edit]');
    if (knowledgePointEdit?.dataset.knowledgePointEdit) {
      const point = state.knowledgePoints.find((item) => item.id === knowledgePointEdit.dataset.knowledgePointEdit);
      if (!point) {
        return;
      }
      state.knowledgePointEditing = {
        id: point.id,
        title: point.title,
        comment: point.comment ?? ''
      };
      state.expandedKnowledgePointIds = {
        ...state.expandedKnowledgePointIds,
        [point.id]: true
      };
      renderSidebar(getCurrentNote());
      return;
    }

    const knowledgePointEditCancel = event.target.closest('[data-knowledge-point-edit-cancel]');
    if (knowledgePointEditCancel) {
      state.knowledgePointEditing = null;
      renderSidebar(getCurrentNote());
      return;
    }

    const knowledgePointAttachToggle = event.target.closest('[data-knowledge-point-attach-toggle]');
    if (knowledgePointAttachToggle) {
      state.knowledgePointAttachComposer = {
        ...state.knowledgePointAttachComposer,
        isOpen: !state.knowledgePointAttachComposer.isOpen
      };
      renderSidebar(getCurrentNote());
      return;
    }

    const knowledgePointAttachExisting = event.target.closest('[data-knowledge-point-attach-existing]');
    if (knowledgePointAttachExisting?.dataset.knowledgePointAttachExisting) {
      void attachSelectionToExistingKnowledgePoint(knowledgePointAttachExisting.dataset.knowledgePointAttachExisting);
      return;
    }

    const knowledgePointSourceRemove = event.target.closest('[data-knowledge-point-source-remove]');
    if (knowledgePointSourceRemove?.dataset.knowledgePointSourceRemove) {
      void removeKnowledgePointSourceFromCurrentNote(knowledgePointSourceRemove.dataset.knowledgePointSourceRemove);
      return;
    }

    const knowledgePointDelete = event.target.closest('[data-knowledge-point-delete]');
    if (knowledgePointDelete?.dataset.knowledgePointDelete) {
      void deleteKnowledgePointFromLibrary(knowledgePointDelete.dataset.knowledgePointDelete);
      return;
    }

    const knowledgePointSourceJump = event.target.closest('[data-knowledge-point-source-jump]');
    if (knowledgePointSourceJump?.dataset.knowledgePointSourceJump) {
      void selectKnowledgePointSource(knowledgePointSourceJump.dataset.knowledgePointSourceJump);
      return;
    }

    const outlineButton = event.target.closest('[data-outline-id]');
    if (!outlineButton?.dataset.outlineId) {
      return;
    }

    const outlineIndex = Number.parseInt(outlineButton.dataset.outlineIndex ?? '', 10);
    const targetHeading = findOutlineHeadingTarget(
      outlineButton.dataset.outlineId,
      Number.isNaN(outlineIndex) ? -1 : outlineIndex
    );
    if (!targetHeading) {
      flashStatus('当前标题尚未出现在预览区');
      return;
    }

    targetHeading.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  elements.editorContent?.addEventListener('contextmenu', (event) => {
    if (!currentEditorHost || !getCurrentNote() || state.view.showSourceEditor) {
      return;
    }

    const target = event.target instanceof Element ? event.target : null;
    if (!target?.closest('.milkdown-host, .preview-rendered')) {
      return;
    }

    event.preventDefault();
    openEditorContextMenu({
      x: event.clientX,
      y: event.clientY
    });
  });

  elements.editorContent?.addEventListener('knowledge-point-marker-click', (event) => {
    const { sourceId, knowledgePointId } = event.detail ?? {};
    if (!sourceId && !knowledgePointId) {
      return;
    }

    focusKnowledgePointFromMarker({ sourceId, knowledgePointId });
  });

  elements.editorContextMenu?.addEventListener('click', (event) => {
    const actionButton = event.target.closest('[data-editor-context-action]');
    if (!actionButton?.dataset.editorContextAction) {
      return;
    }

    event.stopPropagation();
    void handleEditorContextMenuAction(actionButton.dataset.editorContextAction);
  });

  // Claude Code 拆分 bindEvents 时迁出（commit 3，2026-06-25）：
  // 原本的两段 document.click 监听器（格式化按钮 + 外部点击关闭菜单）
  // 移至 apps/web/lib/events/document-click-events.js。
  // 行为不变：选择器、事件名、关闭顺序均保持。
  // Claude Code 拆分 bindEvents 时迁出（commit 4，2026-06-25）：
  // 原本的两段 document.keydown 监听器（Escape 关闭链 + 捕获阶段编辑
  // 器快捷键/表格对话框/查找面板）移至 apps/web/lib/events/document-keyboard-events.js。
  // 关键：第二个监听器 `, true` 捕获阶段已保留。

  elements.asideContent?.addEventListener('input', (event) => {
    const knowledgePointFilterInput = event.target.closest('[data-knowledge-point-filter-input]');
    if (knowledgePointFilterInput) {
      state.knowledgePointFilters = {
        ...state.knowledgePointFilters,
        query: knowledgePointFilterInput.value,
        isOpen: true
      };
      renderSidebar(getCurrentNote());
      return;
    }

    const knowledgePointEditForm = event.target.closest('[data-knowledge-point-edit-form]');
    if (knowledgePointEditForm && state.knowledgePointEditing) {
      const formData = new FormData(knowledgePointEditForm);
      state.knowledgePointEditing = {
        ...state.knowledgePointEditing,
        title: String(formData.get('title') ?? ''),
        comment: String(formData.get('comment') ?? '')
      };
      return;
    }

    const knowledgePointAttachQuery = event.target.closest('[data-knowledge-point-attach-query]');
    if (knowledgePointAttachQuery) {
      state.knowledgePointAttachComposer = {
        ...state.knowledgePointAttachComposer,
        query: knowledgePointAttachQuery.value,
        isOpen: true
      };
      renderSidebar(getCurrentNote());
      return;
    }

    const input = event.target.closest('[data-note-tag-input]');
    if (!input) {
      return;
    }

    state.noteTagComposer.draft = input.value;
  });

  elements.asideContent?.addEventListener('submit', (event) => {
    const knowledgePointEditForm = event.target.closest('[data-knowledge-point-edit-form]');
    if (!knowledgePointEditForm?.dataset.knowledgePointEditForm) {
      return;
    }

    event.preventDefault();
    void updateCurrentKnowledgePoint(knowledgePointEditForm.dataset.knowledgePointEditForm, knowledgePointEditForm);
  });

  elements.asideContent?.addEventListener('keydown', (event) => {
    const input = event.target.closest('[data-note-tag-input]');
    if (!input || event.key !== 'Enter') {
      return;
    }

    event.preventDefault();
    void createTagAndAssignToCurrentNote(input.value);
  });

  elements.noteTabs?.addEventListener('click', (event) => {
    const closeButton = event.target.closest('[data-tab-close]');
    if (closeButton?.dataset.tabClose) {
      event.stopPropagation();
      void handleTabClose(closeButton.dataset.tabClose);
      return;
    }

    const tabButton = event.target.closest('[data-tab-note-id]');
    if (tabButton?.dataset.tabNoteId) {
      void selectNote(tabButton.dataset.tabNoteId, { syncFolder: true, ensureTab: true });
    }
  });

  elements.noteTabs?.addEventListener('contextmenu', (event) => {
    const tabButton = event.target.closest('[data-tab-note-id]');
    if (!tabButton?.dataset.tabNoteId) {
      return;
    }

    event.preventDefault();
    openTabMenu({
      x: event.clientX,
      y: event.clientY,
      noteId: tabButton.dataset.tabNoteId
    });
  });

  elements.noteTabs?.addEventListener('dragstart', (event) => {
    const tabButton = event.target.closest('[data-tab-note-id]');
    if (!tabButton?.dataset.tabNoteId) {
      return;
    }

    state.tabDragState.activeId = tabButton.dataset.tabNoteId;
    state.tabDragState.overId = null;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', tabButton.dataset.tabNoteId);
    syncTabDragIndicators();
  });

  elements.noteTabs?.addEventListener('dragover', (event) => {
    const tabButton = event.target.closest('[data-tab-note-id]');
    if (!tabButton?.dataset.tabNoteId || !state.tabDragState.activeId) {
      return;
    }

    event.preventDefault();
    state.tabDragState.overId = tabButton.dataset.tabNoteId;
    syncTabDragIndicators();
  });

  elements.noteTabs?.addEventListener('drop', (event) => {
    const tabButton = event.target.closest('[data-tab-note-id]');
    if (!tabButton?.dataset.tabNoteId || !state.tabDragState.activeId) {
      return;
    }

    event.preventDefault();
    state.openNoteTabs = reorderTabs(
      state.openNoteTabs,
      state.tabDragState.activeId,
      tabButton.dataset.tabNoteId
    );
    resetTabDragState();
  });

  elements.noteTabs?.addEventListener('dragend', () => {
    resetTabDragState();
  });

  elements.noteTabMenu?.addEventListener('click', (event) => {
    const actionButton = event.target.closest('[data-tab-menu-action]');
    if (!actionButton) {
      return;
    }
    void handleTabMenuAction(actionButton.dataset.tabMenuAction);
  });

  elements.editorMenuBar?.addEventListener('click', (event) => {
    event.stopPropagation();

    const menuToggle = event.target.closest('[data-editor-menu-toggle]');
    if (menuToggle?.dataset.editorMenuToggle) {
      const menuKey = menuToggle.dataset.editorMenuToggle;
      state.editorMenuOpen = state.editorMenuOpen === menuKey ? null : menuKey;
      renderEditorMenuBar();
      return;
    }

    const menuAction = event.target.closest('[data-file-menu-action]');
    if (menuAction?.dataset.fileMenuAction) {
      void handleFileMenuAction(menuAction.dataset.fileMenuAction);
      return;
    }

    const editMenuAction = event.target.closest('[data-edit-menu-action]');
    if (editMenuAction?.dataset.editMenuAction) {
      void handleEditMenuAction(editMenuAction.dataset.editMenuAction);
    }

    const paragraphMenuAction = event.target.closest('[data-paragraph-menu-action]');
    if (paragraphMenuAction?.dataset.paragraphMenuAction) {
      void handleParagraphMenuAction(paragraphMenuAction.dataset.paragraphMenuAction);
    }

    const formatMenuAction = event.target.closest('[data-format-menu-action]');
    if (formatMenuAction?.dataset.formatMenuAction) {
      void handleFormatMenuAction(formatMenuAction.dataset.formatMenuAction);
      return;
    }

    const viewMenuAction = event.target.closest('[data-view-menu-action]');
    if (viewMenuAction?.dataset.viewMenuAction) {
      void handleViewMenuAction(viewMenuAction.dataset.viewMenuAction);
    }
  });

  elements.editorContent?.addEventListener('input', (event) => {
    const sourceInput = event.target.closest('[data-source-editor-input]');
    if (!sourceInput) {
      return;
    }

    state.draftMarkdown = sourceInput.value;
    scheduleAutosave();
    syncSourcePreview();
  });

  elements.editorContent?.addEventListener('click', (event) => {
    const sourceSaveButton = event.target.closest('[data-source-save]');
    if (!sourceSaveButton) {
      return;
    }

    void persistDraft({ immediate: true });
  });

  // Claude Code 拆分 bindEvents 时迁出（commit 5，2026-06-25）：
  // 原本的 document.input 监听器（表格对话框字段 + 查找面板字段）移至
  // apps/web/lib/events/document-input-events.js。host 通过 deps 中的
  // getter 注入，保持 live binding。

  document.addEventListener('click', (event) => {
    const tableDialogAction = event.target.closest('[data-editor-table-dialog-action]');
    if (tableDialogAction?.dataset.editorTableDialogAction) {
      const action = tableDialogAction.dataset.editorTableDialogAction;
      if (action === 'confirm') {
        void submitTableInsertDialog();
      } else {
        closeTableInsertDialog();
      }
      return;
    }

    const panelAction = event.target.closest('[data-editor-panel-action]');
    if (panelAction?.dataset.editorPanelAction) {
      void handleEditorPanelAction(panelAction.dataset.editorPanelAction);
      return;
    }

    const saveButton = event.target.closest('[data-save-now]');
    if (!saveButton) {
      return;
    }
    void persistDraft({ immediate: true });
  });

  window.addEventListener('beforeunload', () => {
    saveCurrentEditorScrollPosition();
    persistScrollPositions();
  });
}

async function loadWorkspaceData({ cachedSnapshot = null } = {}) {
  let backendLoaded = false;

  try {
    const spaceId = await ensureSpaceId();
    await refreshKnowledgeData(spaceId);
    state.dataMode = 'api';
    backendLoaded = true;
    persistBackendCache();
    flashStatus('知识库已连接到后端数据');
  } catch (error) {
    const recoverySnapshot = cachedSnapshot ?? readBackendCache();
    const recoveryMode = selectLoadRecovery({
      backendAvailable: backendLoaded,
      cachedSnapshot: recoverySnapshot
    });

    if (recoveryMode === 'cache') {
      try {
        loadCachedWorkspaceData(recoverySnapshot);
        state.dataMode = 'cache';
        flashStatus('后端暂时不可用，已显示最近一次成功加载的资料');
        return;
      } catch (cacheError) {
        clearWorkspaceCache(window.localStorage, BACKEND_CACHE_KEY);
        resetWorkspaceDataForStartupRecovery();
      }
    }

    loadMockWorkspaceData();
    state.dataMode = 'local';
    flashStatus('未检测到后端，已切换到前端本地演示模式');
  }
}

async function ensureSpaceId() {
  const spaces = await knowledgeApi.listKnowledgeSpaces();

  if (spaces.length > 0) {
    state.spaces = spaces;
    state.currentSpaceId = spaces[0].id;
    return state.currentSpaceId;
  }

  const createdSpace = await knowledgeApi.createDefaultKnowledgeSpace({ userId: 'demo' });
  state.spaces = [createdSpace];
  state.currentSpaceId = createdSpace.id;
  return state.currentSpaceId;
}

async function refreshKnowledgeData(spaceId = state.currentSpaceId) {
  const resources = await knowledgeApi.loadWorkspaceResources(spaceId);

  state.folderTree = normalizeFolderTree(resources.folderTree);
  state.foldersById = flattenFolderTree(state.folderTree);
  state.tags = resources.tags;
  state.allNotes = normalizeNotes(resources.notes);
  state.openFolders = {
    ...Object.fromEntries(Object.keys(state.foldersById).map((folderId) => [folderId, true])),
    ...state.openFolders
  };

  reconcileSelection();
  await loadCurrentNoteSideData();
  renderAll();
}

function persistBackendCache() {
  writeWorkspaceCache(window.localStorage, BACKEND_CACHE_KEY, createBackendSnapshot(state));
  saveCurrentEditorScrollPosition();
  persistScrollPositions();
}

function readBackendCache() {
  return readWorkspaceCache(window.localStorage, BACKEND_CACHE_KEY);
}

function readInitialWorkspaceSnapshot() {
  return readInitialWorkspaceSnapshotFromSource(window);
}

function loadCachedWorkspaceData(snapshot) {
  state.spaces = Array.isArray(snapshot.spaces) ? snapshot.spaces : [];
  state.currentSpaceId = snapshot.currentSpaceId ?? null;
  state.folderTree = normalizeFolderTree(snapshot.folderTree ?? []);
  state.foldersById = flattenFolderTree(state.folderTree);
  state.tags = Array.isArray(snapshot.tags) ? snapshot.tags : [];
  state.allNotes = normalizeNotes(snapshot.allNotes ?? []);
  state.openFolders = {
    ...Object.fromEntries(Object.keys(state.foldersById).map((folderId) => [folderId, true])),
    ...(snapshot.openFolders ?? {})
  };
  state.openNoteTabs = Array.isArray(snapshot.openNoteTabs) ? snapshot.openNoteTabs : [];
  state.selectedFolderId = snapshot.selectedFolderId ?? null;
  state.selectedNoteId = snapshot.selectedNoteId ?? null;
  reconcileSelection();
  loadLocalNoteSideData(state.selectedNoteId);
  renderAll();
}

function loadMockWorkspaceData() {
  const mockState = buildMockWorkspaceState(knowledgeBaseSeed);
  state.spaces = mockState.spaces;
  state.currentSpaceId = mockState.currentSpaceId;
  state.folderTree = mockState.folderTree;
  state.foldersById = mockState.foldersById;
  state.tags = mockState.tags;
  state.allNotes = normalizeNotes(mockState.allNotes);
  state.openFolders = mockState.openFolders;

  reconcileSelection();
  loadLocalNoteSideData(state.selectedNoteId);
  renderAll();
}

function reconcileSelection() {
  const validSelectedFolderId = state.selectedFolderId && !state.foldersById[state.selectedFolderId]
    ? null
    : state.selectedFolderId;
  const selection = resolveNavigationSelection({
    selectedFolderId: state.selectedFolderId,
    foldersById: state.foldersById,
    activeNotes: getActiveNotes(),
    visibleNotes: getVisibleNavigationNotes({
      notes: state.allNotes,
      foldersById: state.foldersById,
      selectedFolderId: validSelectedFolderId,
      search: state.search
    }),
    selectedNoteId: state.selectedNoteId,
    openNoteTabs: state.openNoteTabs
  });

  state.selectedFolderId = selection.selectedFolderId;
  state.selectedNoteId = selection.selectedNoteId;
  state.openNoteTabs = selection.openNoteTabs;
  state.draftMarkdown = selection.draftMarkdown;
  state.saveState = selection.saveState;
  state.lastSavedAt = selection.lastSavedAt;

  if (selection.noteTagDraft !== undefined) {
    state.noteTagComposer.draft = selection.noteTagDraft;
  }

  if (selection.shouldClearSideData) {
    state.selectedNoteId = null;
    clearNoteSideData();
  }
}

async function loadCurrentNoteSideData() {
  if (state.dataMode === 'local') {
    loadLocalNoteSideData(state.selectedNoteId);
    return;
  }
  await loadApiNoteSideData(state.selectedNoteId);
}

async function loadApiNoteSideData(noteId) {
  if (!noteId) {
    clearNoteSideData();
    syncKnowledgePointMarkers();
    return;
  }

  try {
    const note = state.allNotes.find((item) => item.id === noteId);
    const spaceId = note?.spaceId ?? state.currentSpaceId;
    const sideData = await knowledgeApi.loadNoteSideData({ noteId, spaceId });
    state.linkedNotes = sideData.linkedNotes;
    state.attachments = sideData.attachments;
    state.knowledgePoints = sideData.knowledgePoints;
    state.allKnowledgePoints = sideData.allKnowledgePoints;
    state.knowledgePointTagGroups = sideData.knowledgePointTagGroups;
    syncKnowledgePointMarkers();
  } catch (error) {
    clearNoteSideData({ keepEditing: true });
    syncKnowledgePointMarkers();
    flashStatus(`附加信息加载失败：${error.message}`);
  }
}

function loadLocalNoteSideData(noteId) {
  if (!noteId) {
    clearNoteSideData();
    syncKnowledgePointMarkers();
    return;
  }

  Object.assign(state, createLocalNoteSideData({
    noteId,
    notes: state.allNotes,
    attachments: knowledgeBaseSeed.attachments
  }));
  syncKnowledgePointMarkers();
}

function clearNoteSideData({ keepEditing = false } = {}) {
  Object.assign(state, createClearedNoteSideData({
    editing: state.knowledgePointEditing,
    keepEditing
  }));
}

function renderRail() {
  if (!elements.moduleRail) {
    return;
  }

  elements.moduleRail.innerHTML = renderModuleRail(railItems);
}

function renderAll() {
  const currentNote = getCurrentNote();
  safeRenderStep('search', renderSearchShell);
  safeRenderStep('workspace-view', renderWorkspaceViewState);
  safeRenderStep('navigation', renderFolders);
  safeRenderStep('tabs', renderTabs);
  safeRenderStep('editor-menu', renderEditorMenuBar);
  safeRenderStep('editor', () => renderEditor(currentNote));
  safeRenderStep('sidebar', () => renderSidebar(currentNote));
  safeRenderStep('editor-context-menu', renderEditorContextMenu);
  safeRenderStep('status', renderStatus);
}

function safeRenderStep(name, renderStep) {
  try {
    renderStep();
  } catch (error) {
    reportRuntimeError(name, error);
  }
}

function renderSearchShell() {
  if (!elements.globalSearchShell) {
    return;
  }

  const hasFilters = hasActiveSearchFilters();
  const selectedTags = getSelectedSearchTags();

  if (!elements.globalSearchShell.querySelector('.top-bar-search-control')) {
    elements.globalSearchShell.innerHTML = renderSearchShellMarkup();
  }

  elements.globalSearchShell.dataset.open = String(state.search.isOpen);

  const control = elements.globalSearchShell.querySelector('.top-bar-search-control');
  const input = elements.globalSearchShell.querySelector('[data-search-input]');
  const chipTrack = elements.globalSearchShell.querySelector('[data-search-chip-track]');
  const clearButton = elements.globalSearchShell.querySelector('[data-search-clear]');
  const panelHost = elements.globalSearchShell.querySelector('.search-panel-host');

  if (control) {
    control.dataset.open = String(state.search.isOpen);
  }

  if (input && input.value !== state.search.keyword) {
    input.value = state.search.keyword;
  }

  if (chipTrack) {
    chipTrack.innerHTML = renderSelectedSearchChips(selectedTags);
  }

  if (clearButton) {
    clearButton.hidden = !hasFilters;
  }

  if (panelHost) {
    panelHost.innerHTML = state.search.isOpen || hasFilters ? renderSearchPanel() : '';
  }
}

function renderSearchPanel() {
  const selectedTags = getSelectedSearchTags();
  const visibleTags = getVisibleSearchTags();
  return renderSearchPanelMarkup({
    selectedTags,
    visibleTags,
    selectedTagIds: state.search.selectedTagIds,
    hasFilters: hasActiveSearchFilters(),
    isOpen: state.search.isOpen
  });
}

function getEffectiveViewState() {
  return selectEffectiveViewState(state.view);
}

function renderWorkspaceViewState() {
  if (!elements.workspace) {
    return;
  }

  const effectiveView = getEffectiveViewState();
  elements.workspace.dataset.leftHidden = String(!effectiveView.showLeftSidebar);
  elements.workspace.dataset.rightHidden = String(!effectiveView.showRightSidebar);
  elements.workspace.dataset.viewMode = effectiveView.mode;

  if (elements.sidebar) {
    elements.sidebar.hidden = !effectiveView.showLeftSidebar;
  }

  if (elements.aside) {
    elements.aside.hidden = !effectiveView.showRightSidebar;
  }
}

function renderFolders() {
  if (!elements.folderTree) {
    return;
  }

  const activeNotes = getActiveNotes();
  const filteredActiveNotes = activeNotes.filter((note) => noteMatchesSelectedTags(note));
  const recycleNotes = getRecycleNotes();
  const topFolders = state.folderTree.filter((folder) => matchesFolderSearch(folder));
  const favoriteNotes = filteredActiveNotes.filter((note) => note.favorite && matchesSearch(note.title));
  const recentNotes = [...filteredActiveNotes]
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
    .filter((note) => matchesSearch(note.title))
    .slice(0, 5);

  const sections = [
    renderNavSection({
      key: 'materials',
      label: '资料',
      count: topFolders.length,
      children: renderMaterialsTree(topFolders)
    })
  ];

  if (state.secondarySections.favorites) {
    sections.push(
      renderNavSection({
        key: 'favorites',
        label: '收藏',
        count: favoriteNotes.length,
        children: favoriteNotes.length
          ? favoriteNotes.map((note) => renderNoteNode(note, 1)).join('')
          : renderEmptyItem('暂无收藏')
      })
    );
  }

  if (state.secondarySections.recent) {
    sections.push(
      renderNavSection({
        key: 'recent',
        label: '最近',
        count: recentNotes.length,
        children: recentNotes.length
          ? recentNotes.map((note) => renderNoteNode(note, 1)).join('')
          : renderEmptyItem('暂无最近笔记')
      })
    );
  }

  if (state.secondarySections.recycle) {
    sections.push(
      renderNavSection({
        key: 'recycle',
        label: '回收站',
        count: recycleNotes.length,
        children: recycleNotes.length
          ? recycleNotes.map((note) => renderRecycleNoteNode(note, 1)).join('')
          : renderEmptyItem('暂无回收站文件')
      })
    );
  }

  elements.folderTree.innerHTML = sections.join('');
  renderHeaderToggle();
  renderContextMenu();
  renderSectionMenu();
  focusInlineEditor();
}

function renderTabs() {
  if (!elements.noteTabs) {
    return;
  }

  const openNotes = state.openNoteTabs
    .map((noteId) => state.allNotes.find((note) => note.id === noteId))
    .filter(Boolean);

  if (openNotes.length === 0) {
    elements.noteTabs.innerHTML = renderEmptyNoteTabs();
    renderTabMenu();
    return;
  }

  elements.noteTabs.innerHTML = renderNoteTabsMarkup({
    notes: openNotes,
    selectedNoteId: state.selectedNoteId,
    saveState: state.saveState,
    tabDragState: state.tabDragState,
    foldersById: state.foldersById,
    buildNoteTabPath
  });

  renderTabMenu();
  syncTabDragIndicators();
  persistBackendCache();
}

function renderEditorMenuBar() {
  if (!elements.editorMenuBar) {
    return;
  }

  const note = getCurrentNote();
  const effectiveView = getEffectiveViewState();
  elements.editorMenuBar.innerHTML = renderEditorMenuBarMarkup({
    note,
    effectiveView,
    openMenu: state.editorMenuOpen,
    getShortcutLabel: getEditorShortcutLabel
  });
}

function renderTabMenu() {
  if (!elements.noteTabMenu) {
    return;
  }

  if (!state.tabMenu.open || !state.tabMenu.noteId) {
    elements.noteTabMenu.hidden = true;
    elements.noteTabMenu.innerHTML = '';
    return;
  }

  elements.noteTabMenu.hidden = false;
  elements.noteTabMenu.style.left = `${state.tabMenu.x}px`;
  elements.noteTabMenu.style.top = `${state.tabMenu.y}px`;
  elements.noteTabMenu.innerHTML = renderNoteTabMenuItems();
}

function renderNavSection({ key, label, count, children }) {
  const open = state.navSections[key] ?? false;
  return renderNavigationSection({
    key,
    label,
    count,
    children,
    open,
    isDropTarget: key === 'materials' && isRootDropActive()
  });
}

function renderMaterialsTree(topFolders) {
  const parts = [];
  const rootNotes = getDirectNotesForFolder(null).filter((note) => matchesSearch(note.title) && noteMatchesSelectedTags(note));

  if (isCreateEditorForParent(null)) {
    parts.push(renderInlineEditorRow(1, state.treeEditor.mode, state.treeEditor.value));
  }

  if (topFolders.length === 0 && rootNotes.length === 0) {
    parts.push(renderEmptyItem(state.dataMode === 'loading' ? '正在加载资料...' : '暂无目录'));
  } else {
    parts.push(...topFolders.map((folder) => renderFolderNode(folder, 1)));
    parts.push(...rootNotes.map((note) => renderNoteNode(note, 1)));
  }

  return parts.join('');
}

function renderFolderNode(folder, level) {
  const childFolders = (folder.children ?? []).filter((childFolder) => matchesFolderSearch(childFolder));
  const childNotes = getDirectNotesForFolder(folder.id).filter((note) => matchesSearch(note.title) && noteMatchesSelectedTags(note));
  const hasChildren = childFolders.length > 0 || childNotes.length > 0 || isCreateEditorForParent(folder.id);
  const isOpen = state.openFolders[folder.id] ?? true;
  const selected = folder.id === state.selectedFolderId;
  const isRenaming = state.treeEditor?.mode === 'rename-folder' && state.treeEditor.targetId === folder.id;
  const isDeleting = state.deleteIntent?.kind === 'folder' && state.deleteIntent.targetId === folder.id;
  const isDragging = state.dragState.activeKind === 'folder' && state.dragState.activeId === folder.id;
  const isDropTarget = state.dragState.overKind === 'folder' && state.dragState.overId === folder.id;

  const rowMarkup = isRenaming
    ? renderInlineEditorRow(level, 'rename-folder', state.treeEditor.value)
    : `
      <button
        type="button"
        class="library-node library-folder-node"
        data-folder-id="${folder.id}"
        data-level="${level}"
        data-selected="${selected}"
        data-drag-kind="folder"
        data-drag-id="${folder.id}"
        data-dragging="${isDragging}"
        data-drop-target="${isDropTarget}"
        title="${escapeHtml(folder.name)}"
        draggable="true"
      >
        <span class="library-node-leading">
          <span class="library-chevron-hitbox" data-folder-toggle="${folder.id}">
            ${hasChildren
              ? `
                <svg viewBox="0 0 16 16" aria-hidden="true" class="library-chevron" data-open="${isOpen}">
                  <path d="M5 3.5 10 8l-5 4.5"></path>
                </svg>
              `
              : '<span class="library-node-spacer"></span>'}
          </span>
          ${renderFolderIcon(isOpen)}
        </span>
        <span class="library-node-label">${escapeHtml(folder.name)}</span>
      </button>
    `;

  const childrenMarkup = [];

  if (isOpen) {
    if (isCreateEditorForParent(folder.id)) {
      childrenMarkup.push(renderInlineEditorRow(level + 1, state.treeEditor.mode, state.treeEditor.value));
    }

    childrenMarkup.push(...childFolders.map((childFolder) => renderFolderNode(childFolder, level + 1)));
    childrenMarkup.push(...childNotes.map((note) => renderNoteNode(note, level + 1)));
  }

  if (isDeleting) {
    childrenMarkup.unshift(renderDeleteIntentRow(level + 1, 'folder', folder.id, folder.name));
  }

  return `
    <div class="library-node-group">
      ${rowMarkup}
      ${isOpen || isDeleting ? `<div class="library-node-children">${childrenMarkup.join('')}</div>` : ''}
    </div>
  `;
}

function renderNoteNode(note, level) {
  const selected = note.id === state.selectedNoteId;
  const isRenaming = state.treeEditor?.mode === 'rename-note' && state.treeEditor.targetId === note.id;
  const isDeleting = state.deleteIntent?.kind === 'note' && state.deleteIntent.targetId === note.id;
  const isDragging = state.dragState.activeKind === 'note' && state.dragState.activeId === note.id;
  const iconKind = resolveNoteVisualType(note);

  const rowMarkup = isRenaming
    ? renderInlineEditorRow(level, 'rename-note', state.treeEditor.value)
    : renderNoteNodeMarkup({ note, level, selected, isDragging, iconKind });

  if (!isDeleting) {
    return rowMarkup;
  }

  return `
    <div class="library-node-group">
      ${rowMarkup}
      <div class="library-node-children">
        ${renderDeleteIntentRow(level + 1, 'note', note.id, note.title)}
      </div>
    </div>
  `;
}

function renderRecycleNoteNode(note, level) {
  return renderRecycleNoteNodeMarkup({
    note,
    level,
    iconKind: resolveNoteVisualType(note)
  });
}

function renderInlineEditorRow(level, mode, value) {
  return renderInlineEditorRowMarkup({ level, mode, value });
}

function renderDeleteIntentRow(level, kind, targetId, name) {
  return renderDeleteIntentRowMarkup({ level, kind, targetId, name });
}

function renderEmptyItem(label) {
  return renderEmptyTreeItem(label);
}

function renderHeaderToggle() {
  if (!elements.secondaryNavToggle) {
    return;
  }

  elements.secondaryNavToggle.dataset.open = String(state.sectionMenuOpen);
}

function renderContextMenu() {
  if (!elements.contextMenu) {
    return;
  }

  if (!state.contextMenu.open) {
    elements.contextMenu.hidden = true;
    elements.contextMenu.innerHTML = '';
    return;
  }

  const items = getContextMenuItems();
  if (items.length === 0) {
    elements.contextMenu.hidden = true;
    elements.contextMenu.innerHTML = '';
    return;
  }

  elements.contextMenu.hidden = false;
  elements.contextMenu.style.left = `${state.contextMenu.x}px`;
  elements.contextMenu.style.top = `${state.contextMenu.y}px`;
  elements.contextMenu.innerHTML = renderContextMenuItems(items);
}

function getContextMenuItems() {
  return getNavigationContextMenuItems({
    targetKind: state.contextMenu.targetKind,
    targetId: state.contextMenu.targetId,
    notes: state.allNotes,
    recycleNotes: getRecycleNotes()
  });
}

function renderSectionMenu() {
  if (!elements.sectionMenu || !elements.secondaryNavToggle) {
    return;
  }

  if (!state.sectionMenuOpen) {
    elements.sectionMenu.hidden = true;
    elements.sectionMenu.innerHTML = '';
    return;
  }

  const rect = elements.secondaryNavToggle.getBoundingClientRect();
  elements.sectionMenu.hidden = false;
  elements.sectionMenu.style.left = `${Math.max(8, rect.right - 188)}px`;
  elements.sectionMenu.style.top = `${rect.bottom + 6}px`;
  elements.sectionMenu.innerHTML = renderSectionMenuItems({
    items: SECONDARY_SECTION_ITEMS,
    sections: state.secondarySections
  });
}

function renderPreviewPane(markdown) {
  const headings = extractMarkdownHeadings(markdown);
  const previewHtml = renderMarkdownPreview(markdown);
  return renderPreviewPaneMarkup({ headings, previewHtml });
}

function renderSourceEditorPane() {
  return renderSourceEditorPaneMarkup({ markdown: state.draftMarkdown });
}

function renderSourceEditorView() {
  return renderSourceEditorViewMarkup({ markdown: state.draftMarkdown });
}

function renderEditor(note) {
  if (!elements.editorContent) {
    return;
  }

  const effectiveView = getEffectiveViewState();
  const renderState = resolveEditorRenderState({
    note,
    effectiveView,
    currentEditorNoteId,
    hasCurrentEditorHost: Boolean(currentEditorHost)
  });

  if (renderState.shouldTeardownHost) {
    void teardownEditorHost();
  }
  if (renderState.shouldCloseTableDialog) {
    state.editorTableDialog.open = false;
  }

  elements.editorContent.dataset.sourceOpen = String(renderState.sourceOpen);
  elements.editorContent.dataset.viewMode = renderState.viewMode;

  if (renderState.kind === 'empty') {
    elements.editorContent.innerHTML = renderPreviewPane('');
    return;
  }

  if (renderState.kind === 'recycle') {
    elements.editorContent.innerHTML = renderPreviewPane(note.rawMarkdown || '');
    return;
  }

  if (renderState.kind === 'reuse-rich-editor') {
    renderEditorSaveIndicator();
    renderEditorPanel();
    renderTableInsertDialog();
    return;
  }

  const markdown = state.draftMarkdown || note.rawMarkdown || '';

  if (renderState.kind === 'source-preview' || renderState.kind === 'preview') {
    elements.editorContent.innerHTML = renderState.kind === 'source-preview'
      ? `${renderSourceEditorView()}${renderPreviewPane(markdown)}`
      : renderPreviewPane(markdown);
    renderEditorSaveIndicator();
    return;
  }

  elements.editorContent.innerHTML = renderRichEditorHost();

  renderEditorSaveIndicator();
  renderEditorPanel();
  renderTableInsertDialog();
  mountEditorHost(note.id, state.draftMarkdown);
}

function syncSourcePreview() {
  if (!elements.editorContent || !state.view.showSourceEditor) {
    return;
  }

  const previewContent = elements.editorContent.querySelector('[data-preview-content]');
  const previewToc = elements.editorContent.querySelector('[data-preview-toc]');
  if (!previewContent) {
    return;
  }

  const markdown = state.draftMarkdown;
  previewContent.innerHTML = renderMarkdownPreview(markdown);

  if (previewToc) {
    const headings = extractMarkdownHeadings(markdown);
    previewToc.innerHTML = headings
      .map((heading) => `<a class="toc-item" data-level="${heading.level}" href="#${escapeAttribute(heading.id)}">${escapeHtml(heading.title)}</a>`)
      .join('');
    previewToc.hidden = headings.length === 0;
  }
}

function findOutlineHeadingTarget(outlineId, outlineIndex) {
  if (!elements.editorContent) {
    return null;
  }

  if (outlineId) {
    const escapedId = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
      ? CSS.escape(outlineId)
      : outlineId.replace(/"/g, '\\"');
    const directMatch = elements.editorContent.querySelector(`#${escapedId}`);
    if (directMatch) {
      return directMatch;
    }
  }

  if (!Number.isInteger(outlineIndex) || outlineIndex < 0) {
    return null;
  }

  const renderedHeadings = elements.editorContent.querySelectorAll('h1, h2, h3, h4, h5, h6');
  return renderedHeadings.item(outlineIndex) ?? null;
}

function renderSidebar(note) {
  if (!elements.asideTabs || !elements.asideContent) {
    return;
  }

  elements.asideTabs.innerHTML = renderAsideTabs({
    tabs: ASIDE_TABS,
    activeKey: state.asideTab
  });

  const contentKey = resolveAsideContentKey({
    note,
    activeTab: state.asideTab
  });

  if (contentKey === 'empty') {
    elements.asideContent.innerHTML = renderAsideEmptyState();
    return;
  }

  switch (contentKey) {
    case 'outline':
      elements.asideContent.innerHTML = renderOutlineTab(note);
      return;
    case 'concepts':
      elements.asideContent.innerHTML = renderConceptsTab(note);
      return;
    case 'ai':
      elements.asideContent.innerHTML = renderAiTab(note);
      return;
    case 'info':
    default:
      elements.asideContent.innerHTML = renderInfoTab(note);
  }
}

function renderInfoTab(note) {
  return renderInfoTabMarkup({
    note,
    markdown: state.draftMarkdown || note.rawMarkdown || '',
    folderPath: buildFolderPath({
      folderId: note.folderId,
      foldersById: state.foldersById
    }),
    tags: state.tags,
    tagComposer: state.noteTagComposer,
    linkedNotes: state.linkedNotes,
    attachments: state.attachments,
    formatDate
  });
}

function renderOutlineTab() {
  const headings = extractMarkdownHeadings(state.draftMarkdown || '');
  return renderOutlineTabMarkup({ headings });
}

function renderConceptsTab(note) {
  return renderKnowledgePointPanel({
    note,
    points: state.knowledgePoints,
    tagGroups: state.knowledgePointTagGroups,
    availablePoints: state.allKnowledgePoints,
    filters: state.knowledgePointFilters,
    attachComposer: state.knowledgePointAttachComposer,
    expandedIds: state.expandedKnowledgePointIds,
    editing: state.knowledgePointEditing
  });
}

function renderEditorContextMenu() {
  if (!elements.editorContextMenu) {
    return;
  }

  if (!state.editorContextMenu.open || !getCurrentNote() || state.view.showSourceEditor) {
    elements.editorContextMenu.hidden = true;
    elements.editorContextMenu.innerHTML = '';
    return;
  }

  elements.editorContextMenu.hidden = false;
  elements.editorContextMenu.innerHTML = renderEditorContextMenuMarkup({
    getShortcutLabel: getEditorShortcutLabel
  });
  syncEditorContextMenuPosition();
  syncEditorContextSubmenuLayout();
}

function syncEditorContextSubmenuLayout() {
  if (!elements.editorContextMenu || elements.editorContextMenu.hidden) {
    return;
  }

  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  const submenuGroups = elements.editorContextMenu.querySelectorAll('.editor-context-submenu-group');
  submenuGroups.forEach((submenuGroup) => {
    const trigger = submenuGroup.querySelector('.editor-context-submenu-trigger');
    const submenu = submenuGroup.querySelector('.editor-context-submenu');
    if (!trigger || !submenu) {
      return;
    }

    submenuGroup.dataset.submenuSide = 'right';
    submenuGroup.dataset.submenuAlign = 'top';
    submenuGroup.style.setProperty('--submenu-offset-y', '-8px');

    const previousDisplay = submenu.style.display;
    const previousVisibility = submenu.style.visibility;
    submenu.style.display = 'grid';
    submenu.style.visibility = 'hidden';

    const triggerRect = trigger.getBoundingClientRect();
    const submenuRect = submenu.getBoundingClientRect();
    const fitsRight = triggerRect.right + submenuRect.width - 4 <= viewportWidth - 12;
    submenuGroup.dataset.submenuSide = fitsRight ? 'right' : 'left';

    let offsetY = -8;
    if (triggerRect.top + offsetY < 12) {
      offsetY = 12 - triggerRect.top;
    }
    if (triggerRect.top + offsetY + submenuRect.height > viewportHeight - 12) {
      offsetY = viewportHeight - 12 - triggerRect.top - submenuRect.height;
      submenuGroup.dataset.submenuAlign = 'bottom';
    }
    submenuGroup.style.setProperty('--submenu-offset-y', `${Math.round(offsetY)}px`);

    submenu.style.display = previousDisplay;
    submenu.style.visibility = previousVisibility;
  });
}

function openEditorContextMenu({ x, y }) {
  state.editorContextMenu.open = true;
  state.editorContextMenu.x = x;
  state.editorContextMenu.y = y;
  state.editorMenuOpen = null;
  closeContextMenu();
  closeSectionMenu();
  closeTabMenu();
  renderEditorMenuBar();
  renderEditorContextMenu();
}

function closeEditorContextMenu() {
  if (!state.editorContextMenu.open) {
    return;
  }

  state.editorContextMenu.open = false;
  renderEditorContextMenu();
}

async function handleEditorContextMenuAction(action) {
  closeEditorContextMenu();

  const note = getCurrentNote();
  if (!note) {
    flashStatus('请先选择一篇笔记');
    return;
  }

  if (!currentEditorHost) {
    flashStatus('编辑器尚未就绪');
    return;
  }

  if (action === 'table') {
    openTableInsertDialog();
    return;
  }

  if (action === 'create-knowledge-point') {
    await createKnowledgePointFromCurrentSelection(note);
    return;
  }

  if (EDITOR_CONTEXT_PRIMARY_ACTIONS.includes(action)) {
    await handleEditMenuAction(action);
    return;
  }

  await currentEditorHost.run(action);
  await currentEditorHost.focus();
}

function renderStatus() {
  const visibleNotes = getVisibleNotes();

  if (elements.statusIndicators) {
    elements.statusIndicators.innerHTML = renderStatusIndicators({
      statusMessage: state.statusMessage,
      visibleNoteCount: visibleNotes.length,
      folderCount: Object.keys(state.foldersById).length
    });
  }

  if (elements.statusMeta) {
    elements.statusMeta.innerHTML = renderStatusMeta({
      dataMode: state.dataMode,
      currentSpaceId: state.currentSpaceId
    });
  }
}

async function handleFormat(format) {
  if (!currentEditorHost) {
    return;
  }

  if (format === 'table') {
    openTableInsertDialog();
    return;
  }

  await currentEditorHost.run(format);
  await currentEditorHost.focus();
}

function shouldHandleEditorShortcut(event) {
  if (!currentEditorHost || !getCurrentNote() || state.view.showSourceEditor) {
    return false;
  }

  const target = event.target instanceof Element ? event.target : event.target?.parentElement;
  if (!target?.closest) {
    return false;
  }

  if (target.closest('#editor-utility-panel') || target.closest('[data-source-editor-input]')) {
    return false;
  }

  return Boolean(target.closest('#editor-content'));
}

async function handleResolvedEditorShortcut(action) {
  if (!currentEditorHost) {
    return;
  }

  await currentEditorHost.run(action);
  await currentEditorHost.focus();
}


async function handleParagraphMenuAction(action) {
  closeEditorMenuBar();

  const note = getCurrentNote();
  if (!note) {
    flashStatus('请先选择一篇笔记');
    return;
  }

  if (!currentEditorHost) {
    flashStatus('编辑器尚未就绪');
    return;
  }

  await currentEditorHost.run(action);
  await currentEditorHost.focus();
}

async function handleFormatMenuAction(action) {
  closeEditorMenuBar();

  const note = getCurrentNote();
  if (!note) {
    flashStatus('请先选择一篇笔记');
    return;
  }

  if (!currentEditorHost) {
    flashStatus('编辑器尚未就绪');
    return;
  }

  if (action === 'table') {
    openTableInsertDialog();
    return;
  }

  await currentEditorHost.run(action);
  await currentEditorHost.focus();
}

async function handleViewMenuAction(action) {
  closeEditorMenuBar();

  switch (action) {
    case 'mode-read':
      state.view.mode = 'read';
      state.view.showSourceEditor = false;
      renderAll();
      return;
    case 'mode-edit':
      state.view.mode = 'edit';
      state.view.showSourceEditor = false;
      renderAll();
      return;
    case 'mode-focus':
      state.view.mode = 'focus';
      state.view.showSourceEditor = false;
      renderAll();
      return;
    case 'toggle-left-sidebar':
      state.view.showLeftSidebar = !state.view.showLeftSidebar;
      renderWorkspaceViewState();
      renderEditorMenuBar();
      return;
    case 'toggle-right-sidebar':
      state.view.showRightSidebar = !state.view.showRightSidebar;
      renderWorkspaceViewState();
      renderEditorMenuBar();
      return;
    case 'toggle-source-editor':
      if (!getCurrentNote()) {
        flashStatus('请先选择一篇笔记');
        return;
      }
      state.view.mode = 'edit';
      state.view.showSourceEditor = !state.view.showSourceEditor;
      renderEditor(getCurrentNote());
      renderEditorMenuBar();
      return;
    default:
      return;
  }
}

async function handleEditMenuAction(action) {
  closeEditorMenuBar();
  closeEditorContextMenu();

  const note = getCurrentNote();
  if (!note) {
    flashStatus('请先选择一篇笔记');
    return;
  }

  const editorHost = currentEditorHost;
  const focusEditor = async () => {
    if (editorHost) {
      await editorHost.focus();
    }
  };

  switch (action) {
    case 'cut':
    case 'copy':
    case 'delete':
    case 'select-all': {
      await focusEditor();
      const command = action === 'select-all' ? 'selectAll' : action;
      const success = document.execCommand(command);
      if (!success) {
        flashStatus('当前环境暂不支持该编辑操作');
      }
      return;
    }
    case 'undo':
    case 'redo': {
      if (!editorHost) {
        flashStatus('编辑器尚未就绪');
        return;
      }
      await editorHost.run(action);
      await focusEditor();
      return;
    }
    case 'paste': {
      await focusEditor();
      try {
        const text = await navigator.clipboard.readText();
        if (!text) {
          flashStatus('剪贴板为空');
          return;
        }

        const inserted = await currentEditorHost?.pasteMarkdown(text);
        if (!inserted) {
          flashStatus('当前环境暂不支持粘贴');
        }
      } catch {
        flashStatus('无法读取剪贴板内容');
      }
      return;
    }
    case 'find': {
      openEditorPanel('find');
      return;
    }
    case 'replace': {
      openEditorPanel('replace');
      return;
    }
    default:
      return;
  }
}

async function handleEditorPanelAction(action) {
  const note = getCurrentNote();
  if (!note) {
    closeEditorPanel();
    flashStatus('请先选择一篇笔记');
    return;
  }

  if (action === 'close') {
    closeEditorPanel();
    return;
  }

  const query = state.editorPanel.query.trim();
  if (!query) {
    flashStatus('请输入查找内容');
    return;
  }

  const editorHost = currentEditorHost;

  if (action === 'submit' || action === 'submit-previous') {
    if (state.editorPanel.mode === 'find') {
      const direction = action === 'submit-previous' ? 'previous' : 'next';
      const result = await editorHost?.findAndSelect(query, state.editorPanel.matchIndex, direction);
      if (!result) {
        flashStatus('当前编辑器未就绪');
        return;
      }

      state.editorPanel = applyEditorPanelMatchResult(state.editorPanel, result);
      renderEditorPanel();

      if (!result.found) {
        flashStatus(`未找到：${query}`);
        return;
      }
      flashStatus(`已查找 ${result.index + 1}/${result.count}：${query}`);
      return;
    }

    if (state.editorPanel.mode === 'replace') {
      const replacement = state.editorPanel.replacement;
      const nextMarkdown = state.draftMarkdown.replace(query, replacement);
      if (nextMarkdown === state.draftMarkdown) {
        flashStatus(`未找到：${query}`);
        return;
      }

      state.draftMarkdown = nextMarkdown;
      if (editorHost) {
        await editorHost.setMarkdown(nextMarkdown);
        await editorHost.focus();
      }
      scheduleAutosave();
      flashStatus(`宸叉浛鎹細${query}`);
      renderEditorPanel();
      return;
    }
  }

  if (action === 'replace-all' && state.editorPanel.mode === 'replace') {
    const replacement = state.editorPanel.replacement;
    if (!state.draftMarkdown.includes(query)) {
      flashStatus(`未找到：${query}`);
      return;
    }

    const nextMarkdown = state.draftMarkdown.split(query).join(replacement);
    state.draftMarkdown = nextMarkdown;
    if (editorHost) {
      await editorHost.setMarkdown(nextMarkdown);
      await editorHost.focus();
    }
    scheduleAutosave();
    flashStatus(`宸插叏閮ㄦ浛鎹細${query}`);
    renderEditorPanel();
  }
}

async function handleContextMenuAction(action) {
  const { targetId } = state.contextMenu;
  closeContextMenu();
  clearDeleteIntent();

  switch (action) {
    case 'create-folder-root':
      startTreeEditor({ mode: 'create-folder', parentId: null, value: '' });
      return;
    case 'create-note-root':
      startTreeEditor({ mode: 'create-note', parentId: null, value: '' });
      return;
    case 'create-folder-child':
      startTreeEditor({ mode: 'create-folder', parentId: targetId, value: '' });
      openFolderBranch(targetId);
      return;
    case 'create-note-child':
      startTreeEditor({ mode: 'create-note', parentId: targetId, value: '' });
      openFolderBranch(targetId);
      return;
    case 'rename-folder': {
      const folder = state.foldersById[targetId];
      if (!folder) {
        return;
      }
      startTreeEditor({ mode: 'rename-folder', targetId: folder.id, value: folder.name });
      return;
    }
    case 'rename-note': {
      const note = getNoteById(targetId);
      if (!note || note.deleted) {
        return;
      }
      startTreeEditor({ mode: 'rename-note', targetId: note.id, value: note.title });
      return;
    }
    case 'favorite-note': {
      const note = getNoteById(targetId);
      if (!note || note.deleted) {
        return;
      }
      const nextFavorite = !note.favorite;
      await setNoteFavorite(note.id, nextFavorite);
      flashStatus(nextFavorite ? '已收藏笔记' : '已取消收藏');
      return;
    }
    case 'restore-note': {
      const note = getNoteById(targetId);
      if (!note || !note.deleted) {
        return;
      }
      await restoreNote(note.id);
      flashStatus('笔记已恢复');
      return;
    }
    case 'permanently-delete-note': {
      const note = getNoteById(targetId);
      if (!note || !note.deleted) {
        return;
      }
      await permanentlyDeleteNote(note.id);
      flashStatus('笔记已彻底删除');
      return;
    }
    case 'empty-recycle-bin': {
      await emptyRecycleBin();
      flashStatus('回收站已清空');
      return;
    }
    case 'delete-folder': {
      const folder = state.foldersById[targetId];
      if (!folder) {
        return;
      }
      state.deleteIntent = { kind: 'folder', targetId: folder.id };
      renderFolders();
      return;
    }
    case 'delete-note': {
      const note = getNoteById(targetId);
      if (!note || note.deleted) {
        return;
      }
      state.deleteIntent = { kind: 'note', targetId: note.id };
      renderFolders();
      return;
    }
    default:
      break;
  }
}

function startTreeEditor({ mode, parentId = null, targetId = null, value = '' }) {
  state.treeEditor = {
    mode,
    parentId,
    targetId,
    value
  };
  clearDeleteIntent({ rerender: false });
  closeContextMenu();
  renderFolders();
}

function cancelTreeEditor() {
  if (!state.treeEditor) {
    return;
  }
  state.treeEditor = null;
  renderFolders();
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
    renderFolders();
  }
}

async function commitDelete(kind, targetId) {
  clearDeleteIntent({ rerender: false });

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

async function commitDrop(dropTarget) {
  const { activeKind, activeId } = state.dragState;
  if (!activeKind || !activeId) {
    return;
  }

  resetDragState({ rerender: false });

  try {
    if (activeKind === 'folder') {
      await moveFolder(activeId, dropTarget.kind === 'materials' ? null : dropTarget.id);
      flashStatus('目录位置已更新');
    } else if (activeKind === 'note') {
      await moveNote(activeId, dropTarget.kind === 'materials' ? null : dropTarget.id);
      flashStatus('文件位置已更新');
    }
  } catch (error) {
    flashStatus(error.message || '移动失败');
  }
}

function resetDragState({ rerender = true } = {}) {
  state.dragState = {
    activeKind: null,
    activeId: null,
    overKind: null,
    overId: null
  };

  if (rerender) {
    renderFolders();
    return;
  }

  syncDragIndicators();
}

function syncDragIndicators() {
  const folderTree = elements.folderTree;
  if (!folderTree) {
    return;
  }

  folderTree.querySelectorAll('[data-drag-kind][data-drag-id]').forEach((node) => {
    const isDragging = (
      state.dragState.activeKind === node.dataset.dragKind
      && state.dragState.activeId === node.dataset.dragId
    );
    node.dataset.dragging = isDragging ? 'true' : 'false';
  });

  folderTree.querySelectorAll('[data-drop-target]').forEach((node) => {
    const folderId = node.dataset.folderId ?? null;
    const isRootTarget = node.dataset.materialsSection === 'true';
    const isDropTarget = (
      (isRootTarget && state.dragState.overKind === 'materials')
      || (folderId && state.dragState.overKind === 'folder' && state.dragState.overId === folderId)
    );
    node.dataset.dropTarget = isDropTarget ? 'true' : 'false';
  });
}

function resolveDropTarget(target) {
  return resolveNavigationDropTarget(target);
}

function canDropOnTarget(dragState, dropTarget) {
  return canDropOnNavigationTarget({
    dragState,
    dropTarget,
    foldersById: state.foldersById,
    notes: state.allNotes
  });
}

function isRootDropActive() {
  return state.dragState.overKind === 'materials';
}

function clearDeleteIntent({ rerender = true } = {}) {
  if (!state.deleteIntent) {
    return;
  }
  state.deleteIntent = null;
  if (rerender) {
    renderFolders();
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
  renderFolders();
}

function openFolderBranch(folderId) {
  state.openFolders = expandFolderBranch({
    openFolders: state.openFolders,
    foldersById: state.foldersById,
    folderId
  });
}

function openContextMenu({ x, y, targetKind, targetId }) {
  closeSectionMenu();
  cancelTreeEditor();
  state.contextMenu = {
    open: true,
    x,
    y,
    targetKind,
    targetId
  };
  renderContextMenu();
}

function closeContextMenu() {
  if (!state.contextMenu.open) {
    return;
  }
  state.contextMenu = {
    open: false,
    x: 0,
    y: 0,
    targetKind: null,
    targetId: null
  };
  renderContextMenu();
}

function closeSectionMenu() {
  if (!state.sectionMenuOpen) {
    return;
  }
  state.sectionMenuOpen = false;
  renderSectionMenu();
  renderHeaderToggle();
}

function closeEditorMenuBar() {
  if (!state.editorMenuOpen) {
    return;
  }

  state.editorMenuOpen = null;
  renderEditorMenuBar();
}

function openEditorPanel(mode) {
  state.editorPanel = createOpenedEditorPanelState(state.editorPanel, mode);
  closeEditorMenuBar();
  renderEditorPanel();
}

function closeEditorPanel() {
  if (!state.editorPanel.open) {
    return;
  }

  state.editorPanel.open = false;
  void currentEditorHost?.clearSearchHighlights();
  renderEditorPanel();
}

function openTabMenu({ x, y, noteId }) {
  closeContextMenu();
  closeSectionMenu();
  state.tabMenu = {
    open: true,
    x,
    y,
    noteId
  };
  renderTabMenu();
}

function closeTabMenu() {
  if (!state.tabMenu.open) {
    return;
  }

  state.tabMenu = {
    open: false,
    x: 0,
    y: 0,
    noteId: null
  };
  renderTabMenu();
}

async function handleTabMenuAction(action) {
  const noteId = state.tabMenu.noteId;
  closeTabMenu();

  if (!noteId) {
    return;
  }

  if (action === 'close') {
    await handleTabClose(noteId);
    return;
  }

  if (action === 'close-others') {
    state.openNoteTabs = closeOtherTabs(state.openNoteTabs, noteId).openTabs;
    if (state.selectedNoteId !== noteId) {
      await selectNote(noteId, { syncFolder: true, ensureTab: true });
      return;
    }
    renderTabs();
    return;
  }

  if (action === 'copy-path') {
    const note = state.allNotes.find((item) => item.id === noteId);
    const notePath = buildNoteTabPath(note, state.foldersById);
    if (notePath && navigator?.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(notePath);
        flashStatus('已复制笔记路径');
        return;
      } catch (error) {
        // Fall through to status feedback below.
      }
    }

    flashStatus(notePath || '未找到笔记路径');
  }
}

async function handleFileMenuAction(action) {
  closeEditorMenuBar();

  const note = getCurrentNote();
  const folderId = getMenuTargetFolderId();

  switch (action) {
    case 'new-note': {
      const title = createUntitledName(getSiblingNames(folderId), 'Untitled Note');
      await createNote(folderId, title);
      flashStatus(`已创建笔记：${title}`);
      return;
    }
    case 'new-folder': {
      const title = createUntitledName(getSiblingNames(folderId), 'Untitled Folder');
      startTreeEditor({ mode: 'create-folder', parentId: folderId, value: title });
      return;
    }
    case 'import-markdown':
      elements.markdownImportInput?.click();
      return;
    case 'favorite-note':
      if (note && !note.deleted) {
        const nextFavorite = !note.favorite;
        await setNoteFavorite(note.id, nextFavorite);
        flashStatus(nextFavorite ? '已收藏笔记' : '已取消收藏');
      }
      return;
    case 'delete-note':
      if (note && !note.deleted) {
        await deleteNote(note.id);
        flashStatus('笔记已删除');
      }
      return;
    case 'restore-note':
      if (note?.deleted) {
        await restoreNote(note.id);
        flashStatus('笔记已恢复');
      }
      return;
    case 'save':
      await persistDraft({ immediate: true });
      return;
    case 'save-as':
      await duplicateCurrentNote(note);
      return;
    case 'rename':
      if (note) {
        startTreeEditor({ mode: 'rename-note', targetId: note.id, value: note.title });
      }
      return;
    case 'export-markdown':
      exportCurrentNoteAsMarkdown(note);
      return;
    case 'export-pdf':
      exportCurrentNoteAsPdfStable(note);
      return;
    default:
      return;
  }
}

async function importMarkdownFiles(files) {
  const folderId = getMenuTargetFolderId();
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

    if (firstImported?.id) {
      state.selectedNoteId = firstImported.id;
      state.selectedFolderId = firstImported.folderId ?? folderId ?? null;
      state.openNoteTabs = ensureOpenTab(state.openNoteTabs, firstImported.id);
      if (state.selectedFolderId) {
        openFolderBranch(state.selectedFolderId);
      }
    }

    await refreshKnowledgeData();

    if (firstImported?.id) {
      await loadCurrentNoteSideData();
      renderAll();
    } else {
      await loadCurrentNoteSideData();
      renderAll();
    }

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

function getMenuTargetFolderId() {
  if (state.selectedFolderId) {
    return state.selectedFolderId;
  }

  return getCurrentNote()?.folderId ?? null;
}

function getSiblingNames(folderId) {
  return getSiblingNamesForFolder({
    folderId,
    foldersById: state.foldersById,
    folderTree: state.folderTree,
    notes: state.allNotes
  });
}

async function duplicateCurrentNote(note) {
  if (!note) {
    return;
  }

  await persistDraft({ immediate: true });
  const refreshedNote = getCurrentNote() ?? note;
  const nextTitle = createDuplicateTitle(getSiblingNames(refreshedNote.folderId ?? null), refreshedNote.title);

  if (state.dataMode === 'api') {
    const created = await knowledgeApi.createNote({
      title: nextTitle,
      rawMarkdown: state.draftMarkdown || refreshedNote.rawMarkdown,
      folderId: refreshedNote.folderId ?? null,
      spaceId: state.currentSpaceId,
      sourceType: refreshedNote.sourceType ?? 'manual',
      status: refreshedNote.status ?? 'draft'
    });

    state.selectedNoteId = created.id;
    state.openNoteTabs = ensureOpenTab(state.openNoteTabs, created.id);
    await refreshKnowledgeData();
    await loadCurrentNoteSideData();
    renderAll();
    flashStatus(`已另存为：${nextTitle}`);
    return;
  }

  const nextNote = createLocalDuplicateNoteInput({
    note: refreshedNote,
    title: nextTitle,
    markdown: state.draftMarkdown || refreshedNote.rawMarkdown
  });

  state.allNotes = insertLocalNote(state.allNotes, nextNote);
  state.selectedNoteId = nextNote.id;
  state.openNoteTabs = ensureOpenTab(state.openNoteTabs, nextNote.id);
  syncLocalWorkspace();
  flashStatus(`已另存为：${nextTitle}`);
}

function exportCurrentNoteAsMarkdown(note) {
  if (!note) {
    return;
  }

  const fileName = buildExportFileName(note.title, 'md');
  triggerFileDownload(fileName, state.draftMarkdown || note.rawMarkdown, 'text/markdown;charset=utf-8');
  flashStatus(`宸插鍑猴細${fileName}`);
}

function exportCurrentNoteAsPdf(note) {
  if (!note) {
    return;
  }

  const editorBody = document.querySelector('#milkdown-editor .ProseMirror');
  const previewHtml = editorBody?.innerHTML ?? `<pre>${escapeHtml(state.draftMarkdown || note.rawMarkdown)}</pre>`;
  const previewFileName = buildExportFileName(note.title, 'pdf');
  const printableHtml = buildNoteExportHtml({
    title: previewFileName,
    previewHtml,
    print: true,
    delayedPrint: true
  });
  const exportBlob = new Blob([printableHtml], { type: 'text/html;charset=utf-8' });
  const exportUrl = URL.createObjectURL(exportBlob);
  const exportWindow = window.open(exportUrl, '_blank');

  if (!exportWindow) {
    flashStatus('导出 PDF 失败：浏览器拦截了弹窗');
    return;
  }

  const fileName = buildExportFileName(note.title, 'pdf');
  exportWindow.document.write(buildNoteExportHtml({
    title: fileName,
    previewHtml,
    print: true
  }));
  exportWindow.document.close();
  flashStatus(`已准备导出：${fileName}`);
}

function exportCurrentNoteAsPdfStable(note) {
  if (!note) {
    return;
  }

  const editorBody = document.querySelector('#milkdown-editor .ProseMirror');
  const previewHtml = editorBody?.innerHTML ?? `<pre>${escapeHtml(state.draftMarkdown || note.rawMarkdown)}</pre>`;
  const exportName = buildExportFileName(note.title, 'html');
  const styledHtml = buildNoteExportHtml({
    title: exportName,
    previewHtml,
    rich: true
  });
  triggerFileDownload(exportName, styledHtml, 'text/html;charset=utf-8');
  flashStatus(`已导出：${exportName}`);
}

function triggerFileDownload(fileName, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
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

async function handleTabClose(noteId) {
  const { openTabs, nextActiveId } = closeTab(state.openNoteTabs, noteId, state.selectedNoteId);
  state.openNoteTabs = openTabs;

  if (state.selectedNoteId !== noteId) {
    renderTabs();
    return;
  }

  if (!nextActiveId) {
    await persistDraft({ immediate: true });
    state.selectedNoteId = null;
    state.draftMarkdown = '';
    state.linkedNotes = [];
    state.attachments = [];
    renderAll();
    return;
  }

  await selectNote(nextActiveId, { syncFolder: true, ensureTab: false });
}

function resetTabDragState({ rerender = true } = {}) {
  if (!state.tabDragState.activeId && !state.tabDragState.overId) {
    return;
  }

  state.tabDragState = {
    activeId: null,
    overId: null
  };

  if (rerender) {
    renderTabs();
    return;
  }

  syncTabDragIndicators();
}

function syncTabDragIndicators() {
  if (!elements.noteTabs) {
    return;
  }

  elements.noteTabs.querySelectorAll('[data-tab-note-id]').forEach((node) => {
    const noteId = node.dataset.tabNoteId;
    node.dataset.dragging = String(state.tabDragState.activeId === noteId);
    node.dataset.dropTarget = String(state.tabDragState.overId === noteId);
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

function syncLocalWorkspace() {
  state.foldersById = flattenFolderTree(state.folderTree);
  reconcileSelection();
  loadLocalNoteSideData(state.selectedNoteId);
  renderAll();
}

function getCurrentNote() {
  if (!state.selectedNoteId) {
    return null;
  }

  return state.allNotes.find((note) => note.id === state.selectedNoteId) ?? null;
}

function getNoteById(noteId) {
  if (!noteId) {
    return null;
  }

  return state.allNotes.find((note) => note.id === noteId) ?? null;
}

function getActiveNotes() {
  return state.allNotes.filter((note) => !note.deleted);
}

function getRecycleNotes() {
  return state.allNotes
    .filter((note) => note.deleted)
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
}

async function teardownEditorHost() {
  pendingEditorNoteId = null;
  currentEditorNoteId = null;
  editorMountToken += 1;

  if (!currentEditorHost) {
    return;
  }

  const host = currentEditorHost;
  currentEditorHost = null;
  await host.destroy();
}

function mountEditorHost(noteId, markdown) {
  const root = document.getElementById('milkdown-editor');
  if (!root) {
    return;
  }

  if (pendingEditorNoteId === noteId) {
    return;
  }

  const token = ++editorMountToken;
  pendingEditorNoteId = noteId;
  const previousHost = currentEditorHost;
  currentEditorHost = null;
  currentEditorNoteId = null;

  void (async () => {
    if (previousHost) {
      await previousHost.destroy();
    }

    const host = createMilkdownHost({
      root,
      markdown,
      noteId,
      onChange: handleEditorMarkdownChange
    });

    await host.ready;

    if (token !== editorMountToken || state.selectedNoteId !== noteId) {
      await host.destroy();
      return;
    }

    currentEditorHost = host;
    currentEditorNoteId = noteId;
    pendingEditorNoteId = null;
    syncKnowledgePointMarkers();
    renderEditorSaveIndicator();
    renderStatus();

    // 恢复之前保存的滚动位置
    restoreEditorScrollPosition(noteId);
  })().catch((error) => {
    pendingEditorNoteId = null;
    flashStatus(error.message || '编辑器加载失败');
  });
}

function syncEditorContextMenuPosition() {
  if (!elements.editorContextMenu || elements.editorContextMenu.hidden) {
    return;
  }

  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  const panel = elements.editorContextMenu.querySelector('.editor-context-panel');
  if (!panel) {
    elements.editorContextMenu.style.left = `${state.editorContextMenu.x}px`;
    elements.editorContextMenu.style.top = `${state.editorContextMenu.y}px`;
    return;
  }

  const panelRect = panel.getBoundingClientRect();
  const clampedX = Math.min(Math.max(8, state.editorContextMenu.x), Math.max(8, viewportWidth - panelRect.width - 8));
  const clampedY = Math.min(Math.max(8, state.editorContextMenu.y), Math.max(8, viewportHeight - panelRect.height - 8));
  elements.editorContextMenu.style.left = `${Math.round(clampedX)}px`;
  elements.editorContextMenu.style.top = `${Math.round(clampedY)}px`;
}

function handleEditorMarkdownChange(markdown) {
  if (!currentEditorNoteId || currentEditorNoteId !== state.selectedNoteId) {
    return;
  }

  state.draftMarkdown = markdown;
  scheduleAutosave();
}

function renderEditorSaveIndicator() {
  const indicator = document.getElementById('editor-save-indicator');
  if (!indicator) {
    return;
  }

  indicator.dataset.saveState = state.saveState;
  indicator.textContent = getSaveStateLabel({
    saveState: state.saveState,
    lastSavedAt: state.lastSavedAt,
    formatDate
  });
}

function renderEditorPanel() {
  const panel = document.getElementById('editor-utility-panel');
  if (!panel) {
    return;
  }

  const note = getCurrentNote();
  if (!state.editorPanel.open || !note) {
    panel.hidden = true;
    panel.innerHTML = '';
    return;
  }

  panel.hidden = false;
  panel.dataset.mode = state.editorPanel.mode;
  panel.innerHTML = renderEditorPanelMarkup(state.editorPanel);

  if (state.editorPanel.autoFocusInput) {
    window.requestAnimationFrame(() => {
      const input = panel.querySelector('[data-panel-field="query"]');
      input?.focus();
      input?.select();
      state.editorPanel.autoFocusInput = false;
    });
  }
}

function openTableInsertDialog({ rows = '4', cols = '3' } = {}) {
  state.editorTableDialog.open = true;
  state.editorTableDialog.rows = String(rows);
  state.editorTableDialog.cols = String(cols);
  state.editorTableDialog.autoFocusInput = true;
  closeEditorMenuBar();
  closeEditorContextMenu();
  renderTableInsertDialog();
}

function closeTableInsertDialog() {
  if (!state.editorTableDialog.open) {
    return;
  }

  state.editorTableDialog.open = false;
  state.editorTableDialog.autoFocusInput = false;
  renderTableInsertDialog();
}

async function submitTableInsertDialog() {
  if (!currentEditorHost) {
    flashStatus('编辑器尚未就绪');
    return;
  }

  const row = normalizeTableDialogValue(state.editorTableDialog.rows, 4);
  const col = normalizeTableDialogValue(state.editorTableDialog.cols, 3);
  state.editorTableDialog.rows = String(row);
  state.editorTableDialog.cols = String(col);

  await currentEditorHost.run('table', { row, col });
  closeTableInsertDialog();
  await currentEditorHost.focus();
}

function renderTableInsertDialog() {
  const dialog = document.getElementById('editor-table-dialog');
  if (!dialog) {
    return;
  }

  const note = getCurrentNote();
  if (!state.editorTableDialog.open || !note || state.view.showSourceEditor) {
    dialog.hidden = true;
    dialog.innerHTML = '';
    return;
  }

  dialog.hidden = false;
  dialog.innerHTML = renderTableInsertDialogMarkup(state.editorTableDialog);

  if (state.editorTableDialog.autoFocusInput) {
    window.requestAnimationFrame(() => {
      const input = dialog.querySelector('[data-table-dialog-field="cols"]');
      input?.focus();
      input?.select();
      state.editorTableDialog.autoFocusInput = false;
    });
  }
}

function scheduleAutosave() {
  if (!getCurrentNote()) {
    return;
  }

  state.saveState = 'pending';
  renderEditorSaveIndicator();
  renderStatus();

  if (autosaveTimer) {
    clearTimeout(autosaveTimer);
  }

  autosaveTimer = setTimeout(() => {
    autosaveTimer = null;
    void persistDraft();
  }, AUTOSAVE_DELAY_MS);
}

async function persistDraft({ immediate = false } = {}) {
  const note = getCurrentNote();
  if (!note) {
    return;
  }

  if (autosaveTimer) {
    clearTimeout(autosaveTimer);
    autosaveTimer = null;
  }

  const draftSave = resolveDraftSaveState({
    note,
    markdown: state.draftMarkdown,
    deriveTitle: deriveNoteTitleFromMarkdown
  });
  if (!draftSave.changed) {
    state.saveState = 'saved';
    renderEditorSaveIndicator();
    renderStatus();
    return;
  }

  state.saveState = 'saving';
  renderEditorSaveIndicator();
  renderStatus();

  try {
    let updatedNote;

    if (state.dataMode === 'api') {
      updatedNote = await knowledgeApi.updateNote(note.id, {
        title: draftSave.nextTitle,
        rawMarkdown: draftSave.nextMarkdown
      });
    } else {
      updatedNote = createLocalDraftNote({
        note,
        title: draftSave.nextTitle,
        markdown: draftSave.nextMarkdown
      });
    }

    state.allNotes = replaceNoteInCollection(state.allNotes, updatedNote, {
      title: draftSave.nextTitle,
      rawMarkdown: draftSave.nextMarkdown
    });
    state.saveState = 'saved';
    state.lastSavedAt = updatedNote.updatedAt ?? new Date().toISOString();

    renderFolders();
    renderSidebar(getCurrentNote());
    renderEditorSaveIndicator();
    renderStatus();
    persistBackendCache();

    if (immediate) {
      flashStatus('已保存当前笔记');
    }
  } catch (error) {
    state.saveState = 'error';
    renderEditorSaveIndicator();
    renderStatus();
    flashStatus(error.message || '保存失败');
  }
}

function getVisibleNotes() {
  return getVisibleNavigationNotes({
    notes: state.allNotes,
    foldersById: state.foldersById,
    selectedFolderId: state.selectedFolderId,
    search: state.search
  });
}

function getSearchResultNotes() {
  return selectSearchResultNotes({
    notes: state.allNotes,
    foldersById: state.foldersById,
    selectedFolderId: state.selectedFolderId,
    search: state.search
  });
}

function getSelectedSearchTags() {
  return withTagUsageCounts(selectSearchTags(state.tags, state.search), getActiveNotes());
}

function getVisibleSearchTags() {
  return withTagUsageCounts(selectVisibleSearchTags(state.tags, state.search), getActiveNotes());
}

function getTagUsageCount(tagId) {
  return countTagUsage(getActiveNotes(), tagId);
}

function hasActiveSearchFilters() {
  return hasSearchFilters(state.search);
}

function getDirectNotesForFolder(folderId) {
  return selectDirectNotesForFolder(state.allNotes, folderId);
}

function noteMatchesSelectedTags(note) {
  return noteHasSelectedSearchTags(note, state.search);
}

function matchesSearch(value) {
  return valueMatchesSearch(value, state.search);
}

function matchesFolderSearch(folder) {
  return folderMatchesNavigationSearch({
    folder,
    notes: state.allNotes,
    search: state.search
  });
}

function toggleSearchTagFilter(tagId) {
  if (!tagId) {
    return;
  }

  state.search.selectedTagIds = toggleSearchTagId(state.search.selectedTagIds, tagId);
  state.search.isOpen = true;
  reconcileSelection();
  renderAll();
}

function clearSearchFilters() {
  state.search.keyword = '';
  state.search.selectedTagIds = [];
  state.search.isOpen = false;
  reconcileSelection();
  renderAll();
}

function focusSearchInput() {
  const input = elements.globalSearchShell?.querySelector('[data-search-input]');
  if (!input) {
    return;
  }

  input.focus();
  const cursor = input.value.length;
  input.setSelectionRange(cursor, cursor);
}

function isCreateEditorForParent(parentId) {
  return Boolean(
    state.treeEditor
    && (state.treeEditor.mode === 'create-folder' || state.treeEditor.mode === 'create-note')
    && state.treeEditor.parentId === parentId
  );
}

function replaceNoteInState(updatedNote) {
  const nextNotes = replaceNoteInCollection(state.allNotes, updatedNote);
  if (nextNotes === state.allNotes) {
    return;
  }

  state.allNotes = nextNotes;

  reconcileSelection();
  persistBackendCache();
  renderAll();
}

function replaceTagInState(updatedTag) {
  state.tags = upsertTag(state.tags, updatedTag);
  persistBackendCache();
}

function removeTagFromState(tagId) {
  const nextCollections = removeTagFromCollections(
    {
      tags: state.tags,
      allNotes: state.allNotes,
      selectedTagIds: state.search.selectedTagIds
    },
    tagId
  );

  state.tags = nextCollections.tags;
  state.allNotes = nextCollections.allNotes;
  state.search.selectedTagIds = nextCollections.selectedTagIds;
  persistBackendCache();
}

async function addTagToCurrentNote(tagId) {
  const currentNote = getCurrentNote();
  if (!currentNote || currentNote.deleted || !tagId) {
    return;
  }

  const nextTagIds = [...new Set([...(currentNote.tagIds ?? []), tagId])];

  try {
    if (state.dataMode === 'local') {
      replaceNoteInState({
        ...currentNote,
        tagIds: nextTagIds,
        updatedAt: new Date().toISOString()
      });
    } else {
      replaceNoteInState(await knowledgeApi.setNoteTags(currentNote.id, nextTagIds));
    }

    flashStatus('标签已添加到当前笔记');
  } catch (error) {
    flashStatus(error.message || '添加标签失败');
  }
}

async function removeTagFromCurrentNote(tagId) {
  const currentNote = getCurrentNote();
  if (!currentNote || currentNote.deleted || !tagId) {
    return;
  }

  try {
    let updatedNote;

    if (state.dataMode === 'local') {
      updatedNote = {
        ...currentNote,
        tagIds: (currentNote.tagIds ?? []).filter((currentTagId) => currentTagId !== tagId),
        updatedAt: new Date().toISOString()
      };
    } else {
      updatedNote = await knowledgeApi.removeTagFromNote(currentNote.id, tagId);
    }

    replaceNoteInState(updatedNote);
    await cleanupOrphanTag(tagId);
    flashStatus('标签已从当前笔记移除');
  } catch (error) {
    flashStatus(error.message || '移除标签失败');
  }
}

async function createTagAndAssignToCurrentNote(name) {
  const normalizedName = normalizeTagName(name);
  const currentNote = getCurrentNote();
  if (!currentNote || currentNote.deleted || !normalizedName) {
    return;
  }

  const existingTag = findTagByName(state.tags, normalizedName);
  if (existingTag) {
    state.noteTagComposer.draft = '';
    state.noteTagComposer.isExpanded = true;
    await addTagToCurrentNote(existingTag.id);
    renderSidebar(getCurrentNote());
    return;
  }

  try {
    const tagInput = buildTagInput({
      name: normalizedName,
      tags: state.tags,
      spaceId: state.currentSpaceId
    });

    let createdTag;
    if (state.dataMode === 'local') {
      createdTag = {
        ...tagInput,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    } else {
      createdTag = await knowledgeApi.createTag(tagInput);
    }

    replaceTagInState(createdTag);
    state.noteTagComposer.draft = '';
    state.noteTagComposer.isExpanded = true;
    await addTagToCurrentNote(createdTag.id);
    renderSidebar(getCurrentNote());
    flashStatus('新标签已创建并绑定到当前笔记');
  } catch (error) {
    flashStatus(error.message || '创建标签失败');
  }
}

async function cleanupOrphanTag(tagId) {
  if (!tagId || state.allNotes.some((note) => (note.tagIds ?? []).includes(tagId))) {
    return;
  }

  try {
    if (state.dataMode === 'local') {
      removeTagFromState(tagId);
    } else {
      await knowledgeApi.deleteTag(tagId);
      removeTagFromState(tagId);
    }

    renderAll();
  } catch (error) {
    flashStatus(error.message || '清理孤立标签失败');
  }
}

function replaceKnowledgePointInState(point) {
  const nextCollections = replaceKnowledgePointCollections(state, point);
  state.knowledgePoints = nextCollections.knowledgePoints;
  state.allKnowledgePoints = nextCollections.allKnowledgePoints;
}

function insertKnowledgePointInState(point) {
  const nextCollections = insertKnowledgePointCollections(state, point);
  state.knowledgePoints = nextCollections.knowledgePoints;
  state.allKnowledgePoints = nextCollections.allKnowledgePoints;
}

function removeKnowledgePointFromState(pointId) {
  const nextCollections = removeKnowledgePointCollections(state, pointId);
  state.knowledgePoints = nextCollections.knowledgePoints;
  state.allKnowledgePoints = nextCollections.allKnowledgePoints;
}

function syncKnowledgePointMembership(point) {
  const nextCollections = syncKnowledgePointMembershipCollections(
    state,
    point,
    getCurrentNote()?.id ?? null
  );
  state.knowledgePoints = nextCollections.knowledgePoints;
  state.allKnowledgePoints = nextCollections.allKnowledgePoints;
}

function getCurrentKnowledgePointSources() {
  return buildCurrentNoteKnowledgePointSources(state.knowledgePoints, getCurrentNote()?.id ?? null);
}

function syncKnowledgePointMarkers() {
  void currentEditorHost?.setKnowledgePointSources(getCurrentKnowledgePointSources());
}

function scrollKnowledgePointCardIntoView(pointId) {
  requestAnimationFrame(() => {
    const cards = Array.from(elements.asideContent?.querySelectorAll('[data-knowledge-point-id]') ?? []);
    const card = cards.find((item) => item.dataset.knowledgePointId === pointId);
    card?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
}

function focusKnowledgePointFromMarker({ sourceId, knowledgePointId }) {
  const point = knowledgePointId
    ? state.knowledgePoints.find((item) => item.id === knowledgePointId)
    : state.knowledgePoints.find((item) => (item.sources ?? []).some((source) => source.id === sourceId));
  if (!point) {
    return;
  }

  state.asideTab = 'concepts';
  state.expandedKnowledgePointIds = {
    ...state.expandedKnowledgePointIds,
    [point.id]: true
  };
  renderSidebar(getCurrentNote());
  scrollKnowledgePointCardIntoView(point.id);
}

async function selectKnowledgePointSource(sourceId) {
  if (!currentEditorHost) {
    flashStatus('编辑器尚未就绪');
    return;
  }

  const sourcePoint = state.knowledgePoints.find((point) => (
    (point.sources ?? []).some((source) => source.id === sourceId)
  ));
  if (sourcePoint) {
    state.expandedKnowledgePointIds = {
      ...state.expandedKnowledgePointIds,
      [sourcePoint.id]: true
    };
    renderSidebar(getCurrentNote());
  }

  const selected = await currentEditorHost.selectKnowledgePointSource(sourceId);
  flashStatus(selected ? '已定位到正文片段' : '未能在正文中定位该片段');
}

async function createKnowledgePointFromCurrentSelection(note) {
  if (!currentEditorHost) {
    flashStatus('编辑器尚未就绪');
    return;
  }

  const selection = await currentEditorHost.getSelectionSnapshot();
  if (!selection) {
    flashStatus('请先选中正文片段');
    return;
  }

  const input = buildKnowledgePointInputFromSelection({
    note: {
      ...note,
      spaceId: note.spaceId ?? state.currentSpaceId
    },
    selection
  });

  try {
    let created;
    if (state.dataMode === 'local' || state.dataMode === 'cache') {
      created = createLocalKnowledgePointAggregate(input);
    } else {
      created = await knowledgeApi.createKnowledgePoint(input);
    }

    insertKnowledgePointInState(created);
    syncKnowledgePointMarkers();
    state.asideTab = 'concepts';
    state.expandedKnowledgePointIds = {
      ...state.expandedKnowledgePointIds,
      [created.id]: true
    };
    renderSidebar(getCurrentNote());
    flashStatus('已从选区创建知识点');
  } catch (error) {
    flashStatus(error.message || '创建知识点失败');
  }
}

async function attachSelectionToExistingKnowledgePoint(pointId) {
  const note = getCurrentNote();
  if (!note || !currentEditorHost) {
    flashStatus('请先打开笔记并选中正文片段');
    return;
  }

  const selection = await currentEditorHost.getSelectionSnapshot();
  if (!selection) {
    flashStatus('请先选中要加入知识点的正文片段');
    return;
  }

  const sourceInput = buildKnowledgePointSourceInputFromSelection({
    note: {
      ...note,
      spaceId: note.spaceId ?? state.currentSpaceId
    },
    selection
  });

  try {
    let updated;
    if (state.dataMode === 'local' || state.dataMode === 'cache') {
      const point = state.allKnowledgePoints.find((item) => item.id === pointId);
      updated = addLocalKnowledgePointSource(point, sourceInput, note.id);
      if (!updated) {
        flashStatus('未找到要加入的知识点');
        return;
      }
    } else {
      updated = await knowledgeApi.addSourceToKnowledgePoint(pointId, sourceInput);
    }

    syncKnowledgePointMembership(updated);
    state.asideTab = 'concepts';
    state.knowledgePointAttachComposer = { query: '', isOpen: false };
    state.expandedKnowledgePointIds = {
      ...state.expandedKnowledgePointIds,
      [updated.id]: true
    };
    syncKnowledgePointMarkers();
    renderSidebar(getCurrentNote());
    flashStatus('已加入已有知识点');
  } catch (error) {
    flashStatus(error.message || '加入已有知识点失败');
  }
}

async function removeKnowledgePointSourceFromCurrentNote(sourceId) {
  try {
    let updated;
    if (state.dataMode === 'local' || state.dataMode === 'cache') {
      const point = state.allKnowledgePoints.find((item) => (item.sources ?? []).some((source) => source.id === sourceId));
      if (!point) {
        return;
      }
      const result = removeLocalKnowledgePointSource({
        point,
        sourceId,
        currentNoteId: getCurrentNote()?.id
      });
      if (result.reason === 'last-source') {
        flashStatus('知识点至少需要保留一个原文片段');
        return;
      }
      if (!result.updatedPoint) {
        return;
      }
      updated = result.updatedPoint;
    } else {
      updated = await knowledgeApi.deleteKnowledgePointSource(sourceId);
    }

    syncKnowledgePointMembership(updated);
    syncKnowledgePointMarkers();
    renderSidebar(getCurrentNote());
    flashStatus('已从当前笔记移除该原文片段');
  } catch (error) {
    flashStatus(error.message || '移除原文片段失败');
  }
}

async function deleteKnowledgePointFromLibrary(pointId) {
  try {
    if (state.dataMode === 'local' || state.dataMode === 'cache') {
      removeKnowledgePointFromState(pointId);
    } else {
      await knowledgeApi.deleteKnowledgePoint(pointId);
      removeKnowledgePointFromState(pointId);
    }

    syncKnowledgePointMarkers();
    renderSidebar(getCurrentNote());
    flashStatus('知识点已删除');
  } catch (error) {
    flashStatus(error.message || '删除知识点失败');
  }
}

async function updateCurrentKnowledgePoint(pointId, form) {
  const point = state.knowledgePoints.find((item) => item.id === pointId);
  if (!point) {
    return;
  }

  const updates = getKnowledgePointFormUpdates(form);
  if (!updates.title) {
    flashStatus('知识点标题不能为空');
    return;
  }

  try {
    if (state.dataMode === 'local' || state.dataMode === 'cache') {
      replaceKnowledgePointInState({
        ...point,
        ...updates,
        updatedAt: new Date().toISOString()
      });
    } else {
      replaceKnowledgePointInState(await knowledgeApi.updateKnowledgePoint(pointId, updates));
    }

    state.knowledgePointEditing = null;
    syncKnowledgePointMarkers();
    renderSidebar(getCurrentNote());
    flashStatus('知识点已更新');
  } catch (error) {
    flashStatus(error.message || '更新知识点失败');
  }
}

function formatDate(value) {
  if (!value) {
    return '-';
  }

  return new Date(value).toLocaleString('zh-CN');
}

function flashStatus(message) {
  state.statusMessage = message;
  renderStatus();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}





