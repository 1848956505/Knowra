import {
  createDuplicateTitle,
  buildMarkdownImportItems,
  createBackendSnapshot,
  flattenFolderTree,
  mergeWorkspaceSnapshots,
  normalizeFolderTree,
  normalizeNotes,
  readWorkspaceCache,
  replaceNoteInCollection,
  writeWorkspaceCache,
  type Note,
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
  tags: [],
  tagGroups: []
};

export function createWorkspaceSlice(
  set: SetStore,
  get: GetStore,
  dependencies: WorkspaceDependencies
): WorkspaceSlice {
  let activeLoad: Promise<void> | null = null;
  const noteSaveQueues = new Map<string, Promise<Note>>();

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
    async importMarkdownNotes(folderId, sources) {
      return executeWorkspaceMutation(set, get, '正在导入 Markdown…', async (spaceId) => {
        const state = get();
        const folderNames = (folderId
          ? state.serverData.foldersById[folderId]?.children ?? []
          : state.serverData.folderTree).map((folder) => folder.name);
        const noteNames = state.serverData.notes
          .filter((note) => !note.deleted && note.folderId === folderId)
          .map((note) => note.title);
        const items = buildMarkdownImportItems(sources, [...folderNames, ...noteNames]).map((item) => ({
          ...item,
          folderId,
          spaceId,
          status: 'draft'
        }));
        const imported = await dependencies.api.importMarkdownNotes(items);
        const firstNote = imported[0];
        if (!firstNote?.id) throw new Error('导入结果中没有可打开的笔记');
        await runLoad(true);
        get().selectNote(firstNote.id);
        return {
          result: { firstNoteId: firstNote.id, count: imported.length },
          message: imported.length === 1
            ? `已导入 Markdown：${firstNote.title}`
            : `已导入 ${imported.length} 个 Markdown 文件`
        };
      });
    },
    async duplicateNote(noteId) {
      return executeWorkspaceMutation(set, get, '正在另存笔记…', async (spaceId) => {
        let source = get().serverData.notes.find((note) => note.id === noteId && !note.deleted);
        if (!source) throw new Error('笔记不存在或已被删除');
        if (!source.contentLoaded) {
          const loaded = await dependencies.api.getNote(noteId);
          updateNoteInStore(set, get, dependencies, loaded, { ...source, contentLoaded: true });
          source = get().serverData.notes.find((note) => note.id === noteId && !note.deleted) ?? source;
        }
        const folderNames = (source.folderId
          ? get().serverData.foldersById[source.folderId]?.children ?? []
          : get().serverData.folderTree).map((folder) => folder.name);
        const noteNames = get().serverData.notes
          .filter((note) => !note.deleted && note.folderId === source.folderId)
          .map((note) => note.title);
        const nextTitle = createDuplicateTitle([...folderNames, ...noteNames], source.title);
        const created = await dependencies.api.createNote({
          title: nextTitle,
          rawMarkdown: source.rawMarkdown,
          folderId: source.folderId,
          spaceId,
          sourceType: source.sourceType ?? 'manual',
          status: source.status ?? 'draft'
        });
        await runLoad(true);
        get().selectNote(created.id);
        return { result: created.id, message: `已另存为：${nextTitle}` };
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
    async loadNoteContent(noteId) {
      const current = get().serverData.notes.find((note) => note.id === noteId);
      if (!current || current.contentLoaded) return;
      try {
        const loaded = await dependencies.api.getNote(noteId);
        updateNoteInStore(set, get, dependencies, loaded, {
          ...current,
          contentLoaded: true
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : '笔记正文加载失败';
        set({ saveError: message, statusMessage: message });
        throw error;
      }
    },
    async saveNoteContent(noteId, rawMarkdown, expectedUpdatedAt) {
      const previousSave = noteSaveQueues.get(noteId) ?? Promise.resolve(undefined);
      const currentSave = previousSave
        .catch(() => undefined)
        .then(async () => {
          const current = get().serverData.notes.find((note) => note.id === noteId);
          if (!current) throw new Error('笔记不存在或已被删除');
          if (current.rawMarkdown === rawMarkdown) return current;
          return executeWorkspaceMutation(set, get, '正在保存正文…', async () => {
            const concurrencyToken = expectedUpdatedAt ?? current.updatedAt;
            const updated = await dependencies.api.updateNote(noteId, {
              rawMarkdown,
              ...(concurrencyToken ? { expectedUpdatedAt: concurrencyToken } : {})
            });
            updateNoteInStore(set, get, dependencies, updated, {
              ...current,
              rawMarkdown,
              contentLoaded: true
            });
            const saved = get().serverData.notes.find((note) => note.id === noteId) ?? current;
            return { result: saved, message: '正文已保存' };
          });
        });
      noteSaveQueues.set(noteId, currentSave);
      try {
        return await currentSave;
      } finally {
        if (noteSaveQueues.get(noteId) === currentSave) noteSaveQueues.delete(noteId);
      }
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
    async restoreNote(noteId) {
      return executeWorkspaceMutation(set, get, '正在恢复笔记…', async () => {
        await dependencies.api.restoreNote(noteId);
        await runLoad(true);
        get().selectNotesScope('trash');
        return { result: undefined, message: '笔记已恢复' };
      });
    },
    async permanentlyDeleteNote(noteId) {
      return executeWorkspaceMutation(set, get, '正在彻底删除笔记…', async () => {
        await dependencies.api.permanentlyDeleteNote(noteId);
        await runLoad(true);
        get().selectNotesScope('trash');
        return { result: undefined, message: '笔记已彻底删除' };
      });
    },
    async setNoteFavorite(noteId, favorite) {
      return executeWorkspaceMutation(set, get, favorite ? '正在收藏笔记…' : '正在取消收藏…', async () => {
        await dependencies.api.setNoteFavorite(noteId, favorite);
        await runLoad(true);
        return { result: undefined, message: favorite ? '笔记已收藏' : '已取消收藏' };
      });
    },
    async setNoteTags(noteId, tagIds) {
      return executeWorkspaceMutation(set, get, '正在更新标签…', async () => {
        await dependencies.api.setNoteTags(noteId, tagIds);
        await runLoad(true);
        return { result: undefined, message: '笔记标签已更新' };
      });
    },
    async createTag(input) {
      return executeWorkspaceMutation(set, get, '正在新建标签…', async (spaceId) => {
        const tag = await dependencies.api.createTag({ ...input, spaceId });
        await runLoad(true);
        return { result: tag, message: `已新建标签：${tag.name ?? input.name}` };
      });
    },
    async updateTag(tagId, input) {
      return executeWorkspaceMutation(set, get, '正在更新标签…', async () => {
        const tag = await dependencies.api.updateTag(tagId, input);
        await runLoad(true);
        return { result: tag, message: '标签已更新' };
      });
    },
    async deleteTag(tagId) {
      return executeWorkspaceMutation(set, get, '正在删除标签…', async () => {
        await dependencies.api.deleteTag(tagId);
        await runLoad(true);
        return { result: undefined, message: '标签已删除' };
      });
    },
    async mergeTags(sourceTagId, targetTagId) {
      return executeWorkspaceMutation(set, get, '正在合并标签…', async () => {
        await dependencies.api.mergeTags(sourceTagId, targetTagId);
        await runLoad(true);
        return { result: undefined, message: '标签已合并' };
      });
    },
    async reorderTags(tagIds) {
      return executeWorkspaceMutation(set, get, '正在调整标签顺序…', async () => {
        await dependencies.api.reorderTags(tagIds);
        await runLoad(true);
        return { result: undefined, message: '标签顺序已更新' };
      });
    },
    async createTagGroup(input) {
      return executeWorkspaceMutation(set, get, '正在新建标签分组…', async (spaceId) => {
        const group = await dependencies.api.createTagGroup({ ...input, spaceId });
        await runLoad(true);
        return { result: group, message: `已新建分组：${group.name}` };
      });
    },
    async updateTagGroup(groupId, input) {
      return executeWorkspaceMutation(set, get, '正在更新标签分组…', async () => {
        const group = await dependencies.api.updateTagGroup(groupId, input);
        await runLoad(true);
        return { result: group, message: '标签分组已更新' };
      });
    },
    async deleteTagGroup(groupId) {
      return executeWorkspaceMutation(set, get, '正在删除标签分组…', async () => {
        await dependencies.api.deleteTagGroup(groupId);
        await runLoad(true);
        return { result: undefined, message: '标签分组已删除' };
      });
    },
    async deleteNotes(noteIds) {
      return executeWorkspaceMutation(set, get, '正在批量删除笔记…', async () => {
        await dependencies.api.deleteNotes(noteIds);
        await runLoad(true);
        return { result: undefined, message: `已将 ${noteIds.length} 篇笔记移入回收站` };
      });
    },
    async assignTagToNotes(noteIds, tagId) {
      return executeWorkspaceMutation(set, get, '正在批量添加标签…', async () => {
        await dependencies.api.assignTagToNotes(noteIds, tagId);
        await runLoad(true);
        return { result: undefined, message: `已为 ${noteIds.length} 篇笔记添加标签` };
      });
    },
    async updateTagsForNotes(noteIds, addTagIds, removeTagIds) {
      return executeWorkspaceMutation(set, get, '正在批量更新标签…', async () => {
        await dependencies.api.updateTagsForNotes(noteIds, addTagIds, removeTagIds);
        await runLoad(true);
        return { result: undefined, message: `已更新 ${noteIds.length} 篇笔记的标签` };
      });
    },
    async queryNotes(input) {
      const spaceId = get().serverData.currentSpaceId;
      if (!spaceId) return { items: [], hasNext: false };
      return dependencies.api.queryNotes({ ...input, spaceId });
    },
    async getLinkedNotes(noteId) {
      return dependencies.api.getLinkedNotes(noteId);
    },
    async listAnnotations(noteId) {
      const spaceId = get().serverData.currentSpaceId;
      if (!spaceId) return [];
      return dependencies.api.listAnnotations(noteId, spaceId);
    },
    async createAnnotation(input) {
      return executeWorkspaceMutation(set, get, '正在创建正文标注…', async () => ({
        result: await dependencies.api.createAnnotation(input),
        message: '已标记为重要内容'
      }));
    },
    async deleteAnnotation(annotationId) {
      return executeWorkspaceMutation(set, get, '正在删除正文标注…', async () => ({
        result: await dependencies.api.deleteAnnotation(annotationId),
        message: '正文标注已归档'
      }));
    },
    async restoreAnnotation(annotationId) {
      return executeWorkspaceMutation(set, get, '正在恢复正文标注…', async () => ({
        result: await dependencies.api.restoreAnnotation(annotationId),
        message: '正文标注已恢复'
      }));
    },
    async updateAnnotationAnchor(annotationId, input) {
      return executeWorkspaceMutation(set, get, '正在重新定位正文标注…', async () => ({
        result: await dependencies.api.updateAnnotationAnchor(annotationId, input),
        message: '正文标注位置已更新'
      }));
    },
    async listNoteVersions(noteId) {
      return dependencies.api.listNoteVersions(noteId);
    },
    async getNoteVersion(noteId, versionId) {
      return dependencies.api.getNoteVersion(noteId, versionId);
    },
    async organizeNote(noteId, input) {
      return executeWorkspaceMutation(set, get, '正在整理笔记…', async () => {
        await dependencies.api.updateNote(noteId, input);
        await runLoad(true);
        return { result: undefined, message: '笔记位置和状态已更新' };
      });
    },
    async listNoteAttachments(noteId) {
      return dependencies.api.listNoteAttachments(noteId);
    },
    async uploadNoteAttachment(input) {
      return executeWorkspaceMutation(set, get, '正在上传附件…', async () => ({
        result: await dependencies.api.uploadNoteAttachment(input),
        message: '附件已上传'
      }));
    },
    async renameNoteAttachment(attachmentId, fileName) {
      return executeWorkspaceMutation(set, get, '正在重命名附件…', async () => ({
        result: await dependencies.api.renameNoteAttachment(attachmentId, fileName),
        message: '附件已重命名'
      }));
    },
    async deleteNoteAttachment(attachmentId) {
      return executeWorkspaceMutation(set, get, '正在删除附件…', async () => {
        await dependencies.api.deleteNoteAttachment(attachmentId);
        return { result: undefined, message: '附件已删除' };
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

function updateNoteInStore(
  set: SetStore,
  get: GetStore,
  dependencies: WorkspaceDependencies,
  updatedNote: unknown,
  fallbackFields: Record<string, unknown>
): void {
  const state = get();
  const notes = replaceNoteInCollection(state.serverData.notes, updatedNote, fallbackFields);
  set({ serverData: { ...state.serverData, notes } });
  const nextState = get();
  writeWorkspaceCache(dependencies.storage, dependencies.cacheKey, createBackendSnapshot({
    spaces: nextState.serverData.spaces,
    currentSpaceId: nextState.serverData.currentSpaceId,
    folderTree: nextState.serverData.folderTree,
    tags: nextState.serverData.tags,
    tagGroups: nextState.serverData.tagGroups,
    allNotes: notes,
    ...nextState.navigation
  }));
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
      tagGroups: resources.tagGroups ?? [],
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
      tags: snapshot.tags,
      tagGroups: snapshot.tagGroups ?? []
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
