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
  buildExportFileName,
  createDuplicateTitle,
  createUntitledName
} from '../lib/editor/file-menu.js';
import {
  applyEditorPanelMatchResult,
  createOpenedEditorPanelState
} from '../lib/editor/editor-panel-state.js';
import { resolveEditorPanelKeyboardAction } from '../lib/editor/find-navigation.js';
import {
  captureScrollPosition,
  getSavedScrollTop,
  readScrollPositions,
  writeScrollPositions
} from '../lib/editor/scroll-positions.js';
import { extractMarkdownHeadings, renderMarkdownPreview } from '../lib/markdown.js';
import { validateSiblingName } from '../lib/tree-name-validation.js';
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
import { buildMockWorkspaceState } from '../lib/mock-workspace.js';
import {
  deleteFolder as deleteLocalFolderTree,
  flattenFolderTree,
  insertFolder as insertLocalFolder,
  insertNote as insertLocalNote,
  moveFolder as moveLocalFolderTree,
  moveNote as moveLocalNoteEntry,
  renameFolder as renameLocalFolderTree,
  renameNote as renameLocalNoteEntry,
  resolveNoteVisualType
} from '../lib/tree-workspace.js';
import {
  getEditorShortcutLabel,
  resolveEditorShortcutAction
} from '../lib/editor/shortcut-actions.js';
import { renderKnowledgePointPanel } from '../lib/knowledge-points/panel.js';
import {
  buildKnowledgePointInputFromSelection,
  buildKnowledgePointSourceInputFromSelection
} from '../lib/knowledge-points/selection.js';
import {
  buildCurrentNoteKnowledgePointSources,
  insertKnowledgePointCollections,
  removeKnowledgePointCollections,
  replaceKnowledgePointCollections,
  syncKnowledgePointMembershipCollections
} from '../lib/knowledge-points/state.js';
import {
  buildUniqueTagId,
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
import { createClearedNoteSideData } from '../lib/sidebar/state.js';
import {
  renderAiTab,
  renderAsideEmptyInline,
  renderAsideEmptyState
} from '../lib/sidebar/renderers.js';
import { renderInfoTab as renderInfoTabMarkup } from '../lib/sidebar/info-panel.js';
import { renderOutlineTab as renderOutlineTabMarkup } from '../lib/sidebar/outline-panel.js';
import {
  openFolderBranch as expandFolderBranch,
  resolveFolderSelection,
  resolveNavigationSelection,
  toggleFolderOpen as toggleOpenFolderState
} from '../lib/navigation/selection.js';
import { knowledgeApi } from './services/knowledge-api.js';

const BACKEND_CACHE_KEY = 'study-accelerator.backend-workspace-cache';
const AUTOSAVE_DELAY_MS = 700;

const ASIDE_TABS = [
  { key: 'info', label: '信息' },
  { key: 'outline', label: '大纲' },
  { key: 'concepts', label: '知识点' },
  { key: 'ai', label: 'AI' }
];

const editorContextPrimaryActions = ['cut', 'copy', 'paste', 'delete'];
const editorContextFormatActions = ['bold', 'italic', 'highlight', 'codeblock', 'quote'];
const editorContextListActions = ['ordered', 'bullet', 'task-list'];
const editorContextIndentActions = ['outdent', 'indent'];
const editorContextParagraphItems = [
  'paragraph',
  'heading-1',
  'heading-2',
  'heading-3',
  'heading-4',
  'heading-5',
  'heading-6'
];
const editorContextInsertItems = [
  'create-knowledge-point',
  'table',
  'hr',
  'image',
  'codeblock',
  'quote',
  'paragraph-above',
  'paragraph-below'
];
const editorContextActionMeta = {
  cut: { label: '剪切', icon: 'cut' },
  copy: { label: '复制', icon: 'copy' },
  paste: { label: '粘贴', icon: 'paste' },
  delete: { label: '删除', icon: 'delete' },
  bold: { label: '加粗', icon: 'bold' },
  italic: { label: '斜体', icon: 'italic' },
  highlight: { label: '高亮', icon: 'highlight' },
  codeblock: { label: '代码块', icon: 'codeblock' },
  quote: { label: '引用', icon: 'quote' },
  ordered: { label: '有序列表', icon: 'ordered' },
  bullet: { label: '无序列表', icon: 'bullet' },
  'task-list': { label: '任务列表', icon: 'task-list' },
  outdent: { label: '减少缩进', icon: 'outdent' },
  indent: { label: '增加缩进', icon: 'indent' },
  paragraph: { label: '段落' },
  'heading-1': { label: 'H1' },
  'heading-2': { label: 'H2' },
  'heading-3': { label: 'H3' },
  'heading-4': { label: 'H4' },
  'heading-5': { label: 'H5' },
  'heading-6': { label: 'H6' },
  table: { label: '表格', icon: 'table' },
  'create-knowledge-point': { label: '创建知识点' },
  hr: { label: '水平分割线' },
  'paragraph-above': { label: '段落（上方）' },
  'paragraph-below': { label: '段落（下方）' },
  image: { label: '图片' }
};

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

const formatButtons = [
  // 插入
  { key: 'image', label: '图片' },
  { key: 'internal-link', label: '内部链接' },
  { key: 'separator' },
  // 文字格式
  { key: 'bold', label: '加粗' },
  { key: 'italic', label: '斜体' },
  { key: 'strikethrough', label: '删除线' },
  { key: 'code', label: '行内代码' },
  { key: 'highlight', label: '高亮' }
];

const editMenuItems = [
  { key: 'undo', label: '撤销' },
  { key: 'redo', label: '重做' },
  { key: 'separator' },
  { key: 'cut', label: '剪切' },
  { key: 'copy', label: '复制' },
  { key: 'paste', label: '粘贴' },
  { key: 'separator' },
  { key: 'find', label: '查找' },
  { key: 'replace', label: '替换' },
  { key: 'select-all', label: '全选' }
];


const paragraphMenuItems = [
  { key: 'paragraph', label: '正文' },
  { key: 'heading-1', label: 'H1' },
  { key: 'heading-2', label: 'H2' },
  { key: 'heading-3', label: 'H3' },
  { key: 'heading-4', label: 'H4' },
  { key: 'heading-5', label: 'H5' },
  { key: 'heading-6', label: 'H6' },
  { key: 'separator' },
  { key: 'bullet', label: '无序列表' },
  { key: 'ordered', label: '有序列表' },
  { key: 'task-list', label: '任务列表' },
  { key: 'separator' },
  { key: 'quote', label: '引用块' },
  { key: 'codeblock', label: '代码块' },
  { key: 'hr', label: '分割线' },
  { key: 'table', label: '表格' }
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
  elements.globalSearchShell?.addEventListener('click', (event) => {
    event.stopPropagation();
    const chipRemoveButton = event.target.closest('[data-search-chip-remove]');
    if (chipRemoveButton?.dataset.searchChipRemove) {
        toggleSearchTagFilter(chipRemoveButton.dataset.searchChipRemove);
        focusSearchInput();
        return;
    }

    const tagButton = event.target.closest('[data-search-tag-id]');
    if (tagButton?.dataset.searchTagId) {
        toggleSearchTagFilter(tagButton.dataset.searchTagId);
        focusSearchInput();
        return;
    }

    const noteButton = event.target.closest('[data-search-note-id]');
    if (noteButton?.dataset.searchNoteId) {
        state.search.isOpen = false;
        void selectNote(noteButton.dataset.searchNoteId, { syncFolder: true });
        return;
    }

    const clearButton = event.target.closest('[data-search-clear]');
    if (clearButton) {
        clearSearchFilters();
        return;
    }

    if (!state.search.isOpen) {
      state.search.isOpen = true;
      renderSearchShell();
    }

    focusSearchInput();
  });

  elements.globalSearchShell?.addEventListener('input', (event) => {
    const input = event.target.closest('[data-search-input]');
    if (!input) {
      return;
    }

    state.search.keyword = input.value.trim().toLowerCase();
    state.search.isOpen = true;
    reconcileSelection();
    renderAll();
  });

  elements.globalSearchShell?.addEventListener('keydown', (event) => {
    const input = event.target.closest('[data-search-input]');
    if (!input) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      state.search.isOpen = false;
      renderSearchShell();
      return;
    }

    if (event.key !== 'Enter') {
      return;
    }

    const results = getSearchResultNotes();
    if (!results.length) {
      return;
    }

    event.preventDefault();
    state.search.isOpen = false;
    void selectNote(results[0].id, { syncFolder: true });
  });

  elements.secondaryNavToggle?.addEventListener('click', (event) => {
    event.stopPropagation();
    state.sectionMenuOpen = !state.sectionMenuOpen;
    closeContextMenu();
    renderFolders();
  });

  elements.markdownImportInput?.addEventListener('change', async (event) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';

    if (!files.length) {
      return;
    }

    try {
      await importMarkdownFiles(files);
    } catch (error) {
      flashStatus(error?.message || 'Markdown 导入失败');
    }
  });

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

  document.addEventListener('click', (event) => {
    const formatButton = event.target.closest('[data-format]');
    if (!formatButton) {
      return;
    }
    void handleFormat(formatButton.dataset.format);
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('#global-search-shell') && state.search.isOpen) {
      state.search.isOpen = false;
      renderSearchShell();
    }
    if (event.target.closest('#library-context-menu')) return;
    if (event.target.closest('#library-section-menu')) return;
    if (event.target.closest('#note-tab-menu')) return;
    if (event.target.closest('#editor-menu-bar')) return;
    if (event.target.closest('#editor-context-menu')) return;
    if (event.target.closest('#editor-table-dialog')) return;
    if (event.target.closest('#secondary-nav-toggle')) return;
    closeContextMenu();
    closeSectionMenu();
    closeTabMenu();
    closeEditorMenuBar();
    closeEditorContextMenu();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (state.search.isOpen) {
        state.search.isOpen = false;
        renderSearchShell();
      }
      closeContextMenu();
      closeSectionMenu();
      closeTabMenu();
      closeEditorMenuBar();
      closeEditorContextMenu();
      closeTableInsertDialog();
    }
  });

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

  document.addEventListener('input', (event) => {
    const tableDialog = event.target.closest?.('#editor-table-dialog');
    if (tableDialog) {
      const target = event.target;
      if (target?.dataset?.tableDialogField === 'rows') {
        state.editorTableDialog.rows = target.value;
      } else if (target?.dataset?.tableDialogField === 'cols') {
        state.editorTableDialog.cols = target.value;
      }
      return;
    }

    const panel = event.target.closest?.('#editor-utility-panel');
    if (!panel) {
      return;
    }

    const target = event.target;
    if (!target?.dataset?.panelField) {
      return;
    }

    if (target.dataset.panelField === 'query') {
      state.editorPanel.query = target.value;
      state.editorPanel.matchIndex = -1;
      state.editorPanel.matchCount = 0;
      void currentEditorHost?.clearSearchHighlights();
    } else if (target.dataset.panelField === 'replacement') {
      state.editorPanel.replacement = target.value;
    }
  });

  document.addEventListener('keydown', (event) => {
    const tableDialog = event.target.closest?.('#editor-table-dialog');
    if (tableDialog && state.editorTableDialog.open) {
      if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        void submitTableInsertDialog();
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeTableInsertDialog();
        return;
      }
    }

    if (state.editorPanel.open && state.editorPanel.mode === 'find') {
      const action = resolveEditorPanelKeyboardAction(event);
      if (action) {
        event.preventDefault();
        event.stopPropagation();
        void handleEditorPanelAction(action === 'previous' ? 'submit-previous' : 'submit');
        return;
      }
    }

    const shortcutAction = resolveEditorShortcutAction(event);
    if (shortcutAction && shouldHandleEditorShortcut(event)) {
      event.preventDefault();
      event.stopPropagation();
      void handleResolvedEditorShortcut(shortcutAction);
      return;
    }

    if (event.key === 'Escape') {
      closeEditorPanel();
    }
  }, true);

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

  const note = state.allNotes.find((item) => item.id === noteId);
  state.linkedNotes = (note?.internalLinks ?? [])
    .map((linkedId) => state.allNotes.find((item) => item.id === linkedId))
    .filter(Boolean);
  state.attachments = knowledgeBaseSeed.attachments.filter((attachment) => attachment.noteId === noteId);
  state.knowledgePoints = [];
  state.allKnowledgePoints = [];
  state.knowledgePointTagGroups = [];
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

  elements.moduleRail.innerHTML = railItems
    .map(
      (item) => `
        <button
          type="button"
          class="rail-item"
          data-active="${item.active}"
          aria-label="${getRailLabel(item.key)}"
          title="${getRailLabel(item.key)}"
        >
          <span class="rail-item-icon" aria-hidden="true">${renderRailIcon(item.key)}</span>
          <span class="rail-item-label">${getRailLabel(item.key)}</span>
        </button>
      `
    )
    .join('');
}

