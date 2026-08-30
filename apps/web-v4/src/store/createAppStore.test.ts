import {
  createBackendSnapshot,
  createEmptyWorkspaceSnapshot,
  guardWorkspaceWrite,
  type KeyValueStorage,
  type WorkspaceApi
} from '@study-accelerator/web-core';
import { createAppStore } from './createAppStore';

describe('single V4 application store', () => {
  it('exposes serializable save failure state', () => {
    const store = createAppStore({
      api: createApi(),
      cacheKey: 'workspace',
      mockSnapshot: createEmptyWorkspaceSnapshot()
    });

    store.getState().beginSave();
    expect(store.getState().saveState).toBe('saving');
    store.getState().failSave(new Error('写入被拒绝'));
    expect(store.getState().saveState).toBe('error');
    expect(store.getState().saveError).toBe('写入被拒绝');
    expect(store.getState().saveError).not.toBeInstanceOf(Error);
  });

  it('shows compatible cache first, then replaces it with normalized live data', async () => {
    const storage = createStorage();
    storage.setItem('workspace', JSON.stringify(createBackendSnapshot({
      spaces: [{ id: 'space-cache' }],
      currentSpaceId: 'space-cache',
      folderTree: [],
      tags: [],
      allNotes: [{
        id: 'cached-note', title: 'Cached', folderId: null, tagIds: [], internalLinks: [],
        rawMarkdown: '', contentLoaded: false, favorite: false, deleted: false
      }]
    })));
    const deferred = createDeferred<ReturnType<WorkspaceApi['listKnowledgeSpaces']> extends Promise<infer T> ? T : never>();
    const api = createApi();
    vi.mocked(api.listKnowledgeSpaces).mockReturnValue(deferred.promise);
    const store = createAppStore({ api, storage, cacheKey: 'workspace', mockSnapshot: createEmptyWorkspaceSnapshot() });

    const loading = store.getState().loadWorkspace();
    expect(store.getState().dataMode).toBe('cache');
    expect(store.getState().serverData.notes[0]?.id).toBe('cached-note');

    deferred.resolve([{ id: 'space-live' }]);
    await loading;
    expect(store.getState().dataMode).toBe('api');
    expect(store.getState().serverData.notes[0]?.id).toBe('live-note');
    expect(JSON.parse(storage.getItem('workspace') ?? '{}').currentSpaceId).toBe('space-live');
  });

  it('keeps cache read-only when live loading fails', async () => {
    const storage = createStorage();
    storage.setItem('workspace', JSON.stringify(createBackendSnapshot({
      folderTree: [], allNotes: [], spaces: [], tags: []
    })));
    const api = createApi();
    vi.mocked(api.listKnowledgeSpaces).mockRejectedValue(new Error('offline'));
    const store = createAppStore({ api, storage, cacheKey: 'workspace', mockSnapshot: createEmptyWorkspaceSnapshot() });

    await store.getState().loadWorkspace();
    expect(store.getState().dataMode).toBe('cache');
    expect(store.getState().workspaceError).toBe('offline');
    expect(store.getState().canWriteWorkspace()).toBe(false);
    const messages: string[] = [];
    expect(guardWorkspaceWrite({ dataMode: store.getState().dataMode, flashStatus: (value) => messages.push(value) })).toBe(false);
    expect(messages[0]).toContain('只读缓存');
  });

  it('keeps serializable state free of editor engines and DOM nodes', () => {
    const state = createAppStore({
      api: createApi(),
      cacheKey: 'workspace',
      mockSnapshot: createEmptyWorkspaceSnapshot()
    }).getState();
    expect('editorEngine' in state).toBe(false);
    expect('element' in state).toBe(false);
    expect(() => JSON.stringify({
      serverData: state.serverData,
      navigation: state.navigation,
      dataMode: state.dataMode,
      workspaceLoadState: state.workspaceLoadState,
      workspaceError: state.workspaceError,
      statusMessage: state.statusMessage
    })).not.toThrow();
  });

  it('reuses the workspace API for sidebar create and recycle-bin actions', async () => {
    const api = createApi();
    vi.mocked(api.createNote).mockResolvedValue({
      id: 'created-note', title: '新笔记', folderId: null, tagIds: [], internalLinks: [],
      rawMarkdown: '', contentLoaded: true, favorite: false, deleted: false
    });
    vi.mocked(api.createFolder).mockResolvedValue({
      id: 'created-folder', name: '新文件夹', parentId: null, children: []
    });
    vi.mocked(api.emptyRecycleBin).mockResolvedValue({ deletedCount: 2 });
    const store = createAppStore({
      api,
      cacheKey: 'workspace',
      mockSnapshot: createEmptyWorkspaceSnapshot()
    });
    await store.getState().loadWorkspace();

    await expect(store.getState().createNote(null, '新笔记')).resolves.toBe('created-note');
    expect(api.createNote).toHaveBeenCalledWith(expect.objectContaining({
      title: '新笔记',
      folderId: null,
      spaceId: 'space-live',
      sourceType: 'manual'
    }));

    await expect(store.getState().createFolder(null, '新文件夹')).resolves.toBe('created-folder');
    expect(api.createFolder).toHaveBeenCalledWith({
      name: '新文件夹',
      parentId: null,
      spaceId: 'space-live'
    });

    await expect(store.getState().emptyRecycleBin()).resolves.toBe(2);
    expect(api.emptyRecycleBin).toHaveBeenCalledWith('space-live');
  });

  it('reuses legacy mutations for folder and note context-menu actions', async () => {
    const api = createApi();
    const store = createAppStore({
      api,
      cacheKey: 'workspace-context-actions',
      mockSnapshot: createEmptyWorkspaceSnapshot()
    });
    await store.getState().loadWorkspace();

    await store.getState().renameFolder('folder-1', '资料归档');
    expect(api.updateFolder).toHaveBeenCalledWith('folder-1', {
      name: '资料归档',
      parentId: null
    });

    await store.getState().renameNote('live-note', '重命名笔记');
    expect(api.updateNote).toHaveBeenCalledWith('live-note', { title: '重命名笔记' });

    await store.getState().setNoteFavorite('live-note', true);
    expect(api.setNoteFavorite).toHaveBeenCalledWith('live-note', true);

    store.getState().selectNote('live-note');
    await store.getState().deleteNote('live-note');
    expect(api.deleteNote).toHaveBeenCalledWith('live-note');
    expect(store.getState().notesIndex.scope).toBe('trash');

    await store.getState().deleteFolder('folder-1');
    expect(api.deleteFolder).toHaveBeenCalledWith('folder-1');
  });

  it('closes editor tabs with a deterministic adjacent fallback', async () => {
    const api = createApi();
    vi.mocked(api.loadWorkspaceResources).mockResolvedValue({
      folderTree: [],
      notes: [
        { id: 'note-a', title: 'A', folderId: null, tagIds: [], internalLinks: [], rawMarkdown: '', contentLoaded: true, favorite: false, deleted: false },
        { id: 'note-b', title: 'B', folderId: null, tagIds: [], internalLinks: [], rawMarkdown: '', contentLoaded: true, favorite: false, deleted: false },
        { id: 'note-c', title: 'C', folderId: null, tagIds: [], internalLinks: [], rawMarkdown: '', contentLoaded: true, favorite: false, deleted: false }
      ],
      tags: []
    });
    const store = createAppStore({ api, cacheKey: 'workspace-tabs', mockSnapshot: createEmptyWorkspaceSnapshot() });
    await store.getState().loadWorkspace();
    store.getState().selectNote('note-a');
    store.getState().selectNote('note-b');
    store.getState().selectNote('note-c');

    expect(store.getState().closeNoteTab('note-b')).toBe('note-c');
    expect(store.getState().navigation.openNoteTabs).toEqual(['note-a', 'note-c']);
    expect(store.getState().closeNoteTab('note-c')).toBe('note-a');
    expect(store.getState().navigation.selectedNoteId).toBe('note-a');
    expect(store.getState().closeNoteTab('note-a')).toBeNull();
  });

  it('loads note detail once and saves markdown through the existing note endpoint', async () => {
    const api = createApi();
    vi.mocked(api.getNote).mockResolvedValue({
      id: 'live-note', title: 'Live', folderId: null, tagIds: [], internalLinks: [],
      rawMarkdown: '# 正文', contentLoaded: true, favorite: false, deleted: false
    });
    vi.mocked(api.updateNote).mockResolvedValue({
      id: 'live-note', title: 'Live', folderId: null, tagIds: [], internalLinks: [],
      rawMarkdown: '# 已编辑', contentLoaded: true, favorite: false, deleted: false
    });
    const store = createAppStore({ api, cacheKey: 'workspace-editor', mockSnapshot: createEmptyWorkspaceSnapshot() });
    await store.getState().loadWorkspace();

    await store.getState().loadNoteContent('live-note');
    await store.getState().loadNoteContent('live-note');
    expect(api.getNote).toHaveBeenCalledTimes(1);
    expect(store.getState().serverData.notes[0]?.rawMarkdown).toBe('# 正文');

    await store.getState().saveNoteContent('live-note', '# 已编辑');
    expect(api.updateNote).toHaveBeenCalledWith('live-note', { rawMarkdown: '# 已编辑' });
    expect(store.getState().serverData.notes[0]?.rawMarkdown).toBe('# 已编辑');
  });

  it('duplicates a saved note through the existing create-note endpoint', async () => {
    const api = createApi();
    vi.mocked(api.loadWorkspaceResources)
      .mockResolvedValueOnce({
        folderTree: [{ id: 'folder-1', name: '资料', parentId: null, children: [] }],
        notes: [{
          id: 'live-note', title: 'Live', folderId: 'folder-1', tagIds: [], internalLinks: [],
          rawMarkdown: '# 正文', contentLoaded: true, favorite: false, deleted: false,
          sourceType: 'manual', status: 'draft'
        }],
        tags: []
      })
      .mockResolvedValueOnce({
        folderTree: [{ id: 'folder-1', name: '资料', parentId: null, children: [] }],
        notes: [{
          id: 'copy-note', title: 'Live Copy', folderId: 'folder-1', tagIds: [], internalLinks: [],
          rawMarkdown: '# 正文', contentLoaded: true, favorite: false, deleted: false
        }],
        tags: []
      });
    vi.mocked(api.createNote).mockResolvedValue({
      id: 'copy-note', title: 'Live Copy', folderId: 'folder-1', tagIds: [], internalLinks: [],
      rawMarkdown: '# 正文', contentLoaded: true, favorite: false, deleted: false
    });
    const store = createAppStore({ api, cacheKey: 'workspace-save-as', mockSnapshot: createEmptyWorkspaceSnapshot() });
    await store.getState().loadWorkspace();

    await expect(store.getState().duplicateNote('live-note')).resolves.toBe('copy-note');
    expect(api.createNote).toHaveBeenCalledWith({
      title: 'Live Copy',
      rawMarkdown: '# 正文',
      folderId: 'folder-1',
      spaceId: 'space-live',
      sourceType: 'manual',
      status: 'draft'
    });
    expect(store.getState().navigation.selectedNoteId).toBe('copy-note');
  });

  it('imports Markdown through the existing batch endpoint and opens the first note', async () => {
    const api = createApi();
    vi.mocked(api.loadWorkspaceResources)
      .mockResolvedValueOnce({
        folderTree: [{ id: 'folder-1', name: '资料', parentId: null, children: [] }],
        notes: [{
          id: 'live-note', title: 'Live', folderId: null, tagIds: [], internalLinks: [],
          rawMarkdown: '', contentLoaded: false, favorite: false, deleted: false
        }],
        tags: []
      })
      .mockResolvedValueOnce({
        folderTree: [{ id: 'folder-1', name: '资料', parentId: null, children: [] }],
        notes: [{
          id: 'import-a', title: 'Live 2', folderId: null, tagIds: [], internalLinks: [],
          rawMarkdown: '', contentLoaded: false, favorite: false, deleted: false
        }],
        tags: []
      });
    vi.mocked(api.importMarkdownNotes).mockResolvedValue([
      { id: 'import-a', title: 'Live 2', folderId: null, tagIds: [], internalLinks: [], rawMarkdown: '# Live', contentLoaded: true, favorite: false, deleted: false },
      { id: 'import-b', title: 'Second', folderId: null, tagIds: [], internalLinks: [], rawMarkdown: '# Second', contentLoaded: true, favorite: false, deleted: false }
    ]);
    const store = createAppStore({ api, cacheKey: 'workspace-import', mockSnapshot: createEmptyWorkspaceSnapshot() });
    await store.getState().loadWorkspace();

    await expect(store.getState().importMarkdownNotes(null, [
      { fileName: 'first.md', rawMarkdown: '# Live' },
      { fileName: 'second.md', rawMarkdown: '# Second' }
    ])).resolves.toEqual({ firstNoteId: 'import-a', count: 2 });
    expect(api.importMarkdownNotes).toHaveBeenCalledWith([
      expect.objectContaining({ title: 'Live 2', rawMarkdown: '# Live', folderId: null, spaceId: 'space-live' }),
      expect.objectContaining({ title: 'Second', rawMarkdown: '# Second', folderId: null, spaceId: 'space-live' })
    ]);
    expect(store.getState().navigation.selectedNoteId).toBe('import-a');
  });

  it('persists close-other and drag reorder tab actions', async () => {
    const storage = createStorage();
    const api = createApi();
    vi.mocked(api.loadWorkspaceResources).mockResolvedValue({
      folderTree: [], tags: [], notes: ['a', 'b', 'c'].map((id) => ({
        id, title: id, folderId: null, tagIds: [], internalLinks: [], rawMarkdown: '',
        contentLoaded: true, favorite: false, deleted: false
      }))
    });
    const store = createAppStore({ api, storage, cacheKey: 'workspace-tab-actions', mockSnapshot: createEmptyWorkspaceSnapshot() });
    await store.getState().loadWorkspace();
    store.getState().selectNote('b');
    store.getState().selectNote('c');
    store.getState().reorderNoteTabs('c', 'a');
    expect(store.getState().navigation.openNoteTabs).toEqual(['c', 'a', 'b']);
    store.getState().closeOtherNoteTabs('a');
    expect(store.getState().navigation.openNoteTabs).toEqual(['a']);
    expect(JSON.parse(storage.getItem('workspace-tab-actions') ?? '{}').openNoteTabs).toEqual(['a']);
  });
});

