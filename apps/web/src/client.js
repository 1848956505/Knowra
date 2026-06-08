import { knowledgeBaseSeed } from '../lib/mock-knowledge-base.js';
import { createMilkdownHost } from '../lib/editor/milkdown-bundle.js';
import {
  buildNoteTabPath,
  closeOtherTabs,
  closeTab,
  ensureOpenTab,
  reorderTabs
} from '../lib/editor/tab-workspace.js';
import { validateSiblingName } from '../lib/tree-name-validation.js';
import {
  createBackendSnapshot,
  mergeWorkspaceSnapshots,
  selectInitialWorkspaceSource,
  selectLoadRecovery
} from '../lib/workspace-loading.js';
import {
  buildTreeFromFlatFolders,
  deleteFolder as deleteLocalFolderTree,
  deleteNote as deleteLocalNoteEntry,
  flattenFolderTree,
  insertFolder as insertLocalFolder,
  insertNote as insertLocalNote,
  moveFolder as moveLocalFolderTree,
  moveNote as moveLocalNoteEntry,
  renameFolder as renameLocalFolderTree,
  renameNote as renameLocalNoteEntry,
  resolveNoteVisualType
} from '../lib/tree-workspace.js';

const BACKEND_CACHE_KEY = 'study-accelerator.backend-workspace-cache';
const AUTOSAVE_DELAY_MS = 700;

const SECONDARY_SECTION_ITEMS = [
  { key: 'tags', label: '标签' },
  { key: 'concepts', label: '知识点' },
  { key: 'favorites', label: '收藏' },
  { key: 'recent', label: '最近' },
  { key: 'recycle', label: '回收站' }
];

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
    tags: false,
    concepts: false,
    favorites: false,
    recent: false,
    recycle: false
  },
  secondarySections: {
    tags: true,
    concepts: true,
    favorites: true,
    recent: true,
    recycle: true
  },
  openFolders: {},
  draftMarkdown: '',
  searchQuery: '',
  linkedNotes: [],
  attachments: [],
  openNoteTabs: [],
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
  { key: 'heading-1', label: 'H1' },
  { key: 'heading-2', label: 'H2' },
  { key: 'heading-3', label: 'H3' },
  { key: 'bold', label: 'Bold' },
  { key: 'italic', label: 'Italic' },
  { key: 'quote', label: 'Quote' },
  { key: 'bullet', label: 'List' },
  { key: 'code', label: 'Code' },
  { key: 'codeblock', label: 'Block' }
];

const elements = {};
let autosaveTimer = null;
let currentEditorHost = null;
let currentEditorNoteId = null;
let pendingEditorNoteId = null;
let editorMountToken = 0;

initialize();

function initialize() {
  cacheElements();
  renderRail();
  bindEvents();

  const initialSnapshot = readInitialWorkspaceSnapshot();
  const cachedSnapshot = readBackendCache();
  const startupSnapshot = mergeWorkspaceSnapshots(initialSnapshot, cachedSnapshot);

  if (selectInitialWorkspaceSource({ cachedSnapshot: startupSnapshot }) === 'cache') {
    state.dataMode = 'cache';
    state.statusMessage = initialSnapshot ? '后端资料已同步' : '正在同步后端资料...';
    loadCachedWorkspaceData(startupSnapshot);

    if (initialSnapshot) {
      persistBackendCache();
    }
  } else {
    renderAll();
  }

  void loadWorkspaceData({ cachedSnapshot: startupSnapshot });
}

function cacheElements() {
  elements.globalSearch = document.getElementById('global-search');
  elements.moduleRail = document.getElementById('module-rail');
  elements.folderTree = document.getElementById('folder-tree');
  elements.secondaryNavToggle = document.getElementById('secondary-nav-toggle');
  elements.contextMenu = document.getElementById('library-context-menu');
  elements.sectionMenu = document.getElementById('library-section-menu');
  elements.noteTabs = document.getElementById('note-tabs');
  elements.noteTabMenu = document.getElementById('note-tab-menu');
  elements.editorContent = document.getElementById('editor-content');
  elements.noteInfo = document.getElementById('note-info');
  elements.tagCount = document.getElementById('tag-count');
  elements.noteTags = document.getElementById('note-tags');
  elements.linkedCount = document.getElementById('linked-count');
  elements.linkedNotes = document.getElementById('linked-notes');
  elements.attachmentCount = document.getElementById('attachment-count');
  elements.attachments = document.getElementById('attachments');
  elements.statusIndicators = document.getElementById('status-indicators');
  elements.statusMeta = document.getElementById('status-meta');
}