function getRailLabel(key) {
  switch (key) {
    case 'knowledge':
      return '知识库';
    case 'paper':
      return '题库';
    case 'ai':
      return 'AI 工作台';
    case 'task':
      return '任务';
    case 'review':
      return '复盘';
    case 'settings':
      return '设置';
    default:
      return key;
  }
}

function renderRailIcon(key) {
  switch (key) {
    case 'knowledge':
      return `
        <svg viewBox="0 0 24 24">
          <path d="M4.5 5.5h6a3 3 0 0 1 3 3v10h-6a3 3 0 0 0-3 3z"></path>
          <path d="M19.5 5.5h-6a3 3 0 0 0-3 3v10h6a3 3 0 0 1 3 3z"></path>
        </svg>
      `;
    case 'paper':
      return `
        <svg viewBox="0 0 24 24">
          <path d="M7 4.5h7l4 4v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2z"></path>
          <path d="M14 4.5v4h4"></path>
          <path d="M8.5 12h7"></path>
          <path d="M8.5 15.5h7"></path>
        </svg>
      `;
    case 'ai':
      return `
        <svg viewBox="0 0 24 24">
          <path d="M12 3.5l1.8 4.2L18 9.5l-4.2 1.8L12 15.5l-1.8-4.2L6 9.5l4.2-1.8z"></path>
          <path d="M18.5 14.5l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8z"></path>
          <path d="M6 15.5l1 2.2 2.2 1-2.2 1-1 2.3-1-2.3-2.2-1 2.2-1z"></path>
        </svg>
      `;
    case 'task':
      return `
        <svg viewBox="0 0 24 24">
          <path d="M9 6.5h10"></path>
          <path d="M9 12h10"></path>
          <path d="M9 17.5h10"></path>
          <path d="M5.5 6.5h.01"></path>
          <path d="M5.5 12h.01"></path>
          <path d="M5.5 17.5h.01"></path>
        </svg>
      `;
    case 'review':
      return `
        <svg viewBox="0 0 24 24">
          <path d="M12 5.5v13"></path>
          <path d="M5.5 12h13"></path>
          <path d="M7.5 7.5l9 9"></path>
          <path d="M16.5 7.5l-9 9"></path>
        </svg>
      `;
    case 'settings':
      return `
        <svg viewBox="0 0 24 24">
          <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z"></path>
          <path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a7.3 7.3 0 0 0-1.7-1l-.4-2.6H9.6l-.4 2.6a7.3 7.3 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a7.3 7.3 0 0 0 1.7 1l.4 2.6h4.8l.4-2.6a7.3 7.3 0 0 0 1.7-1l2.4 1 2-3.4-2-1.5c.07-.33.1-.67.1-1z"></path>
        </svg>
      `;
    default:
      return `<span>${key}</span>`;
  }
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
    elements.globalSearchShell.innerHTML = `
      <div class="top-bar-search-control" data-open="false">
        <span class="top-bar-search-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="6"></circle>
            <path d="M16 16l4 4"></path>
          </svg>
        </span>
        <div class="top-search-chip-track" data-search-chip-track></div>
        <input
          id="global-search"
          data-search-input
          type="text"
          placeholder="搜索笔记、标签、附件、AI 结果"
          autocomplete="off"
          spellcheck="false"
        />
        <button type="button" class="top-search-clear" data-search-clear hidden>清空</button>
      </div>
      <div class="search-panel-host"></div>
    `;
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
  return {
    mode: state.view.mode,
    showLeftSidebar: state.view.mode === 'focus' ? false : state.view.showLeftSidebar,
    showRightSidebar: state.view.mode === 'focus' ? false : state.view.showRightSidebar,
    showSourceEditor: state.view.showSourceEditor
  };
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
    elements.noteTabs.innerHTML = `
      <div class="note-tabs-empty">
        <span class="note-tabs-empty-label">No open notes</span>
      </div>
    `;
    renderTabMenu();
    return;
  }

  elements.noteTabs.innerHTML = openNotes
    .map((note) => {
      const isActive = note.id === state.selectedNoteId;
      const isDirty = isActive && ['pending', 'saving', 'error'].includes(state.saveState);
      const isDragging = state.tabDragState.activeId === note.id;
      const isDropTarget = state.tabDragState.overId === note.id;
      return `
        <button
          type="button"
          class="note-tab"
          data-tab-note-id="${note.id}"
          data-active="${isActive}"
          data-dirty="${isDirty}"
          data-dragging="${isDragging}"
          data-drop-target="${isDropTarget}"
          title="${escapeAttribute(buildNoteTabPath(note, state.foldersById))}"
          draggable="true"
        >
          <span class="note-tab-label">${escapeHtml(note.title)}</span>
          <span class="note-tab-dirty">${isDirty ? '●' : ''}</span>
          <span class="note-tab-close" data-tab-close="${note.id}" aria-label="Close tab" title="Close tab">×</span>
        </button>
      `;
    })
    .join('');

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
  const fileMenuOpen = state.editorMenuOpen === 'file';
  const paragraphMenuOpen = state.editorMenuOpen === 'paragraph';
  const editMenuOpen = state.editorMenuOpen === 'edit';
  const formatMenuOpen = state.editorMenuOpen === 'format';
  const viewMenuOpen = state.editorMenuOpen === 'view';

  elements.editorMenuBar.innerHTML = `
    <div class="editor-menu-shell">
      <div class="editor-menu-group">
        <button
          type="button"
          class="editor-menu-text"
          data-editor-menu-toggle="file"
          data-open="${fileMenuOpen}"
        >
          文件
        </button>
        ${fileMenuOpen ? renderFileMenu(note) : ''}
      </div>
      <div class="editor-menu-group">
        <button
          type="button"
          class="editor-menu-text"
          data-editor-menu-toggle="paragraph"
          data-open="${paragraphMenuOpen}"
        >
          段落
        </button>
        ${paragraphMenuOpen ? renderParagraphMenu(note) : ''}
      </div>
      <div class="editor-menu-group">
        <button
          type="button"
          class="editor-menu-text"
          data-editor-menu-toggle="edit"
          data-open="${editMenuOpen}"
        >
          编辑
        </button>
        ${editMenuOpen ? renderEditMenu(note) : ''}
      </div>
      <div class="editor-menu-group">
        <button
          type="button"
          class="editor-menu-text"
          data-editor-menu-toggle="format"
          data-open="${formatMenuOpen}"
        >
          格式
        </button>
        ${formatMenuOpen ? renderFormatMenu(note) : ''}
      </div>
      <div class="editor-menu-group">
        <button
          type="button"
          class="editor-menu-text"
          data-editor-menu-toggle="view"
          data-open="${viewMenuOpen}"
        >
          视图
        </button>
        ${viewMenuOpen ? renderViewMenu(note, effectiveView) : ''}
      </div>
    </div>
  `;
}