function createApi(): WorkspaceApi {
  return {
    listKnowledgeSpaces: vi.fn().mockResolvedValue([{ id: 'space-live' }]),
    createDefaultKnowledgeSpace: vi.fn().mockResolvedValue({ id: 'space-live' }),
    loadWorkspaceResources: vi.fn().mockResolvedValue({
      folderTree: [{ id: 'folder-1', name: '资料', parentId: null, children: [] }],
      notes: [{
        id: 'live-note', title: 'Live', folderId: null, tagIds: [], internalLinks: [],
        rawMarkdown: '', contentLoaded: false, favorite: false, deleted: false
      }],
      tags: []
    }),
    searchNoteIds: vi.fn().mockResolvedValue([]),
    createNote: vi.fn().mockResolvedValue({ id: 'created-note' }),
    importMarkdownNotes: vi.fn().mockResolvedValue([{ id: 'imported-note' }]),
    getNote: vi.fn().mockResolvedValue({ id: 'live-note' }),
    createFolder: vi.fn().mockResolvedValue({ id: 'created-folder' }),
    updateNote: vi.fn().mockResolvedValue({ id: 'live-note' }),
    deleteNote: vi.fn().mockResolvedValue({ id: 'live-note' }),
    setNoteFavorite: vi.fn().mockResolvedValue({ id: 'live-note' }),
    updateFolder: vi.fn().mockResolvedValue({ id: 'folder-1' }),
    deleteFolder: vi.fn().mockResolvedValue([]),
    emptyRecycleBin: vi.fn().mockResolvedValue({ deletedCount: 0 })
  };
}

function createStorage(): KeyValueStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}