function bindEvents() {
  elements.globalSearch?.addEventListener('input', (event) => {
    state.searchQuery = event.target.value.trim().toLowerCase();
    renderAll();
  });

  elements.secondaryNavToggle?.addEventListener('click', (event) => {
    event.stopPropagation();
    state.sectionMenuOpen = !state.sectionMenuOpen;
    closeContextMenu();
    renderFolders();
  });

  elements.folderTree?.addEventListener('click', (event) => {
    const navSection = event.target.closest('[data-nav-section]');
    if (navSection) {
      const sectionKey = navSection.dataset.navSection;
      state.navSections[sectionKey] = !(state.navSections[sectionKey] ?? false);
      closeContextMenu();
      renderFolders();
      return;
    }

    const folderToggle = event.target.closest('[data-folder-toggle]');
    if (folderToggle?.dataset.folderToggle) {
      event.stopPropagation();
      toggleFolderOpen(folderToggle.dataset.folderToggle);
      return;
    }

    const folderButton = event.target.closest('[data-folder-id]');
    if (folderButton?.dataset.folderId) {
      void selectFolder(folderButton.dataset.folderId);
      return;
    }

    const noteButton = event.target.closest('[data-note-id]');
    if (noteButton?.dataset.noteId) {
      void selectNote(noteButton.dataset.noteId, { syncFolder: true });
    }
  });

  elements.folderTree?.addEventListener('contextmenu', (event) => {
    const noteButton = event.target.closest('[data-note-id]');
    const folderButton = event.target.closest('[data-folder-id]');
    const materialsSection = event.target.closest('[data-materials-section]');

    if (!noteButton && !folderButton && !materialsSection) {
      return;
    }

    event.preventDefault();

    if (noteButton?.dataset.noteId) {
      openContextMenu({
        x: event.clientX,
        y: event.clientY,
        targetKind: 'note',
        targetId: noteButton.dataset.noteId
      });
      return;
    }

    if (folderButton?.dataset.folderId) {
      state.selectedFolderId = folderButton.dataset.folderId;
      openContextMenu({
        x: event.clientX,
        y: event.clientY,
        targetKind: 'folder',
        targetId: folderButton.dataset.folderId
      });
      renderStatus();
      return;
    }

    openContextMenu({
      x: event.clientX,
      y: event.clientY,
      targetKind: 'materials',
      targetId: null
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

  elements.linkedNotes?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-linked-id]');
    if (!button) {
      return;
    }
    void selectNote(button.dataset.linkedId, { syncFolder: true });
  });

  elements.attachments?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-attachment-name]');
    if (!button) {
      return;
    }
    flashStatus(`已选中附件：${button.dataset.attachmentName ?? ''}`);
  });

  document.addEventListener('click', (event) => {
    const formatButton = event.target.closest('[data-format]');
    if (!formatButton) {
      return;
    }
    handleFormat(formatButton.dataset.format);
  });

  document.addEventListener('click', (event) => {
    if (event.target.closest('#library-context-menu')) return;
    if (event.target.closest('#library-section-menu')) return;
    if (event.target.closest('#note-tab-menu')) return;
    if (event.target.closest('#secondary-nav-toggle')) return;
    closeContextMenu();
    closeSectionMenu();
    closeTabMenu();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeContextMenu();
      closeSectionMenu();
      closeTabMenu();
    }
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

  document.addEventListener('click', (event) => {
    const saveButton = event.target.closest('[data-save-now]');
    if (!saveButton) {
      return;
    }
    void persistDraft({ immediate: true });
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
      loadCachedWorkspaceData(recoverySnapshot);
      state.dataMode = 'cache';
      flashStatus('后端暂时不可用，已显示最近一次成功加载的资料');
      return;
    }

    loadMockWorkspaceData();
    state.dataMode = 'local';
    flashStatus('未检测到后端，已切换到前端本地演示模式');
  }
}

async function ensureSpaceId() {
  const spacesPayload = await fetchJson('/api/knowledge/spaces');
  const spaces = Array.isArray(spacesPayload.data) ? spacesPayload.data : [];

  if (spaces.length > 0) {
    state.spaces = spaces;
    state.currentSpaceId = spaces[0].id;
    return state.currentSpaceId;
  }

  const createdPayload = await fetchJson('/api/knowledge/spaces/default', {
    method: 'POST',
    body: JSON.stringify({ userId: 'demo' })
  });
  const createdSpace = createdPayload.data;
  state.spaces = [createdSpace];
  state.currentSpaceId = createdSpace.id;
  return state.currentSpaceId;
}