function renderEditMenu(note) {
  const hasNote = Boolean(note);

  return `
    <div class="editor-menu-popover" data-editor-menu="edit">
      ${editMenuItems
        .map((item) => {
          if (item.key === 'separator') {
            return '<div class="editor-menu-divider" aria-hidden="true"></div>';
          }

          return renderEditorMenuItem({
            actionAttr: 'data-edit-menu-action',
            actionKey: item.key,
            disabled: !hasNote,
            label: item.label
          });
        })
        .join('')}
    </div>
  `;
}


function renderParagraphMenu(note) {
  const hasNote = Boolean(note);

  return `
    <div class="editor-menu-popover" data-editor-menu="paragraph">
      ${paragraphMenuItems
        .map((item) => {
          if (item.key === 'separator') {
            return '<div class="editor-menu-divider" aria-hidden="true"></div>';
          }

          return renderEditorMenuItem({
            actionAttr: 'data-paragraph-menu-action',
            actionKey: item.key,
            disabled: !hasNote,
            label: item.label
          });
        })
        .join('')}
    </div>
  `;
}

function renderFormatMenu(note) {
  const hasNote = Boolean(note);

  return `
    <div class="editor-menu-popover" data-editor-menu="format">
      ${formatButtons
        .map((item) => {
          if (item.key === 'separator') {
            return '<div class="editor-menu-divider" aria-hidden="true"></div>';
          }

          return renderEditorMenuItem({
            actionAttr: 'data-format-menu-action',
            actionKey: item.key,
            disabled: !hasNote,
            label: item.label
          });
        })
        .join('')}
    </div>
  `;
}

function renderEditorMenuItem({
  actionAttr,
  actionKey,
  disabled = false,
  label
}) {
  const shortcut = getEditorShortcutLabel(actionKey);
  return `
    <button type="button" class="editor-menu-item" ${actionAttr}="${actionKey}" ${disabled ? 'disabled' : ''}>
      <span class="editor-menu-item-label">${escapeHtml(label)}</span>
      ${shortcut ? `<span class="editor-menu-shortcut">${escapeHtml(shortcut)}</span>` : ''}
    </button>
  `;
}

