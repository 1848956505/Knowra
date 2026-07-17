export const BACKEND_CACHE_KEY = 'study-accelerator.backend-workspace-cache';
export const AUTOSAVE_DELAY_MS = 700;
export const SCROLL_POSITIONS_KEY = 'study-accelerator.editor-scroll-positions';

export function createInitialAppState() {
  return {
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
    attachmentRenaming: null,
    annotations: [],
    annotationLoadState: 'idle',
    focusedAnnotationId: null,
    annotationFilter: { query: '', status: 'active' },
    outlineCollapsedHeadingIdsByNote: {},
    expandedAnnotationIds: {},
    openNoteTabs: [],
    editorMenuOpen: null,
    view: {
      screen: 'index',
      mode: 'edit',
      showLeftSidebar: true,
      showRightSidebar: true,
      showSourceEditor: false
    },
    libraryIndex: {
      tab: 'all',
      page: 1,
      pageSize: 10,
      selectedNoteId: null,
      inspectorOpen: true,
      filterMenu: null,
      filters: {
        type: 'all',
        status: 'all',
        time: 'updated-desc'
      }
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
}

export function createRailItems() {
  return [
    { key: 'knowledge', active: true },
    { key: 'paper', active: false },
    { key: 'ai', active: false },
    { key: 'task', active: false },
    { key: 'review', active: false },
    { key: 'settings', active: false }
  ];
}