async function refreshKnowledgeData(spaceId = state.currentSpaceId) {
  const [folderTreePayload, notesPayload, tagsPayload] = await Promise.all([
    fetchJson(`/api/knowledge/folders/tree?spaceId=${encodeURIComponent(spaceId)}`),
    fetchJson(`/api/knowledge/notes?spaceId=${encodeURIComponent(spaceId)}`),
    fetchJson(`/api/knowledge/tags?spaceId=${encodeURIComponent(spaceId)}`)
  ]);

  state.folderTree = normalizeFolderTree(folderTreePayload.data ?? []);
  state.foldersById = flattenFolderTree(state.folderTree);
  state.tags = Array.isArray(tagsPayload.data) ? tagsPayload.data : [];
  state.allNotes = normalizeNotes(notesPayload.data ?? []);
  state.openFolders = {
    ...Object.fromEntries(Object.keys(state.foldersById).map((folderId) => [folderId, true])),
    ...state.openFolders
  };

  reconcileSelection();
  await loadCurrentNoteSideData();
  renderAll();
}

function persistBackendCache() {
  try {
    window.localStorage.setItem(
      BACKEND_CACHE_KEY,
      JSON.stringify(createBackendSnapshot(state))
    );
  } catch (error) {
    // Ignore cache failures in restricted browser contexts.
  }
}

function readBackendCache() {
  try {
    const raw = window.localStorage.getItem(BACKEND_CACHE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.folderTree) || !Array.isArray(parsed.allNotes)) {
      return null;
    }

    return parsed;
  } catch (error) {
    return null;
  }
}

function readInitialWorkspaceSnapshot() {
  const snapshot = window.__STUDY_INITIAL_WORKSPACE__;
  if (!snapshot || !Array.isArray(snapshot.folderTree) || !Array.isArray(snapshot.allNotes)) {
    return null;
  }

  return snapshot;
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
  const mockSpace = {
    id: 'space-local-preview',
    name: '本地演示空间'
  };
  const folders = knowledgeBaseSeed.folders.map((folder) => ({
    ...folder,
    spaceId: mockSpace.id
  }));
  const notes = knowledgeBaseSeed.notes.map((note) => ({
    ...note,
    spaceId: mockSpace.id,
    tagIds: [...(note.tagIds ?? [])],
    internalLinks: [...(note.internalLinks ?? [])]
  }));

  state.spaces = [mockSpace];
  state.currentSpaceId = mockSpace.id;
  state.folderTree = buildTreeFromFlatFolders(folders);
  state.foldersById = flattenFolderTree(state.folderTree);
  state.tags = [...knowledgeBaseSeed.tags];
  state.allNotes = normalizeNotes(notes);
  state.openFolders = Object.fromEntries(Object.keys(state.foldersById).map((folderId) => [folderId, true]));

  reconcileSelection();
  loadLocalNoteSideData(state.selectedNoteId);
  renderAll();
}

function reconcileSelection() {
  if (state.selectedFolderId && !state.foldersById[state.selectedFolderId]) {
    state.selectedFolderId = null;
  }

  const existingNoteIds = new Set(state.allNotes.map((note) => note.id));
  state.openNoteTabs = state.openNoteTabs.filter((noteId) => existingNoteIds.has(noteId));

  const visibleNotes = getVisibleNotes();

  if (visibleNotes.length === 0) {
    state.selectedNoteId = null;
    state.draftMarkdown = '';
    state.linkedNotes = [];
    state.attachments = [];
    state.openNoteTabs = [];
    return;
  }

  if (!state.selectedNoteId || !visibleNotes.some((note) => note.id === state.selectedNoteId)) {
    state.selectedNoteId = visibleNotes[0].id;
  }

  const currentNote = getCurrentNote();
  state.openNoteTabs = ensureOpenTab(state.openNoteTabs, currentNote?.id ?? null);
  state.draftMarkdown = currentNote?.rawMarkdown ?? '';
  state.saveState = currentNote ? 'saved' : 'idle';
  state.lastSavedAt = currentNote?.updatedAt ?? null;
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
    state.linkedNotes = [];
    state.attachments = [];
    return;
  }

  try {
    const [linkedPayload, attachmentsPayload] = await Promise.all([
      fetchJson(`/api/knowledge/notes/${encodeURIComponent(noteId)}/links`),
      fetchJson(`/api/storage/attachments?noteId=${encodeURIComponent(noteId)}`)
    ]);
    state.linkedNotes = Array.isArray(linkedPayload.data) ? linkedPayload.data : [];
    state.attachments = Array.isArray(attachmentsPayload.data) ? attachmentsPayload.data : [];
  } catch (error) {
    state.linkedNotes = [];
    state.attachments = [];
    flashStatus(`附加信息加载失败：${error.message}`);
  }
}