function renderViewMenu(note, effectiveView) {
  const hasNote = Boolean(note);
  const hasEditableNote = Boolean(note && !note.deleted);

  return `
    <div class="editor-menu-popover" data-editor-menu="view">
      <button type="button" class="editor-menu-item" data-view-menu-action="mode-read" data-active="${effectiveView.mode === 'read'}">阅读模式</button>
      <button type="button" class="editor-menu-item" data-view-menu-action="mode-edit" data-active="${effectiveView.mode === 'edit'}">编辑模式</button>
      <button type="button" class="editor-menu-item" data-view-menu-action="mode-focus" data-active="${effectiveView.mode === 'focus'}">专注模式</button>
      <div class="editor-menu-divider" aria-hidden="true"></div>
      <button type="button" class="editor-menu-item" data-view-menu-action="toggle-left-sidebar" data-active="${effectiveView.showLeftSidebar}">${effectiveView.showLeftSidebar ? '隐藏左侧目录区' : '显示左侧目录区'}</button>
      <button type="button" class="editor-menu-item" data-view-menu-action="toggle-right-sidebar" data-active="${effectiveView.showRightSidebar}">${effectiveView.showRightSidebar ? '隐藏右侧辅助区' : '显示右侧辅助区'}</button>
      <button type="button" class="editor-menu-item" data-view-menu-action="toggle-source-editor" data-active="${effectiveView.showSourceEditor}" ${hasEditableNote ? '' : 'disabled'}>${effectiveView.showSourceEditor ? '隐藏源码编辑器' : '显示源码编辑器'}</button>
    </div>
  `;
}

function renderFileMenu(note) {
  const hasNote = Boolean(note);
  const hasEditableNote = Boolean(note && !note.deleted);
  const isDeletedNote = Boolean(note?.deleted);

  return `
    <div class="editor-menu-popover" data-editor-menu="file">
      <button type="button" class="editor-menu-item" data-file-menu-action="new-note">新建笔记</button>
      <button type="button" class="editor-menu-item" data-file-menu-action="new-folder">新建文件夹</button>
      <button type="button" class="editor-menu-item" data-file-menu-action="import-markdown">导入 Markdown</button>
      <div class="editor-menu-divider" aria-hidden="true"></div>
      <button type="button" class="editor-menu-item" data-file-menu-action="save" ${hasEditableNote ? '' : 'disabled'}>保存</button>
      <button type="button" class="editor-menu-item" data-file-menu-action="save-as" ${hasEditableNote ? '' : 'disabled'}>另存为</button>
      <button type="button" class="editor-menu-item" data-file-menu-action="rename" ${hasEditableNote ? '' : 'disabled'}>重命名</button>
      ${isDeletedNote
        ? '<button type="button" class="editor-menu-item" data-file-menu-action="restore-note">恢复笔记</button>'
        : hasEditableNote
          ? `
            <button type="button" class="editor-menu-item" data-file-menu-action="favorite-note">${note.favorite ? '取消收藏' : '收藏笔记'}</button>
            <button type="button" class="editor-menu-item" data-file-menu-action="delete-note">删除</button>
          `
          : ''}
      <div class="editor-menu-divider" aria-hidden="true"></div>
      <button type="button" class="editor-menu-item" data-file-menu-action="export-markdown" ${hasEditableNote ? '' : 'disabled'}>导出 Markdown</button>
      <button type="button" class="editor-menu-item" data-file-menu-action="export-pdf" ${hasEditableNote ? '' : 'disabled'}>导出</button>
    </div>
  `;
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
  elements.noteTabMenu.innerHTML = `
    <button type="button" class="note-tab-menu-item" data-tab-menu-action="close">关闭</button>
    <button type="button" class="note-tab-menu-item" data-tab-menu-action="close-others">关闭其他</button>
    <div class="note-tab-menu-divider" aria-hidden="true"></div>
    <button type="button" class="note-tab-menu-item" data-tab-menu-action="copy-path">复制路径</button>
  `;
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

  return `
    <section class="preview-pane preview-frame">
      <div class="pane-body">
        ${headings.length ? `
          <div class="toc-list" data-preview-toc>
            ${headings.map((heading) => `<a class="toc-item" data-level="${heading.level}" href="#${escapeAttribute(heading.id)}">${escapeHtml(heading.title)}</a>`).join('')}
          </div>
        ` : ''}
        <article class="preview-rendered" data-preview-content>${previewHtml}</article>
      </div>
    </section>
  `;
}

function renderSourceEditorPane() {
  return `
    <section class="editor-pane">
      <div class="pane-body pane-body-editor">
        <div class="source-toolbar">
          <span class="editor-save-indicator" id="editor-save-indicator"></span>
          <button type="button" class="subtle-button editor-save-button" data-source-save>保存源码</button>
        </div>
        <textarea class="markdown-input" data-source-editor-input spellcheck="false" aria-label="Markdown 源码编辑器">${escapeHtml(state.draftMarkdown)}</textarea>
      </div>
    </section>
  `;
}

function renderSourceEditorView() {
  return `
    <section class="editor-pane">
      <div class="pane-body pane-body-editor">
        <div class="source-toolbar">
          <span class="editor-save-indicator" id="editor-save-indicator"></span>
          <button type="button" class="subtle-button editor-save-button" data-source-save>保存源码</button>
        </div>
        <textarea class="markdown-input" data-source-editor-input spellcheck="false" aria-label="Markdown source editor">${escapeHtml(state.draftMarkdown)}</textarea>
      </div>
    </section>
  `;
}

