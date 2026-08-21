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
});

function createApi(): WorkspaceApi {
  return {
    listKnowledgeSpaces: vi.fn().mockResolvedValue([{ id: 'space-live' }]),
    createDefaultKnowledgeSpace: vi.fn().mockResolvedValue({ id: 'space-live' }),
    loadWorkspaceResources: vi.fn().mockResolvedValue({
      folderTree: [],
      notes: [{
        id: 'live-note', title: 'Live', folderId: null, tagIds: [], internalLinks: [],
        rawMarkdown: '', contentLoaded: false, favorite: false, deleted: false
      }],
      tags: []
    }),
    searchNoteIds: vi.fn().mockResolvedValue([])
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
