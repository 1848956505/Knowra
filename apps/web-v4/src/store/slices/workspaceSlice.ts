import {
  createBackendSnapshot,
  flattenFolderTree,
  mergeWorkspaceSnapshots,
  normalizeFolderTree,
  normalizeNotes,
  readWorkspaceCache,
  writeWorkspaceCache,
  type WorkspaceDataMode,
  type WorkspaceServerData,
  type WorkspaceSnapshot
} from '@study-accelerator/web-core';
import type { AppStore, WorkspaceDependencies, WorkspaceSlice } from '../types';

type SetStore = (partial: Partial<AppStore> | ((state: AppStore) => Partial<AppStore>)) => void;
type GetStore = () => AppStore;

const emptyServerData: WorkspaceServerData = {
  spaces: [],
  currentSpaceId: null,
  folderTree: [],
  foldersById: {},
  notes: [],
  tags: []
};

export function createWorkspaceSlice(
  set: SetStore,
  get: GetStore,
  dependencies: WorkspaceDependencies
): WorkspaceSlice {
  let activeLoad: Promise<void> | null = null;

  const runLoad = async (force = false): Promise<void> => {
    if (activeLoad && !force) return activeLoad;
    activeLoad = loadWorkspace(dependencies, set).finally(() => {
      activeLoad = null;
    });
    return activeLoad;
  };

  return {
    serverData: emptyServerData,
    dataMode: 'loading',
    workspaceLoadState: 'idle',
    workspaceError: null,
    loadWorkspace: () => runLoad(false),
    retryWorkspace: () => runLoad(true),
    canWriteWorkspace: () => get().dataMode === 'api',
    async createNote(folderId, title) {
      return executeWorkspaceMutation(set, get, '正在新建笔记…', async (spaceId) => {
        const created = await dependencies.api.createNote({
          title,
          rawMarkdown: '',
          folderId,
          spaceId,
          sourceType: 'manual',
          status: 'draft'
        });
        await runLoad(true);
        get().selectNote(created.id);
        return { result: created.id, message: '笔记已创建' };
      });
    },
    async createFolder(parentId, name) {
      return executeWorkspaceMutation(set, get, '正在新建文件夹…', async (spaceId) => {
        const created = await dependencies.api.createFolder({ spaceId, parentId, name });
        await runLoad(true);
        get().selectNotesFolder(created.id);
        if (parentId && !get().navigation.openFolders[parentId]) get().toggleFolder(parentId);
        return { result: created.id, message: '文件夹已创建' };
      });
    },
    async renameNote(noteId, title) {
      return executeWorkspaceMutation(set, get, '正在重命名笔记…', async () => {
        await dependencies.api.updateNote(noteId, { title });
        await runLoad(true);
        return { result: undefined, message: '笔记已重命名' };
      });
    },
    async deleteNote(noteId) {
      return executeWorkspaceMutation(set, get, '正在删除笔记…', async () => {
        const wasSelected = get().navigation.selectedNoteId === noteId;
        await dependencies.api.deleteNote(noteId);
        await runLoad(true);
        if (wasSelected) get().selectNotesScope('trash');
        return { result: undefined, message: '笔记已移入回收站' };
      });
    },
    async setNoteFavorite(noteId, favorite) {
      return executeWorkspaceMutation(set, get, favorite ? '正在收藏笔记…' : '正在取消收藏…', async () => {
        await dependencies.api.setNoteFavorite(noteId, favorite);
        await runLoad(true);
        return { result: undefined, message: favorite ? '笔记已收藏' : '已取消收藏' };
      });
    },
    async renameFolder(folderId, name) {
      return executeWorkspaceMutation(set, get, '正在重命名文件夹…', async () => {
        const folder = get().serverData.foldersById[folderId];
        if (!folder) throw new Error('文件夹不存在或已被删除');
        await dependencies.api.updateFolder(folderId, { name, parentId: folder.parentId });
        await runLoad(true);
        return { result: undefined, message: '文件夹已重命名' };
      });
    },
    async deleteFolder(folderId) {
      return executeWorkspaceMutation(set, get, '正在删除文件夹…', async () => {
        const parentId = get().serverData.foldersById[folderId]?.parentId ?? null;
        await dependencies.api.deleteFolder(folderId);
        await runLoad(true);
        get().selectNotesFolder(parentId);
        return { result: undefined, message: '文件夹已删除，原有笔记已移至未整理' };
      });
    },
    async emptyRecycleBin() {
      return executeWorkspaceMutation(set, get, '正在清空回收站…', async (spaceId) => {
        const result = await dependencies.api.emptyRecycleBin(spaceId);
        await runLoad(true);
        get().selectNotesScope('trash');
        const deletedCount = Number(result.deletedCount ?? result.deleted ?? 0);
        return { result: deletedCount, message: `已彻底删除 ${deletedCount} 条笔记` };
      });
    }
  };
}