function renderEditor(note) {
  if (!elements.editorContent) {
    return;
  }

  const effectiveView = getEffectiveViewState();

  if (!note) {
    void teardownEditorHost();
    state.editorTableDialog.open = false;
    elements.editorContent.dataset.sourceOpen = 'false';
    elements.editorContent.dataset.viewMode = effectiveView.mode;
    elements.editorContent.innerHTML = renderPreviewPane('');
    return;
  }

  if (note.deleted) {
    void teardownEditorHost();
    state.editorTableDialog.open = false;
    elements.editorContent.dataset.sourceOpen = 'false';
    elements.editorContent.dataset.viewMode = 'recycle';
    elements.editorContent.innerHTML = renderPreviewPane(note.rawMarkdown || '');
    return;
  }

  const shouldUseRichEditor = effectiveView.mode !== 'read' && !effectiveView.showSourceEditor;

  if (shouldUseRichEditor && currentEditorHost && currentEditorNoteId === note.id) {
    elements.editorContent.dataset.sourceOpen = 'false';
    elements.editorContent.dataset.viewMode = effectiveView.mode;
    renderEditorSaveIndicator();
    renderEditorPanel();
    renderTableInsertDialog();
    return;
  }

  const markdown = state.draftMarkdown || note.rawMarkdown || '';
  elements.editorContent.dataset.sourceOpen = String(effectiveView.showSourceEditor);
  elements.editorContent.dataset.viewMode = effectiveView.mode;

  if (!shouldUseRichEditor) {
    void teardownEditorHost();
    state.editorTableDialog.open = false;
    elements.editorContent.innerHTML = effectiveView.showSourceEditor
      ? `${renderSourceEditorView()}${renderPreviewPane(markdown)}`
      : renderPreviewPane(markdown);
    renderEditorSaveIndicator();
    return;
  }

  elements.editorContent.dataset.sourceOpen = 'false';
  elements.editorContent.innerHTML = `
    <section class="editor-pane editor-pane-single">
      <div class="pane-body">
        <div class="editor-utility-panel" id="editor-utility-panel" hidden></div>
        <div class="editor-table-dialog" id="editor-table-dialog" hidden></div>
        <div class="milkdown-host" id="milkdown-editor"></div>
      </div>
    </section>
  `;

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

  elements.asideTabs.innerHTML = ASIDE_TABS
    .map(
      (tab) => `
        <button
          type="button"
          class="aside-tab"
          data-aside-tab="${tab.key}"
          data-active="${String(state.asideTab === tab.key)}"
        >${escapeHtml(tab.label)}</button>
      `
    )
    .join('');

  if (!note) {
    elements.asideContent.innerHTML = renderAsideEmptyState();
    return;
  }

  switch (state.asideTab) {
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
    folderPath: buildFolderPath(note.folderId),
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
  elements.editorContextMenu.innerHTML = `
    <div class="editor-context-panel">
      <div class="editor-context-action-row editor-context-action-row-primary">
        ${editorContextPrimaryActions.map((action) => renderEditorContextIconButton(action)).join('')}
      </div>
      <div class="editor-context-action-row">
        ${editorContextFormatActions.map((action) => renderEditorContextIconButton(action)).join('')}
      </div>
      <div class="editor-context-action-row editor-context-action-row-compact">
        ${editorContextListActions.map((action) => renderEditorContextIconButton(action)).join('')}
      </div>
      <div class="editor-context-action-row editor-context-action-row-compact">
        ${editorContextIndentActions.map((action) => renderEditorContextIconButton(action)).join('')}
      </div>
      <div class="editor-context-divider" aria-hidden="true"></div>
      <div class="editor-context-submenu-group">
        <button type="button" class="editor-context-submenu-trigger">
          <span>标题</span>
          <span class="editor-context-submenu-caret">▶</span>
        </button>
        <div class="editor-context-submenu">
          ${editorContextParagraphItems.map((action) => renderEditorContextMenuItem(action)).join('')}
        </div>
      </div>
      <div class="editor-context-submenu-group">
        <button type="button" class="editor-context-submenu-trigger">
          <span>插入</span>
          <span class="editor-context-submenu-caret">▶</span>
        </button>
        <div class="editor-context-submenu">
          ${editorContextInsertItems.map((action) => renderEditorContextMenuItem(action)).join('')}
        </div>
      </div>
    </div>
  `;
  syncEditorContextMenuPosition();
  syncEditorContextSubmenuLayout();
}

function renderEditorContextIconButton(action) {
  const meta = editorContextActionMeta[action];
  if (!meta) {
    return '';
  }

  return `
    <button
      type="button"
      class="editor-context-icon-button"
      data-editor-context-action="${action}"
      title="${escapeAttribute(meta.label)}"
      aria-label="${escapeAttribute(meta.label)}"
    >
      ${renderEditorContextIconSvg(meta.icon)}
    </button>
  `;
}

function renderEditorContextMenuItem(action) {
  const meta = editorContextActionMeta[action];
  if (!meta) {
    return '';
  }

  const shortcut = getEditorShortcutLabel(action);
  return `
    <button type="button" class="editor-context-menu-item" data-editor-context-action="${action}">
      <span>${escapeHtml(meta.label)}</span>
      ${shortcut ? `<span class="editor-context-shortcut">${escapeHtml(shortcut)}</span>` : ''}
    </button>
  `;
}

function renderEditorContextIcon(icon) {
  return renderEditorContextIconSvg(icon);
}


function renderEditorContextIconSvg(icon) {
  const strokeAttrs = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
  let content = '';
  switch (icon) {
    case 'cut':
      content = `
        <circle cx="8" cy="16" r="2.2" ${strokeAttrs}></circle>
        <circle cx="16" cy="16" r="2.2" ${strokeAttrs}></circle>
        <path d="M9.8 14.4 18 6.2" ${strokeAttrs}></path>
        <path d="M14.2 14.4 6 6.2" ${strokeAttrs}></path>
      `;
      break;
    case 'copy':
      content = `
        <rect x="8" y="7" width="9" height="11" rx="2.2" ${strokeAttrs}></rect>
        <path d="M6.5 15.5H6A2 2 0 0 1 4 13.5V6a2 2 0 0 1 2-2h7.5" ${strokeAttrs}></path>
      `;
      break;
    case 'paste':
      content = `
        <rect x="6.5" y="6.5" width="11" height="13" rx="2.2" ${strokeAttrs}></rect>
        <path d="M9 6V4.8A1.8 1.8 0 0 1 10.8 3h2.4A1.8 1.8 0 0 1 15 4.8V6" ${strokeAttrs}></path>
        <path d="M9 10h6M9 13h6M9 16h4.5" ${strokeAttrs}></path>
      `;
      break;
    case 'delete':
      content = `
        <path d="M6.5 7.5h11" ${strokeAttrs}></path>
        <path d="M8.2 7.5V6A2 2 0 0 1 10.2 4h3.6a2 2 0 0 1 2 2v1.5" ${strokeAttrs}></path>
        <path d="M8.5 7.5 9 18a2 2 0 0 0 2 1.9h2a2 2 0 0 0 2-1.9l.5-10.5" ${strokeAttrs}></path>
      `;
      break;
    case 'bold':
      content = `
        <path d="M8 5.5h4.5a3.2 3.2 0 1 1 0 6.4H8z" ${strokeAttrs}></path>
        <path d="M8 11.9h5.3a3.4 3.4 0 1 1 0 6.8H8z" ${strokeAttrs}></path>
      `;
      break;
    case 'italic':
      content = `
        <path d="M13.8 5.5h-4.4M14.6 18.5h-4.4M12.3 5.5 9.7 18.5" ${strokeAttrs}></path>
      `;
      break;
    case 'highlight':
      content = `
        <path d="M5 17.5h6M9 16.2 16 9.2l2.8 2.8-7 7z" ${strokeAttrs}></path>
        <path d="M13.5 6.5 16.5 9l1.5-1.5a1.6 1.6 0 0 0 0-2.3l-1.2-1.2a1.6 1.6 0 0 0-2.3 0z" ${strokeAttrs}></path>
      `;
      break;
    case 'codeblock':
      content = `
        <path d="M9.2 8.2 5.5 12l3.7 3.8M14.8 8.2 18.5 12l-3.7 3.8M12.9 7 11.1 17" ${strokeAttrs}></path>
      `;
      break;
    case 'quote':
      content = `
        <path d="M7.8 10.2h3.4v3.1a3.2 3.2 0 0 1-3.2 3.2H7v-2.1h.6a1.1 1.1 0 0 0 1.1-1.1v-.8H7.8z" ${strokeAttrs}></path>
        <path d="M13.5 10.2h3.4v3.1a3.2 3.2 0 0 1-3.2 3.2h-1v-2.1h.6a1.1 1.1 0 0 0 1.1-1.1v-.8h-.9z" ${strokeAttrs}></path>
      `;
      break;
    case 'table':
      content = `
        <rect x="4.5" y="5.5" width="15" height="13" rx="1.8" ${strokeAttrs}></rect>
        <path d="M9.5 5.8v12.4M14.5 5.8v12.4M4.8 10h14.4M4.8 14h14.4" ${strokeAttrs}></path>
      `;
      break;
    case 'ordered':
      content = `
        <path d="M9.5 7.5h8M9.5 12h8M9.5 16.5h8M5.8 8.2V6.4l-1 .7M4.8 12.2c.3-.7.8-1.1 1.5-1.1.8 0 1.5.6 1.5 1.4 0 .7-.4 1.1-1 1.5l-1.8 1.2h2.9" ${strokeAttrs}></path>
      `;
      break;
    case 'bullet':
      content = `
        <circle cx="6.2" cy="7.8" r="1.1" fill="currentColor"></circle>
        <circle cx="6.2" cy="12" r="1.1" fill="currentColor"></circle>
        <circle cx="6.2" cy="16.2" r="1.1" fill="currentColor"></circle>
        <path d="M9.5 7.8h8M9.5 12h8M9.5 16.2h8" ${strokeAttrs}></path>
      `;
      break;
    case 'task-list':
      content = `
        <path d="M5.3 8.1 6.8 9.6l2.4-2.8M10.5 8h7M5.3 12.3 6.8 13.8l2.4-2.8M10.5 12.2h7M5.3 16.5 6.8 18l2.4-2.8M10.5 16.4h7" ${strokeAttrs}></path>
      `;
      break;
    case 'outdent':
      content = `
        <path d="M10.5 7.8h7M10.5 12h7M10.5 16.2h7M4.8 12h4.4M7 9.8 4.8 12 7 14.2" ${strokeAttrs}></path>
      `;
      break;
    case 'indent':
      content = `
        <path d="M6.5 7.8h7M6.5 12h7M6.5 16.2h7M14.8 12h4.4M17 9.8l2.2 2.2-2.2 2.2" ${strokeAttrs}></path>
      `;
      break;
    default:
      content = `<text x="12" y="14" text-anchor="middle" font-size="9" font-weight="600" fill="currentColor">${escapeHtml(icon || '')}</text>`;
      break;
  }

  return `
    <span class="editor-context-glyph" aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">
        ${content}
      </svg>
    </span>
  `;
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

  if (editorContextPrimaryActions.includes(action)) {
    await handleEditMenuAction(action);
    return;
  }

  await currentEditorHost.run(action);
  await currentEditorHost.focus();
}

function buildFolderPath(folderId) {
  if (!folderId) {
    return '资料 / 未分类';
  }

  const segments = [];
  let currentFolder = state.foldersById[folderId] ?? null;

  while (currentFolder) {
    segments.unshift(currentFolder.name);
    currentFolder = currentFolder.parentId ? state.foldersById[currentFolder.parentId] ?? null : null;
  }

  return segments.length ? `资料 / ${segments.join(' / ')}` : '资料 / 未分类';
}

function renderStatus() {
  const visibleNotes = getVisibleNotes();

  if (elements.statusIndicators) {
    elements.statusIndicators.innerHTML = `
      <span class="status-inline">${escapeHtml(state.statusMessage)}</span>
      <span class="status-inline">笔记 ${visibleNotes.length}</span>
      <span class="status-inline">目录 ${Object.keys(state.foldersById).length}</span>
    `;
  }

  if (elements.statusMeta) {
    elements.statusMeta.innerHTML = `
      <span class="status-inline">UTF-8</span>
      <span class="status-inline">${escapeHtml(state.dataMode === 'api' ? (state.currentSpaceId || '已连接后端') : '前端本地模式')}</span>
    `;
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

  const nextFolder = {
    id: `folder-${Date.now().toString(36)}`,
    name,
    parentId,
    spaceId: state.currentSpaceId
  };
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

  const nextNote = {
    id: `note-${Date.now().toString(36)}`,
    title,
    rawMarkdown: `# ${title}\n\n`,
    folderId,
    spaceId: state.currentSpaceId,
    favorite: false,
    status: 'draft',
    sourceType: 'manual',
    tagIds: [],
    internalLinks: [],
    updatedAt: new Date().toISOString()
  };
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

  state.allNotes = renameLocalNoteEntry(state.allNotes, noteId, title).map((note) => (
    note.id === noteId
      ? { ...note, updatedAt: new Date().toISOString() }
      : note
  ));
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

  state.allNotes = state.allNotes.map((note) => (
    note.id === noteId
      ? { ...note, deleted: true, updatedAt: new Date().toISOString() }
      : note
  ));
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

  state.allNotes = state.allNotes.filter((note) => note.id !== noteId);
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

  state.allNotes = state.allNotes.map((note) => (
    note.id === noteId
      ? { ...note, deleted: false, updatedAt: new Date().toISOString() }
      : note
  ));
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

  state.allNotes = state.allNotes.filter((note) => !note.deleted);
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

  state.allNotes = state.allNotes.map((note) => (
    note.id === noteId
      ? { ...note, favorite: Boolean(favorite), updatedAt: new Date().toISOString() }
      : note
  ));
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

  state.allNotes = moveLocalNoteEntry(state.allNotes, noteId, nextFolderId).map((note) => (
    note.id === noteId
      ? { ...note, updatedAt: new Date().toISOString() }
      : note
  ));
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
  const normalizedFiles = Array.from(files ?? []).filter(Boolean);

  if (normalizedFiles.length === 0) {
    throw new Error('请先选择 Markdown 文件');
  }

  const importedItems = await Promise.all(normalizedFiles.map(async (file, index) => {
    const rawMarkdown = await file.text();
    return {
      id: `note-import-${Date.now().toString(36)}-${index.toString(36)}`,
      title: deriveMarkdownImportTitle(file.name, rawMarkdown),
      rawMarkdown,
      sourceType: 'markdown-import'
    };
  }));

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

    flashStatus(
      importedItems.length > 1
        ? `已导入 ${importedItems.length} 个 Markdown 文件`
        : `已导入 Markdown 笔记：${firstImported?.title ?? importedItems[0].title}`
    );
    return;
  }

  state.allNotes = importedItems.reduce((notes, item) => insertLocalNote(notes, {
    id: item.id,
    title: item.title,
    rawMarkdown: item.rawMarkdown,
    folderId,
    spaceId: state.currentSpaceId,
    favorite: false,
    status: 'draft',
    sourceType: item.sourceType,
    tagIds: [],
    internalLinks: [],
    updatedAt: new Date().toISOString()
  }), state.allNotes);
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

  flashStatus(
    importedItems.length > 1
      ? `已导入 ${importedItems.length} 个 Markdown 文件`
      : `已导入 Markdown 笔记：${importedItems[0].title}`
  );
}

function getMenuTargetFolderId() {
  if (state.selectedFolderId) {
    return state.selectedFolderId;
  }

  return getCurrentNote()?.folderId ?? null;
}

function getSiblingNames(folderId) {
  const folderNames = (folderId ? state.foldersById[folderId]?.children ?? [] : state.folderTree)
    .map((folder) => folder.name);
  const noteNames = state.allNotes
    .filter((note) => note.folderId === folderId)
    .map((note) => note.title);

  return [...folderNames, ...noteNames];
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

  const nextNote = {
    ...refreshedNote,
    id: `note-${Date.now().toString(36)}`,
    title: nextTitle,
    rawMarkdown: state.draftMarkdown || refreshedNote.rawMarkdown,
    updatedAt: new Date().toISOString()
  };

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
  const printableHtml = `
    <!doctype html>
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(previewFileName)}</title>
        <style>
          body { font-family: "Segoe UI", "PingFang SC", sans-serif; margin: 40px auto; max-width: 760px; color: #142033; line-height: 1.8; }
          h1, h2, h3 { line-height: 1.3; }
          pre { padding: 16px; background: #10182b; color: #eff4ff; overflow: auto; }
          code { font-family: Consolas, monospace; }
          blockquote { border-left: 3px solid #4c72ff; padding-left: 14px; color: #51607a; }
          img { max-width: 100%; }
        </style>
      </head>
      <body>
        <article>${previewHtml}</article>
        <script>
          window.addEventListener('load', function () {
            window.setTimeout(function () {
              window.focus();
              window.print();
            }, 120);
          });
        </script>
      </body>
    </html>
  `;
  const exportBlob = new Blob([printableHtml], { type: 'text/html;charset=utf-8' });
  const exportUrl = URL.createObjectURL(exportBlob);
  const exportWindow = window.open(exportUrl, '_blank');

  if (!exportWindow) {
    flashStatus('导出 PDF 失败：浏览器拦截了弹窗');
    return;
  }

  const fileName = buildExportFileName(note.title, 'pdf');
  exportWindow.document.write(`
    <!doctype html>
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(fileName)}</title>
        <style>
          body { font-family: "Segoe UI", "PingFang SC", sans-serif; margin: 40px auto; max-width: 760px; color: #142033; line-height: 1.8; }
          h1, h2, h3 { line-height: 1.3; }
          pre { padding: 16px; background: #10182b; color: #eff4ff; overflow: auto; }
          code { font-family: Consolas, monospace; }
          blockquote { border-left: 3px solid #4c72ff; padding-left: 14px; color: #51607a; }
          img { max-width: 100%; }
        </style>
      </head>
      <body>
        <article>${previewHtml}</article>
        <script>
          window.addEventListener('load', function () {
            window.print();
          });
        </script>
      </body>
    </html>
  `);
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
  const styledHtml = `
    <!doctype html>
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(exportName)}</title>
        <style>
          body { font-family: "Segoe UI", "PingFang SC", sans-serif; margin: 40px auto; max-width: 760px; color: #142033; line-height: 1.8; }
          h1, h2, h3 { line-height: 1.3; }
          pre { padding: 16px; background: #10182b; color: #eff4ff; overflow: auto; border-radius: 12px; }
          code { font-family: Consolas, monospace; }
          blockquote { border-left: 3px solid #4c72ff; padding-left: 14px; color: #51607a; }
          img { max-width: 100%; }
          table { width: 100%; border-collapse: collapse; }
          th, td { padding: 8px 10px; border: 1px solid #d0d7e2; text-align: left; }
          th { background: #f0f4fa; }
          li[data-item-type="task"] { list-style: none; position: relative; padding-left: 1.6em; }
          li[data-item-type="task"]::before { content: '☐'; position: absolute; left: 0; font-size: 1.1em; }
          li[data-item-type="task"][data-checked="true"]::before { content: '☑'; }
        </style>
      </head>
      <body>
        <article>${previewHtml}</article>
      </body>
    </html>
  `;
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
  if (editor.mode === 'create-folder' || editor.mode === 'create-note') {
    const parentId = editor.parentId ?? null;
    const siblingFolders = parentId
      ? state.foldersById[parentId]?.children ?? []
      : state.folderTree;
    const siblingNotes = state.allNotes.filter((note) => note.folderId === parentId);

    validateSiblingName({
      candidateName,
      siblingFolders,
      siblingNotes
    });
    return;
  }

  if (editor.mode === 'rename-folder') {
    const folder = state.foldersById[editor.targetId];
    const parentId = folder?.parentId ?? null;
    const siblingFolders = parentId
      ? state.foldersById[parentId]?.children ?? []
      : state.folderTree;
    const siblingNotes = state.allNotes.filter((note) => note.folderId === parentId);

    validateSiblingName({
      candidateName,
      siblingFolders,
      siblingNotes,
      currentFolderId: editor.targetId
    });
    return;
  }

  if (editor.mode === 'rename-note') {
    const note = state.allNotes.find((item) => item.id === editor.targetId);
    const folderId = note?.folderId ?? null;
    const siblingFolders = folderId
      ? state.foldersById[folderId]?.children ?? []
      : state.folderTree;
    const siblingNotes = state.allNotes.filter((item) => item.folderId === folderId);

    validateSiblingName({
      candidateName,
      siblingFolders,
      siblingNotes,
      currentNoteId: editor.targetId
    });
  }
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

function deriveNoteTitleFromMarkdown(markdown, fallbackTitle = 'Untitled Note') {
  const headingMatch = String(markdown ?? '').match(/^\s*#\s+(.+)$/m);
  if (headingMatch?.[1]?.trim()) {
    return headingMatch[1].trim();
  }

  const firstLine = String(markdown ?? '')
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean);

  return firstLine || fallbackTitle;
}

function deriveMarkdownImportTitle(fileName, markdown) {
  const fallbackTitle = String(fileName ?? '')
    .replace(/\.[^.]+$/, '')
    .trim() || 'Imported Note';

  return deriveNoteTitleFromMarkdown(markdown, fallbackTitle);
}

function getSaveStateLabel() {
  switch (state.saveState) {
    case 'pending':
      return '待保存';
    case 'saving':
      return '保存中...';
    case 'saved':
      return state.lastSavedAt ? `已保存 ${formatDate(state.lastSavedAt)}` : '已保存';
    case 'error':
      return '保存失败';
    default:
      return '实时编辑';
  }
}

function renderEditorSaveIndicator() {
  const indicator = document.getElementById('editor-save-indicator');
  if (!indicator) {
    return;
  }

  indicator.dataset.saveState = state.saveState;
  indicator.textContent = getSaveStateLabel();
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

  const isReplace = state.editorPanel.mode === 'replace';
  const queryValue = escapeHtml(state.editorPanel.query ?? '');
  const replacementValue = escapeHtml(state.editorPanel.replacement ?? '');
  const statusText = state.editorPanel.query
    ? (state.editorPanel.matchCount > 0
      ? `已找到 ${state.editorPanel.matchCount} 处`
      : '未找到匹配项')
    : '输入内容后开始查找';

  panel.hidden = false;
  panel.dataset.mode = state.editorPanel.mode;
  panel.innerHTML = `
    <div class="editor-utility-panel-head">
      <div class="editor-utility-panel-title">${isReplace ? '替换' : '查找'}</div>
      <button type="button" class="editor-utility-close" data-editor-panel-action="close" aria-label="关闭查找面板">×</button>
    </div>
    <div class="editor-utility-panel-body">
      <label class="editor-utility-field">
        <span>查找内容</span>
        <input
          type="text"
          class="editor-utility-input"
          data-panel-field="query"
          value="${queryValue}"
          placeholder="输入要查找的文字"
          autocomplete="off"
          spellcheck="false"
        />
      </label>
      ${isReplace ? `
        <label class="editor-utility-field">
          <span>替换为</span>
          <input
            type="text"
            class="editor-utility-input"
            data-panel-field="replacement"
            value="${replacementValue}"
            placeholder="输入替换后的文字"
            autocomplete="off"
            spellcheck="false"
          />
        </label>
      ` : ''}
      <div class="editor-utility-panel-status">${escapeHtml(statusText)}</div>
      ${!isReplace ? '<div class="editor-utility-panel-hint">F3 下一个，Shift+F3 上一个</div>' : ''}
    </div>
    <div class="editor-utility-panel-actions">
      ${!isReplace ? '<button type="button" class="ghost-button" data-editor-panel-action="submit-previous">查找上一个</button>' : ''}
      <button type="button" class="subtle-button" data-editor-panel-action="submit">${isReplace ? '替换一次' : '查找下一个'}</button>
      ${isReplace ? '<button type="button" class="subtle-button" data-editor-panel-action="replace-all">全部替换</button>' : ''}
      <button type="button" class="ghost-button" data-editor-panel-action="close">关闭</button>
    </div>
  `;

  if (state.editorPanel.autoFocusInput) {
    window.requestAnimationFrame(() => {
      const input = panel.querySelector('[data-panel-field="query"]');
      input?.focus();
      input?.select();
      state.editorPanel.autoFocusInput = false;
    });
  }
}

function normalizeTableDialogValue(value, fallback) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(20, Math.max(1, parsed));
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
  dialog.innerHTML = `
    <div class="editor-table-dialog-backdrop" data-editor-table-dialog-action="cancel"></div>
    <div class="editor-table-dialog-card" role="dialog" aria-modal="true" aria-labelledby="editor-table-dialog-title">
      <div class="editor-table-dialog-title" id="editor-table-dialog-title">插入表格</div>
      <div class="editor-table-dialog-grid">
        <label class="editor-table-dialog-field">
          <span>行</span>
          <input
            type="number"
            min="1"
            max="20"
            step="1"
            inputmode="numeric"
            class="editor-table-dialog-input"
            data-table-dialog-field="rows"
            value="${escapeAttribute(state.editorTableDialog.rows)}"
          />
        </label>
        <label class="editor-table-dialog-field">
          <span>列</span>
          <input
            type="number"
            min="1"
            max="20"
            step="1"
            inputmode="numeric"
            class="editor-table-dialog-input"
            data-table-dialog-field="cols"
            value="${escapeAttribute(state.editorTableDialog.cols)}"
          />
        </label>
      </div>
      <div class="editor-table-dialog-actions">
        <button type="button" class="ghost-button" data-editor-table-dialog-action="cancel">取消</button>
        <button type="button" class="subtle-button" data-editor-table-dialog-action="confirm">确定</button>
      </div>
    </div>
  `;

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

  const nextMarkdown = state.draftMarkdown;
  const nextTitle = deriveNoteTitleFromMarkdown(nextMarkdown, note.title);
  if (note.rawMarkdown === nextMarkdown && note.title === nextTitle) {
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
        title: nextTitle,
        rawMarkdown: nextMarkdown
      });
    } else {
      updatedNote = {
        ...note,
        title: nextTitle,
        rawMarkdown: nextMarkdown,
        updatedAt: new Date().toISOString()
      };
    }

    state.allNotes = state.allNotes.map((item) => (
      item.id === updatedNote.id
        ? {
            ...item,
            ...updatedNote,
            title: updatedNote.title ?? nextTitle,
            rawMarkdown: updatedNote.rawMarkdown ?? nextMarkdown
          }
        : item
    ));
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