function loadLocalNoteSideData(noteId) {
  if (!noteId) {
    state.linkedNotes = [];
    state.attachments = [];
    return;
  }

  const note = state.allNotes.find((item) => item.id === noteId);
  state.linkedNotes = (note?.internalLinks ?? [])
    .map((linkedId) => state.allNotes.find((item) => item.id === linkedId))
    .filter(Boolean);
  state.attachments = knowledgeBaseSeed.attachments.filter((attachment) => attachment.noteId === noteId);
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
  renderFolders();
  renderTabs();
  renderEditor(getCurrentNote());
  renderSidebar(getCurrentNote());
  renderStatus();
}

function renderFolders() {
  if (!elements.folderTree) {
    return;
  }

  const topFolders = state.folderTree.filter((folder) => matchesFolderSearch(folder));
  const tagItems = state.tags
    .map((tag) => ({
      id: tag.id,
      label: tag.name,
      meta: String(state.allNotes.filter((note) => (note.tagIds ?? []).includes(tag.id)).length)
    }))
    .filter((tag) => matchesSearch(tag.label));
  const favoriteNotes = state.allNotes.filter((note) => note.favorite && matchesSearch(note.title));
  const recentNotes = [...state.allNotes]
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

  if (state.secondarySections.tags) {
    sections.push(
      renderNavSection({
        key: 'tags',
        label: '标签',
        count: tagItems.length,
        children: tagItems.length
          ? tagItems.map((item) => renderStaticItem(item.label, item.meta)).join('')
          : renderEmptyItem('暂无标签')
      })
    );
  }

  if (state.secondarySections.concepts) {
    sections.push(
      renderNavSection({
        key: 'concepts',
        label: '知识点',
        count: 0,
        children: renderEmptyItem('暂未接入')
      })
    );
  }

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
        count: 0,
        children: renderEmptyItem('暂未接入')
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
    <button type="button" class="note-tab-menu-item" data-tab-menu-action="close">\u5173\u95ed</button>
    <button type="button" class="note-tab-menu-item" data-tab-menu-action="close-others">\u5173\u95ed\u5176\u4ed6</button>
    <div class="note-tab-menu-divider" aria-hidden="true"></div>
    <button type="button" class="note-tab-menu-item" data-tab-menu-action="copy-path">\u590d\u5236\u8def\u5f84</button>
  `;
}

function renderNavSection({ key, label, count, children }) {
  const open = state.navSections[key] ?? false;
  const isMaterials = key === 'materials';
  const isDropTarget = isMaterials && isRootDropActive();

  return `
    <div class="library-node-group library-section-group">
      <button
        type="button"
        class="library-node library-section-node"
        data-nav-section="${key}"
        data-open="${open}"
        data-level="0"
        data-drop-target="${isDropTarget}"
        ${isMaterials ? 'data-materials-section="true"' : ''}
      >
        <span class="library-node-leading">
          <svg viewBox="0 0 16 16" aria-hidden="true" class="library-chevron" data-open="${open}">
            <path d="M5 3.5 10 8l-5 4.5"></path>
          </svg>
        </span>
        <span class="library-node-label library-section-label">${escapeHtml(label)}</span>
        <span class="library-section-meta">${escapeHtml(count)}</span>
      </button>
      ${open ? `<div class="library-node-children">${children}</div>` : ''}
    </div>
  `;
}

function renderMaterialsTree(topFolders) {
  const parts = [];
  const rootNotes = getDirectNotesForFolder(null).filter((note) => matchesSearch(note.title));

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
  const childNotes = getDirectNotesForFolder(folder.id).filter((note) => matchesSearch(note.title));
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
    : `
      <button
        type="button"
        class="library-node library-note-node"
        data-note-id="${note.id}"
        data-level="${level}"
        data-selected="${selected}"
        data-drag-kind="note"
        data-drag-id="${note.id}"
        data-dragging="${isDragging}"
        title="${escapeHtml(note.title)}"
        draggable="true"
      >
        <span class="library-node-leading">
          <span class="library-node-spacer"></span>
          ${renderNoteIcon(iconKind)}
        </span>
        <span class="library-node-label">${escapeHtml(note.title)}</span>
      </button>
    `;

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

function renderInlineEditorRow(level, mode, value) {
  const placeholder = mode.includes('folder') ? '输入目录名称' : '输入文件名称';

  return `
    <div class="library-inline-editor" style="--tree-level:${level}">
      <form class="library-inline-form" data-inline-editor-form>
        <span class="library-inline-icon" aria-hidden="true">
          ${mode.includes('folder') ? renderFolderIcon(true) : renderNoteIcon('markdown')}
        </span>
        <input
          type="text"
          class="library-inline-input"
          data-inline-editor-input
          value="${escapeAttribute(value)}"
          placeholder="${placeholder}"
          autocomplete="off"
          spellcheck="false"
        />
        <div class="library-inline-actions">
          <button type="submit" class="library-inline-action" title="确认">✓</button>
          <button type="button" class="library-inline-action" data-editor-cancel title="取消">✕</button>
        </div>
      </form>
    </div>
  `;
}

function renderDeleteIntentRow(level, kind, targetId, name) {
  return `
    <div class="library-inline-confirm" style="--tree-level:${level}">
      <div class="library-inline-confirm-body">
        <span class="library-inline-confirm-text">删除“${escapeHtml(name)}”后将立即生效</span>
        <div class="library-inline-actions">
          <button type="button" class="library-inline-action library-inline-action-danger" data-delete-confirm="${kind}" data-target-id="${targetId}">删除</button>
          <button type="button" class="library-inline-action" data-delete-cancel>取消</button>
        </div>
      </div>
    </div>
  `;
}

function renderStaticItem(label, meta = '') {
  return `
    <div class="library-node library-static-node" data-level="1">
      <span class="library-node-leading">
        <span class="library-node-spacer"></span>
      </span>
      <span class="library-node-label">${escapeHtml(label)}</span>
      ${meta ? `<span class="library-section-meta">${escapeHtml(meta)}</span>` : ''}
    </div>
  `;
}

function renderEmptyItem(label) {
  return `
    <div class="library-node library-static-node library-empty-node" data-level="1">
      <span class="library-node-leading">
        <span class="library-node-spacer"></span>
      </span>
      <span class="library-node-label">${escapeHtml(label)}</span>
    </div>
  `;
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
  elements.contextMenu.innerHTML = items
    .map((item) => {
      if (item.type === 'divider') {
        return '<div class="library-context-divider" aria-hidden="true"></div>';
      }

      return `
        <button type="button" class="library-context-item" data-context-action="${item.action}">
          <span>${escapeHtml(item.label)}</span>
        </button>
      `;
    })
    .join('');
}

function getContextMenuItems() {
  switch (state.contextMenu.targetKind) {
    case 'materials':
      return [
        { action: 'create-folder-root', label: '新建目录' },
        { action: 'create-note-root', label: '新建文件' }
      ];
    case 'folder':
      return [
        { action: 'create-folder-child', label: '新建子目录' },
        { action: 'create-note-child', label: '新建文件' },
        { type: 'divider' },
        { action: 'rename-folder', label: '重命名' },
        { action: 'delete-folder', label: '删除' }
      ];
    case 'note':
      return [
        { action: 'rename-note', label: '重命名' },
        { action: 'delete-note', label: '删除' }
      ];
    default:
      return [];
  }
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
  elements.sectionMenu.innerHTML = SECONDARY_SECTION_ITEMS
    .map(
      (item) => `
        <button type="button" class="library-context-item library-check-item" data-section-toggle="${item.key}">
          <span class="library-checkmark">${state.secondarySections[item.key] ? '✓' : ''}</span>
          <span>${escapeHtml(item.label)}</span>
        </button>
      `
    )
    .join('');
}

function renderFolderIcon(open) {
  return open
    ? `
        <svg viewBox="0 0 16 16" aria-hidden="true" class="library-tree-icon">
          <path d="M1.5 5.5h5l1.2 1.3H14v5.7a1 1 0 0 1-1 1H3a1.5 1.5 0 0 1-1.5-1.5z"></path>
          <path d="M1.5 5V4a1 1 0 0 1 1-1h3l1.1 1.2H13A1 1 0 0 1 14 5v1.3"></path>
        </svg>
      `
    : `
        <svg viewBox="0 0 16 16" aria-hidden="true" class="library-tree-icon">
          <path d="M2 4h3.4l1.1 1.2H13A1 1 0 0 1 14 6v5.5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z"></path>
          <path d="M2 6h12"></path>
        </svg>
      `;
}

function renderNoteIcon(iconKind = 'markdown') {
  if (iconKind === 'pdf') {
    return `
      <svg viewBox="0 0 16 16" aria-hidden="true" class="library-tree-icon library-tree-icon-pdf">
        <path d="M4 2.5h5l3 3v7.8a.7.7 0 0 1-.7.7H4.7a.7.7 0 0 1-.7-.7z"></path>
        <path d="M9 2.5v3h3"></path>
        <path d="M4.8 10.5h6.4"></path>
        <path d="M5.2 12.2h5.6"></path>
      </svg>
    `;
  }

  if (iconKind === 'resource') {
    return `
      <svg viewBox="0 0 16 16" aria-hidden="true" class="library-tree-icon library-tree-icon-resource">
        <path d="M4 2.5h5l3 3v7.8a.7.7 0 0 1-.7.7H4.7a.7.7 0 0 1-.7-.7z"></path>
        <path d="M9 2.5v3h3"></path>
        <path d="M5.1 9.9 7 8.5l1.4 1.2 2-2"></path>
      </svg>
    `;
  }

  return `
    <svg viewBox="0 0 16 16" aria-hidden="true" class="library-tree-icon library-tree-icon-markdown">
      <path d="M4 2.5h5l3 3v7.8a.7.7 0 0 1-.7.7H4.7a.7.7 0 0 1-.7-.7z"></path>
      <path d="M9 2.5v3h3"></path>
      <path d="M5.1 11.8V9.1l1.2 1.5 1.2-1.5v2.7"></path>
      <path d="M8.9 11.8V9.1l2.1 2.7V9.1"></path>
    </svg>
  `;
}

function renderEditor(note) {
  if (!elements.editorContent) {
    return;
  }

  if (!note) {
    void teardownEditorHost();
    elements.editorContent.dataset.sourceOpen = 'false';
    elements.editorContent.innerHTML = `
      <section class="preview-pane preview-frame">
        <div class="pane-body">
          <article class="preview-rendered"><p>当前目录下还没有可显示的笔记。</p></article>
        </div>
      </section>
    `;
    return;
  }

  if (currentEditorHost && currentEditorNoteId === note.id) {
    renderEditorSaveIndicator();
    return;
  }

  elements.editorContent.dataset.sourceOpen = 'true';
  elements.editorContent.innerHTML = `
    <section class="editor-pane editor-pane-single">
      <div class="pane-body pane-body-editor">
        <div class="source-toolbar">
          ${formatButtons
            .map((button) => `<button type="button" class="chip-button" data-format="${button.key}">${button.label}</button>`)
            .join('')}
          <span class="editor-save-indicator" id="editor-save-indicator"></span>
          <button type="button" class="subtle-button editor-save-button" data-save-now>保存</button>
        </div>
        <div class="milkdown-host" id="milkdown-editor"></div>
      </div>
    </section>
  `;

  renderEditorSaveIndicator();
  mountEditorHost(note.id, state.draftMarkdown);
}

function renderSidebar(note) {
  if (!elements.noteInfo || !elements.tagCount || !elements.noteTags || !elements.linkedCount || !elements.linkedNotes || !elements.attachmentCount || !elements.attachments) {
    return;
  }

  if (!note) {
    elements.noteInfo.innerHTML = '';
    elements.tagCount.textContent = '0';
    elements.noteTags.innerHTML = '';
    elements.linkedCount.textContent = '0';
    elements.linkedNotes.innerHTML = '';
    elements.attachmentCount.textContent = '0';
    elements.attachments.innerHTML = '';
    return;
  }

  const folder = note.folderId ? state.foldersById[note.folderId] : null;
  const tags = (note.tagIds ?? [])
    .map((tagId) => state.tags.find((tag) => tag.id === tagId))
    .filter(Boolean);

  elements.noteInfo.innerHTML = `
    <div class="info-row"><span>标题</span><strong>${escapeHtml(note.title)}</strong></div>
    <div class="info-row"><span>目录</span><strong>${escapeHtml(folder?.name ?? '未分类')}</strong></div>
    <div class="info-row"><span>更新时间</span><strong>${formatDate(note.updatedAt)}</strong></div>
    <div class="info-row"><span>收藏</span><strong>${note.favorite ? '是' : '否'}</strong></div>
  `;

  elements.tagCount.textContent = String(tags.length);
  elements.noteTags.innerHTML = tags.length
    ? tags
        .map(
          (tag) => `
            <span class="pill" data-accent="true">
              <span aria-hidden="true" style="width: 8px; height: 8px; border-radius: 999px; background: ${escapeHtml(tag.color || '#3c68ff')};"></span>
              ${escapeHtml(tag.name)}
            </span>
          `
        )
        .join('')
    : '';

  elements.linkedCount.textContent = String(state.linkedNotes.length);
  elements.linkedNotes.innerHTML = state.linkedNotes.length
    ? state.linkedNotes
        .map(
          (linkedNote) => `
            <div class="linked-row">
              <button type="button" data-linked-id="${linkedNote.id}">
                <div class="linked-meta">
                  <strong>${escapeHtml(linkedNote.title)}</strong>
                  <span>${escapeHtml(linkedNote.summary || linkedNote.plainText || '')}</span>
                </div>
              </button>
            </div>
          `
        )
        .join('')
    : '';

  elements.attachmentCount.textContent = String(state.attachments.length);
  elements.attachments.innerHTML = state.attachments.length
    ? state.attachments
        .map(
          (attachment) => `
            <div class="resource-row">
              <button type="button" data-attachment-name="${escapeAttribute(attachment.fileName)}">
                <div class="resource-meta">
                  <strong>${escapeHtml(attachment.fileName)}</strong>
                  <span>${escapeHtml(attachment.mimeType)}</span>
                </div>
              </button>
            </div>
          `
        )
        .join('')
    : '';
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

function handleFormat(format) {
  if (!currentEditorHost) {
    return;
  }
  void currentEditorHost.run(format);
  void currentEditorHost.focus();
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
      const note = state.allNotes.find((item) => item.id === targetId);
      if (!note) {
        return;
      }
      startTreeEditor({ mode: 'rename-note', targetId: note.id, value: note.title });
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
      const note = state.allNotes.find((item) => item.id === targetId);
      if (!note) {
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
  const folderButton = target.closest('[data-folder-id]');
  if (folderButton?.dataset.folderId) {
    return { kind: 'folder', id: folderButton.dataset.folderId };
  }

  const materialsSection = target.closest('[data-materials-section]');
  if (materialsSection) {
    return { kind: 'materials', id: null };
  }

  return null;
}

function canDropOnTarget(dragState, dropTarget) {
  if (!dragState.activeKind || !dragState.activeId || !dropTarget) {
    return false;
  }

  if (dragState.activeKind === 'folder') {
    if (dropTarget.kind === 'materials') {
      return Boolean(state.foldersById[dragState.activeId]?.parentId);
    }

    if (dropTarget.kind !== 'folder') {
      return false;
    }

    if (dropTarget.id === dragState.activeId) {
      return false;
    }

    let cursor = state.foldersById[dropTarget.id] ?? null;
    while (cursor) {
      if (cursor.id === dragState.activeId) {
        return false;
      }
      cursor = cursor.parentId ? state.foldersById[cursor.parentId] : null;
    }

    return state.foldersById[dragState.activeId]?.parentId !== dropTarget.id;
  }

  if (dragState.activeKind === 'note') {
    const note = state.allNotes.find((item) => item.id === dragState.activeId);
    if (!note) {
      return false;
    }

    if (dropTarget.kind === 'materials') {
      return note.folderId !== null;
    }

    return dropTarget.kind === 'folder' && note.folderId !== dropTarget.id;
  }

  return false;
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
    const created = await fetchJson('/api/knowledge/folders', {
      method: 'POST',
      body: JSON.stringify({
        spaceId: state.currentSpaceId,
        parentId,
        name
      })
    });

    if (parentId) {
      state.openFolders[parentId] = true;
    }
    state.selectedFolderId = created.data.id;
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
    await fetchJson(`/api/knowledge/folders/${encodeURIComponent(folderId)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        name,
        parentId: folder?.parentId ?? null
      })
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
    await fetchJson(`/api/knowledge/folders/${encodeURIComponent(folderId)}`, {
      method: 'DELETE'
    });
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
    await fetchJson(`/api/knowledge/folders/${encodeURIComponent(folderId)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        name: folder?.name,
        parentId: nextParentId
      })
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
    const created = await fetchJson('/api/knowledge/notes', {
      method: 'POST',
      body: JSON.stringify({
        title,
        rawMarkdown: `# ${title}\n\n`,
        folderId,
        spaceId: state.currentSpaceId,
        sourceType: 'manual',
        status: 'draft'
      })
    });

    state.selectedNoteId = created.data.id;
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
    await fetchJson(`/api/knowledge/notes/${encodeURIComponent(noteId)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        title
      })
    });
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
    await fetchJson(`/api/knowledge/notes/${encodeURIComponent(noteId)}`, {
      method: 'DELETE'
    });
    if (state.selectedNoteId === noteId) {
      state.selectedNoteId = null;
    }
    await refreshKnowledgeData();
    await loadCurrentNoteSideData();
    renderAll();
    return;
  }

  state.allNotes = deleteLocalNoteEntry(state.allNotes, noteId);
  if (state.selectedNoteId === noteId) {
    state.selectedNoteId = null;
  }
  syncLocalWorkspace();
}

async function moveNote(noteId, nextFolderId) {
  if (state.dataMode === 'api') {
    const note = state.allNotes.find((item) => item.id === noteId);
    await fetchJson(`/api/knowledge/notes/${encodeURIComponent(noteId)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        title: note?.title,
        folderId: nextFolderId
      })
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
  state.selectedFolderId = folderId;

  const visibleNotes = getVisibleNotes();
  if (visibleNotes.length === 0) {
    state.selectedNoteId = null;
    state.linkedNotes = [];
    state.attachments = [];
    state.draftMarkdown = '';
    renderAll();
    flashStatus(`已切换到目录：${state.foldersById[folderId]?.name ?? ''}`);
    return;
  }

  const currentNoteStillVisible = visibleNotes.some((note) => note.id === state.selectedNoteId);
  if (!currentNoteStillVisible) {
    state.selectedNoteId = visibleNotes[0].id;
    state.openNoteTabs = ensureOpenTab(state.openNoteTabs, visibleNotes[0].id);
    state.draftMarkdown = visibleNotes[0].rawMarkdown ?? '';
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
  renderAll();
  flashStatus(`已切换到：${note.title}`);
}

