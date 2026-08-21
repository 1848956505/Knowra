import {
  createBackendSnapshot,
  flattenFolderTree,
  isWorkspaceWritable,
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
    canWriteWorkspace: () => isWorkspaceWritable(get().dataMode)
  };
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