function normalizeFolderTree(nodes) {
  if (!Array.isArray(nodes)) {
    return [];
  }

  return nodes
    .filter((node) => node && typeof node === 'object' && !Array.isArray(node))
    .map((node) => ({
      ...node,
      id: String(node.id ?? ''),
      name: String(node.name ?? '未命名目录'),
      parentId: node.parentId ?? null,
      children: normalizeFolderTree(node.children ?? [])
    }))
    .filter((node) => node.id);
}

function normalizeNotes(notes) {
  if (!Array.isArray(notes)) {
    return [];
  }

  return notes
    .filter((note) => note && typeof note === 'object' && !Array.isArray(note))
    .map((note) => ({
      ...note,
      id: String(note.id ?? ''),
      title: String(note.title ?? '未命名笔记'),
      folderId: note.folderId ?? null,
      tagIds: Array.isArray(note.tagIds) ? [...note.tagIds] : [],
      internalLinks: Array.isArray(note.internalLinks) ? [...note.internalLinks] : [],
      rawMarkdown: note.rawMarkdown ?? '',
      favorite: Boolean(note.favorite),
      deleted: Boolean(note.deleted)
    }))
    .filter((note) => note.id);
}

function replaceNoteInState(updatedNote) {
  const normalizedNote = normalizeNotes([updatedNote])[0];
  if (!normalizedNote) {
    return;
  }

  state.allNotes = state.allNotes.map((note) => (
    note.id === normalizedNote.id
      ? {
        ...note,
        ...normalizedNote
      }
      : note
  ));

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

function buildTagId(name) {
  return buildUniqueTagId(name, state.tags);
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
  const normalizedName = String(name ?? '').trim();
  const currentNote = getCurrentNote();
  if (!currentNote || currentNote.deleted || !normalizedName) {
    return;
  }

  const existingTag = state.tags.find((tag) => tag.name.trim().toLowerCase() === normalizedName.toLowerCase());
  if (existingTag) {
    state.noteTagComposer.draft = '';
    state.noteTagComposer.isExpanded = true;
    await addTagToCurrentNote(existingTag.id);
    renderSidebar(getCurrentNote());
    return;
  }

  try {
    const tagInput = {
      id: buildTagId(normalizedName),
      spaceId: state.currentSpaceId,
      name: normalizedName,
      color: '#3c68ff'
    };

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

function createLocalKnowledgePointAggregate(input) {
  const createdAt = new Date().toISOString();
  return {
    id: input.id,
    spaceId: input.spaceId,
    title: input.title,
    comment: input.comment ?? '',
    status: 'active',
    deletedAt: null,
    createdAt,
    updatedAt: createdAt,
    sources: input.sources.map((source) => ({
      ...source,
      knowledgePointId: input.id,
      sortOrder: source.sortOrder ?? 1,
      isAnchorValid: true,
      createdAt,
      updatedAt: createdAt
    })),
    tagIds: input.tagIds ?? [],
    noteIds: [input.noteId]
  };
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
      if (!point) {
        flashStatus('未找到要加入的知识点');
        return;
      }
      updated = {
        ...point,
        sources: [
          ...(point.sources ?? []),
          {
            ...sourceInput,
            knowledgePointId: point.id,
            sortOrder: (point.sources ?? []).length + 1,
            isAnchorValid: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        ],
        noteIds: [...new Set([...(point.noteIds ?? []), note.id])],
        updatedAt: new Date().toISOString()
      };
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
      const source = (point.sources ?? []).find((item) => item.id === sourceId);
      const nextSources = (point.sources ?? []).filter((item) => item.id !== sourceId);
      if (nextSources.length === 0) {
        flashStatus('知识点至少需要保留一个原文片段');
        return;
      }
      const currentNote = getCurrentNote();
      const hasCurrentNoteSources = nextSources.some((item) => item.noteId === currentNote?.id);
      updated = {
        ...point,
        sources: nextSources,
        noteIds: hasCurrentNoteSources || source?.noteId !== currentNote?.id
          ? point.noteIds
          : (point.noteIds ?? []).filter((noteId) => noteId !== currentNote?.id),
        updatedAt: new Date().toISOString()
      };
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

function getKnowledgePointFormUpdates(form) {
  const formData = new FormData(form);
  const checkedTagIds = Array.from(form.querySelectorAll('[data-knowledge-point-edit-tag-input]:checked'))
    .map((input) => input.value)
    .filter(Boolean);
  const hiddenTagIds = formData.getAll('tagIds').map((tagId) => String(tagId)).filter(Boolean);
  return {
    title: String(formData.get('title') ?? '').trim(),
    comment: String(formData.get('comment') ?? '').trim(),
    tagIds: [...new Set([...hiddenTagIds, ...checkedTagIds])]
  };
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





