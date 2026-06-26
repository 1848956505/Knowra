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
import { bindDocumentActionEvents } from '../lib/events/document-action-events.js';
import { bindMenuEvents } from '../lib/events/menu-events.js';
import { bindFolderTreeEvents } from '../lib/events/folder-tree-events.js';
import { bindNoteTabEvents } from '../lib/events/note-tab-events.js';
import { bindEditorContentEvents } from '../lib/events/editor-content-events.js';
import { bindAsideEvents } from '../lib/events/aside-events/index.js';
import { createNavigationController } from './controllers/navigation-controller.js';
import { createEditorController } from './controllers/editor-controller.js';
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
const editorRuntime = {
  autosaveTimer: null,
  currentEditorHost: null,
  currentEditorNoteId: null,
  pendingEditorNoteId: null,
  editorMountToken: 0
};
let navigationController = null;
let editorController = null;

/** 笔记编辑器滚动位置记录（noteId → scrollTop） */
const editorScrollPositions = {};
const SCROLL_POSITIONS_KEY = 'study-accelerator.editor-scroll-positions';

function saveCurrentEditorScrollPosition() {
  const root = document.getElementById('milkdown-editor');
  if (root) {
    captureScrollPosition(editorScrollPositions, editorRuntime.currentEditorNoteId, root.scrollTop);
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
  createControllers();
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

function createControllers() {
  navigationController = createNavigationController({
    state,
    elements,
    knowledgeApi,
    getActiveNotes,
    getRecycleNotes,
    getNoteById,
    noteMatchesSelectedTags,
    matchesSearch,
    matchesFolderSearch,
    renderAll,
    renderStatus,
    refreshKnowledgeData,
    loadCurrentNoteSideData,
    clearNoteSideData,
    persistDraft,
    syncLocalWorkspace,
    saveCurrentEditorScrollPosition,
    flashStatus,
    escapeHtml
  });
  editorController = createEditorController({
    state,
    elements,
    editorRuntime,
    knowledgeApi,
    autosaveDelayMs: AUTOSAVE_DELAY_MS,
    getCurrentNote,
    getEffectiveViewState,
    renderAll,
    renderTabs,
    renderFolders,
    renderSidebar,
    renderStatus,
    persistBackendCache,
    refreshKnowledgeData,
    loadCurrentNoteSideData,
    syncLocalWorkspace,
    openFolderBranch,
    closeContextMenu,
    closeSectionMenu,
    closeTabMenu,
    createKnowledgePointFromCurrentSelection,
    syncKnowledgePointMarkers,
    getCurrentKnowledgePointSources,
    flashStatus,
    escapeHtml,
    escapeAttribute
  });
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
    getCurrentEditorHost: () => editorRuntime.currentEditorHost,
    // 笔记标签：tab 关闭/选中/拖拽重排 + 右键菜单
    handleTabClose, openTabMenu, syncTabDragIndicators,
    reorderTabs, resetTabDragState, handleTabMenuAction,
    // 编辑器内容：contextmenu / knowledge-point-marker / 源码模式
    openEditorContextMenu, focusKnowledgePointFromMarker,
    handleEditorContextMenuAction,
    scheduleAutosave, syncSourcePreview, persistDraft,
    // 侧栏：tab 切换 / 18 个 asideContent.click 分支 / 4 类 input / submit / keydown
    renderSidebar,
    addTagToCurrentNote, removeTagFromCurrentNote, createTagAndAssignToCurrentNote,
    updateCurrentKnowledgePoint, attachSelectionToExistingKnowledgePoint,
    removeKnowledgePointSourceFromCurrentNote, deleteKnowledgePointFromLibrary,
    selectKnowledgePointSource, findOutlineHeadingTarget,
    // 滚动位置（window beforeunload）
    saveCurrentEditorScrollPosition, persistScrollPositions
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
  // aside 由后续拆分 commit 加入。
  // Claude Code 拆分 bindEvents 时迁出（commit 8，2026-06-25）：
  // 原本的 elements.folderTree 上的 10 个监听器（2 click + contextmenu +
  // dragstart/dragover/drop/dragend + submit/keydown/input）移至
  // apps/web/lib/events/folder-tree-events.js。select-note click 分支
  // 无 return 的 fall-through 行为保留（两个 click 监听器在 binder 内
  // 按原顺序注册）。

  // Claude Code 拆分 bindEvents 时迁出（commit 7，2026-06-25）：
  // 原本的 elements.contextMenu.click / sectionMenu.click / editorMenuBar.click
  // 三段（派发 [data-context-action] / 切换 [data-section-toggle] / 编辑器
  // 菜单 toggle + 5 个动作派发）移至 apps/web/lib/events/menu-events.js。
  // 注意 editorMenuBar 顶部 event.stopPropagation() 保留。

  // Claude Code 拆分 bindEvents 时迁出（commit 11，2026-06-25）：
  // 侧栏相关 5 个监听器全部移至 apps/web/lib/events/aside-events/：
  //   - asideTabs.click          → tabs.js
  //   - asideContent.click       → click.js（15 个 [data-*] 分支）
  //   - asideContent.input       → input.js（4 类输入）
  //   - asideContent.submit      → forms.js
  //   - asideContent.keydown     → forms.js
  // 桶入口 bindAsideEvents 串行调用 4 个子 binder，注册顺序与原
  // bindEvents() 完全一致；行为零变化（closest + 早退 + renderSidebar
  // 调用均保留）。

  // Claude Code 拆分 bindEvents 时迁出（commit 3，2026-06-25）：
  // Claude Code 拆分 bindEvents 时迁出（commit 4，2026-06-25）：
  // 原本 elements.editorContent 上的 4 个监听器（contextmenu / knowledge-
  // point-marker-click / input / click）和 elements.editorContextMenu.click
  // 移至 apps/web/lib/events/editor-content-events.js。contextmenu 中对
  // event.target 的 Element 判定在 binder 内通过 globalThis.Element 引用
  // 实现，保留 Node 测试可运行性。源码模式保存按钮的 void persistDraft(
  // { immediate: true }) 行为不变。

  // Claude Code 拆分 bindEvents 时迁出（commit 3，2026-06-25）：
  // 原本的两段 document.click 监听器（格式化按钮 + 外部点击关闭菜单）
  // 移至 apps/web/lib/events/document-click-events.js。
  // 行为不变：选择器、事件名、关闭顺序均保持。
  // Claude Code 拆分 bindEvents 时迁出（commit 4，2026-06-25）：
  // 原本的两段 document.keydown 监听器（Escape 关闭链 + 捕获阶段编辑
  // 器快捷键/表格对话框/查找面板）移至 apps/web/lib/events/document-keyboard-events.js。
  // 关键：第二个监听器 `, true` 捕获阶段已保留。

  // Claude Code 拆分 bindEvents 时迁出（commit 11，2026-06-25）：见上方 comment 块。

  // Claude Code 拆分 bindEvents 时迁出（commit 9，2026-06-25）：
  // 原本的 elements.noteTabs（6 个监听器：click / contextmenu / dragstart
  // / dragover / drop / dragend）和 elements.noteTabMenu（click）共 7 个
  // 监听器移至 apps/web/lib/events/note-tab-events.js。tab 关闭按钮的
  // event.stopPropagation() 保留。

  // （已迁出：elements.editorMenuBar.click，详见 apps/web/lib/events/menu-events.js）

  // Claude Code 拆分 bindEvents 时迁出（commit 10，2026-06-25）：见上文。

  // Claude Code 拆分 bindEvents 时迁出（commit 5，2026-06-25）：
  // 原本的 document.input 监听器（表格对话框字段 + 查找面板字段）移至
  // apps/web/lib/events/document-input-events.js。host 通过 deps 中的
  // getter 注入，保持 live binding。

  // Claude Code 拆分 bindEvents 时迁出（commit 6，2026-06-25）：
  // 原本的 document.click 监听器（表格对话框动作 / 编辑器面板动作 /
  // 全局保存按钮）移至 apps/web/lib/events/document-action-events.js。

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

function renderFolders(...args) {
  return navigationController.renderFolders(...args);
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

function renderEditorMenuBar(...args) {
  return editorController.renderEditorMenuBar(...args);
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

function renderNavSection(...args) {
  return navigationController.renderNavSection(...args);
}

function renderMaterialsTree(...args) {
  return navigationController.renderMaterialsTree(...args);
}

function renderFolderNode(...args) {
  return navigationController.renderFolderNode(...args);
}

function renderNoteNode(...args) {
  return navigationController.renderNoteNode(...args);
}

function renderRecycleNoteNode(...args) {
  return navigationController.renderRecycleNoteNode(...args);
}

function renderInlineEditorRow(...args) {
  return navigationController.renderInlineEditorRow(...args);
}

function renderDeleteIntentRow(...args) {
  return navigationController.renderDeleteIntentRow(...args);
}

function renderEmptyItem(...args) {
  return navigationController.renderEmptyItem(...args);
}

function renderHeaderToggle(...args) {
  return navigationController.renderHeaderToggle(...args);
}

function renderContextMenu(...args) {
  return navigationController.renderContextMenu(...args);
}

function getContextMenuItems(...args) {
  return navigationController.getContextMenuItems(...args);
}

function renderSectionMenu(...args) {
  return navigationController.renderSectionMenu(...args);
}

function renderPreviewPane(...args) {
  return editorController.renderPreviewPane(...args);
}

function renderSourceEditorPane(...args) {
  return editorController.renderSourceEditorPane(...args);
}

function renderSourceEditorView(...args) {
  return editorController.renderSourceEditorView(...args);
}

function renderEditor(...args) {
  return editorController.renderEditor(...args);
}

function syncSourcePreview(...args) {
  return editorController.syncSourcePreview(...args);
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

function renderEditorContextMenu(...args) {
  return editorController.renderEditorContextMenu(...args);
}

function syncEditorContextSubmenuLayout(...args) {
  return editorController.syncEditorContextSubmenuLayout(...args);
}

function openEditorContextMenu(...args) {
  return editorController.openEditorContextMenu(...args);
}

function closeEditorContextMenu(...args) {
  return editorController.closeEditorContextMenu(...args);
}

async function handleEditorContextMenuAction(...args) {
  return editorController.handleEditorContextMenuAction(...args);
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

async function handleFormat(...args) {
  return editorController.handleFormat(...args);
}

function shouldHandleEditorShortcut(...args) {
  return editorController.shouldHandleEditorShortcut(...args);
}

async function handleResolvedEditorShortcut(...args) {
  return editorController.handleResolvedEditorShortcut(...args);
}

async function handleParagraphMenuAction(...args) {
  return editorController.handleParagraphMenuAction(...args);
}

async function handleFormatMenuAction(...args) {
  return editorController.handleFormatMenuAction(...args);
}

async function handleViewMenuAction(...args) {
  return editorController.handleViewMenuAction(...args);
}

async function handleEditMenuAction(...args) {
  return editorController.handleEditMenuAction(...args);
}

async function handleEditorPanelAction(...args) {
  return editorController.handleEditorPanelAction(...args);
}

async function handleContextMenuAction(...args) {
  return navigationController.handleContextMenuAction(...args);
}

function startTreeEditor(...args) {
  return navigationController.startTreeEditor(...args);
}

function cancelTreeEditor(...args) {
  return navigationController.cancelTreeEditor(...args);
}

async function submitTreeEditor(...args) {
  return navigationController.submitTreeEditor(...args);
}

async function commitDelete(...args) {
  return navigationController.commitDelete(...args);
}

async function commitDrop(...args) {
  return navigationController.commitDrop(...args);
}

function resetDragState(...args) {
  return navigationController.resetDragState(...args);
}

function syncDragIndicators(...args) {
  return navigationController.syncDragIndicators(...args);
}

function resolveDropTarget(...args) {
  return navigationController.resolveDropTarget(...args);
}

function canDropOnTarget(...args) {
  return navigationController.canDropOnTarget(...args);
}

function isRootDropActive(...args) {
  return navigationController.isRootDropActive(...args);
}

function clearDeleteIntent(...args) {
  return navigationController.clearDeleteIntent(...args);
}

async function createFolder(...args) {
  return navigationController.createFolder(...args);
}

async function renameFolder(...args) {
  return navigationController.renameFolder(...args);
}

async function deleteFolder(...args) {
  return navigationController.deleteFolder(...args);
}

async function moveFolder(...args) {
  return navigationController.moveFolder(...args);
}

async function createNote(...args) {
  return navigationController.createNote(...args);
}

async function renameNote(...args) {
  return navigationController.renameNote(...args);
}

async function deleteNote(...args) {
  return navigationController.deleteNote(...args);
}

async function permanentlyDeleteNote(...args) {
  return navigationController.permanentlyDeleteNote(...args);
}

async function restoreNote(...args) {
  return navigationController.restoreNote(...args);
}

async function emptyRecycleBin(...args) {
  return navigationController.emptyRecycleBin(...args);
}

async function setNoteFavorite(...args) {
  return navigationController.setNoteFavorite(...args);
}

async function moveNote(...args) {
  return navigationController.moveNote(...args);
}

async function selectFolder(...args) {
  return navigationController.selectFolder(...args);
}

async function selectNote(...args) {
  return navigationController.selectNote(...args);
}

function toggleFolderOpen(...args) {
  return navigationController.toggleFolderOpen(...args);
}

function openFolderBranch(...args) {
  return navigationController.openFolderBranch(...args);
}

function openContextMenu(...args) {
  return navigationController.openContextMenu(...args);
}

function closeContextMenu(...args) {
  return navigationController.closeContextMenu(...args);
}

function closeSectionMenu(...args) {
  return navigationController.closeSectionMenu(...args);
}

function closeEditorMenuBar(...args) {
  return editorController.closeEditorMenuBar(...args);
}

function openEditorPanel(...args) {
  return editorController.openEditorPanel(...args);
}

function closeEditorPanel(...args) {
  return editorController.closeEditorPanel(...args);
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

async function handleFileMenuAction(...args) {
  return editorController.handleFileMenuAction(...args);
}

async function importMarkdownFiles(...args) {
  return editorController.importMarkdownFiles(...args);
}

function getMenuTargetFolderId(...args) {
  return editorController.getMenuTargetFolderId(...args);
}

function getSiblingNames(...args) {
  return editorController.getSiblingNames(...args);
}

async function duplicateCurrentNote(...args) {
  return editorController.duplicateCurrentNote(...args);
}

function exportCurrentNoteAsMarkdown(...args) {
  return editorController.exportCurrentNoteAsMarkdown(...args);
}

function exportCurrentNoteAsPdf(...args) {
  return editorController.exportCurrentNoteAsPdf(...args);
}

function exportCurrentNoteAsPdfStable(...args) {
  return editorController.exportCurrentNoteAsPdfStable(...args);
}

function triggerFileDownload(...args) {
  return editorController.triggerFileDownload(...args);
}

function validateTreeEditorName(...args) {
  return navigationController.validateTreeEditorName(...args);
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

function focusInlineEditor(...args) {
  return navigationController.focusInlineEditor(...args);
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

async function teardownEditorHost(...args) {
  return editorController.teardownEditorHost(...args);
}

function mountEditorHost(...args) {
  return editorController.mountEditorHost(...args);
}

function syncEditorContextMenuPosition(...args) {
  return editorController.syncEditorContextMenuPosition(...args);
}

function handleEditorMarkdownChange(...args) {
  return editorController.handleEditorMarkdownChange(...args);
}

function renderEditorSaveIndicator(...args) {
  return editorController.renderEditorSaveIndicator(...args);
}

function renderEditorPanel(...args) {
  return editorController.renderEditorPanel(...args);
}

function openTableInsertDialog(...args) {
  return editorController.openTableInsertDialog(...args);
}

function closeTableInsertDialog(...args) {
  return editorController.closeTableInsertDialog(...args);
}

async function submitTableInsertDialog(...args) {
  return editorController.submitTableInsertDialog(...args);
}

function renderTableInsertDialog(...args) {
  return editorController.renderTableInsertDialog(...args);
}

function scheduleAutosave(...args) {
  return editorController.scheduleAutosave(...args);
}

async function persistDraft(...args) {
  return editorController.persistDraft(...args);
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

function getDirectNotesForFolder(...args) {
  return navigationController.getDirectNotesForFolder(...args);
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

function isCreateEditorForParent(...args) {
  return navigationController.isCreateEditorForParent(...args);
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
  void editorRuntime.currentEditorHost?.setKnowledgePointSources(getCurrentKnowledgePointSources());
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
  if (!editorRuntime.currentEditorHost) {
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

  const selected = await editorRuntime.currentEditorHost.selectKnowledgePointSource(sourceId);
  flashStatus(selected ? '已定位到正文片段' : '未能在正文中定位该片段');
}

async function createKnowledgePointFromCurrentSelection(note) {
  if (!editorRuntime.currentEditorHost) {
    flashStatus('编辑器尚未就绪');
    return;
  }

  const selection = await editorRuntime.currentEditorHost.getSelectionSnapshot();
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
  if (!note || !editorRuntime.currentEditorHost) {
    flashStatus('请先打开笔记并选中正文片段');
    return;
  }

  const selection = await editorRuntime.currentEditorHost.getSelectionSnapshot();
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