async function executeWorkspaceMutation<T>(
  set: SetStore,
  get: GetStore,
  pendingMessage: string,
  operation: (spaceId: string) => Promise<{ result: T; message: string }>
): Promise<T> {
  const state = get();
  if (state.dataMode !== 'api') {
    throw new Error('当前不是后端在线模式，暂时无法修改笔记库');
  }
  const spaceId = state.serverData.currentSpaceId;
  if (!spaceId) throw new Error('当前没有可用的知识空间');
  set({ saveState: 'saving', saveError: null, statusMessage: pendingMessage });
  try {
    const completed = await operation(spaceId);
    set({ saveState: 'saved', saveError: null, statusMessage: completed.message });
    return completed.result;
  } catch (error) {
    const message = error instanceof Error ? error.message : '笔记库操作失败';
    set({ saveState: 'error', saveError: message, statusMessage: message });
    throw error;
  }
}

async function loadWorkspace(dependencies: WorkspaceDependencies, set: SetStore): Promise<void> {
  const cachedSnapshot = readWorkspaceCache(dependencies.storage, dependencies.cacheKey);
  if (cachedSnapshot) {
    applySnapshot(set, cachedSnapshot, 'cache', 'loading', null, '正在刷新最近一次资料缓存…');
  } else {
    set({
      dataMode: 'loading',
      workspaceLoadState: 'loading',
      workspaceError: null,
      statusMessage: '正在连接资料服务…'
    });
  }

  try {
    let spaces = await dependencies.api.listKnowledgeSpaces();
    if (spaces.length === 0) spaces = [await dependencies.api.createDefaultKnowledgeSpace()];
    const currentSpaceId = spaces[0]?.id ?? null;
    if (!currentSpaceId) throw new Error('资料服务未返回可用知识空间。');
    const resources = await dependencies.api.loadWorkspaceResources(currentSpaceId);
    const liveSnapshot = createBackendSnapshot({
      spaces,
      currentSpaceId,
      folderTree: normalizeFolderTree(resources.folderTree),
      tags: resources.tags,
      allNotes: normalizeNotes(resources.notes)
    });
    const mergedSnapshot = mergeWorkspaceSnapshots(liveSnapshot, cachedSnapshot) ?? liveSnapshot;
    applySnapshot(set, mergedSnapshot, 'api', 'ready', null, '知识库已连接到后端数据');
    writeWorkspaceCache(dependencies.storage, dependencies.cacheKey, mergedSnapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : '资料加载失败。';
    if (cachedSnapshot) {
      applySnapshot(
        set,
        cachedSnapshot,
        'cache',
        'error',
        message,
        '后端暂时不可用，当前显示只读缓存'
      );
      return;
    }
    applySnapshot(
      set,
      dependencies.mockSnapshot,
      'local',
      'error',
      message,
      '未检测到后端，已切换到本地恢复模式'
    );
  }
}

function applySnapshot(
  set: SetStore,
  snapshot: WorkspaceSnapshot,
  dataMode: WorkspaceDataMode,
  workspaceLoadState: WorkspaceSlice['workspaceLoadState'],
  workspaceError: string | null,
  statusMessage: string
): void {
  const folderTree = normalizeFolderTree(snapshot.folderTree);
  const foldersById = flattenFolderTree(folderTree);
  const notes = normalizeNotes(snapshot.allNotes);
  const activeNoteIds = new Set(notes.filter((note) => !note.deleted).map((note) => note.id));
  const selectedFolderId = snapshot.selectedFolderId && foldersById[snapshot.selectedFolderId]
    ? snapshot.selectedFolderId
    : null;
  const selectedNoteId = snapshot.selectedNoteId && activeNoteIds.has(snapshot.selectedNoteId)
    ? snapshot.selectedNoteId
    : notes.find((note) => !note.deleted)?.id ?? null;
  const openNoteTabs = snapshot.openNoteTabs.filter((noteId) => activeNoteIds.has(noteId));
  if (selectedNoteId && !openNoteTabs.includes(selectedNoteId)) openNoteTabs.push(selectedNoteId);

  set((state) => ({
    serverData: {
      spaces: snapshot.spaces,
      currentSpaceId: snapshot.currentSpaceId,
      folderTree,
      foldersById,
      notes,
      tags: snapshot.tags
    },
    navigation: {
      ...state.navigation,
      selectedFolderId,
      selectedNoteId,
      openFolders: { ...snapshot.openFolders },
      openNoteTabs
    },
    dataMode,
    workspaceLoadState,
    workspaceError,
    statusMessage
  }));
}