function toggleFolderOpen(folderId) {
  state.openFolders[folderId] = !(state.openFolders[folderId] ?? true);
  renderFolders();
}

function openFolderBranch(folderId) {
  let cursor = state.foldersById[folderId] ?? null;
  while (cursor) {
    state.openFolders[cursor.id] = true;
    cursor = cursor.parentId ? state.foldersById[cursor.parentId] : null;
  }
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
        flashStatus('\u5df2\u590d\u5236\u7b14\u8bb0\u8def\u5f84');
        return;
      } catch (error) {
        // Fall through to status feedback below.
      }
    }

    flashStatus(notePath || '\u672a\u627e\u5230\u7b14\u8bb0\u8def\u5f84');
  }
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
    renderEditorSaveIndicator();
    renderStatus();
  })().catch((error) => {
    pendingEditorNoteId = null;
    flashStatus(error.message || '编辑器加载失败');
  });
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
      const payload = await fetchJson(`/api/knowledge/notes/${encodeURIComponent(note.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: nextTitle,
          rawMarkdown: nextMarkdown
        })
      });
      updatedNote = payload.data;
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
  return state.allNotes.filter((note) => isNoteVisible(note) && matchesSearch(note.title));
}

function getDirectNotesForFolder(folderId) {
  return state.allNotes.filter((note) => note.folderId === folderId);
}

function isNoteVisible(note) {
  if (!state.selectedFolderId) {
    return true;
  }
  return isFolderWithinSelection(note.folderId);
}

function isFolderWithinSelection(folderId) {
  if (!state.selectedFolderId) {
    return true;
  }
  if (!folderId) {
    return false;
  }

  let cursor = state.foldersById[folderId] ?? null;
  while (cursor) {
    if (cursor.id === state.selectedFolderId) {
      return true;
    }
    cursor = cursor.parentId ? state.foldersById[cursor.parentId] : null;
  }

  return false;
}

function matchesSearch(value) {
  if (!state.searchQuery) {
    return true;
  }

  return String(value ?? '').toLowerCase().includes(state.searchQuery);
}

function matchesFolderSearch(folder) {
  if (!state.searchQuery) {
    return true;
  }

  if (matchesSearch(folder.name)) {
    return true;
  }

  if (getDirectNotesForFolder(folder.id).some((note) => matchesSearch(note.title))) {
    return true;
  }

  return (folder.children ?? []).some((child) => matchesFolderSearch(child));
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

  return nodes.map((node) => ({
    ...node,
    children: normalizeFolderTree(node.children ?? [])
  }));
}

function normalizeNotes(notes) {
  if (!Array.isArray(notes)) {
    return [];
  }

  return notes
    .filter((note) => !note.deleted)
    .map((note) => ({
      ...note,
      tagIds: [...(note.tagIds ?? [])],
      internalLinks: [...(note.internalLinks ?? [])],
      rawMarkdown: note.rawMarkdown ?? '',
      favorite: Boolean(note.favorite)
    }));
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {})
    },
    body: options.body
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Request failed: ${response.status}`);
  }

  return payload;
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


