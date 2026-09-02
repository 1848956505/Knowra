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

  it('connects single-note recycle actions, tag editing and version reads', async () => {
    const api = createApi();
    const version = {
      id: 'version-1', noteId: 'live-note', content: '# 第一版', contentHash: 'a'.repeat(64),
      createdAt: '2026-09-01T09:00:00.000Z', createdBy: 'user'
    };
    vi.mocked(api.listNoteVersions).mockResolvedValue([version]);
    vi.mocked(api.getNoteVersion).mockResolvedValue(version);
    const store = createAppStore({
      api,
      cacheKey: 'workspace-p0-note-actions',
      mockSnapshot: createEmptyWorkspaceSnapshot()
    });
    await store.getState().loadWorkspace();

    await store.getState().restoreNote('live-note');
    expect(api.restoreNote).toHaveBeenCalledWith('live-note');
    expect(store.getState().notesIndex.scope).toBe('trash');

    await store.getState().permanentlyDeleteNote('live-note');
    expect(api.permanentlyDeleteNote).toHaveBeenCalledWith('live-note');

    await store.getState().setNoteTags('live-note', ['tag-1', 'tag-2']);
    expect(api.setNoteTags).toHaveBeenCalledWith('live-note', ['tag-1', 'tag-2']);

    await expect(store.getState().listNoteVersions('live-note')).resolves.toEqual([version]);
    await expect(store.getState().getNoteVersion('live-note', 'version-1')).resolves.toEqual(version);
  });

  it('connects note organization and attachment mutations', async () => {
    const api = createApi();
    const attachment = {
      id: 'attachment-1', noteId: 'live-note', fileName: 'diagram.png',
      mimeType: 'image/png', size: 128, status: 'ready'
    };
    vi.mocked(api.listNoteAttachments).mockResolvedValue([attachment]);
    vi.mocked(api.uploadNoteAttachment).mockResolvedValue(attachment);
    vi.mocked(api.renameNoteAttachment).mockResolvedValue({ ...attachment, fileName: 'renamed.png' });
    vi.mocked(api.deleteNoteAttachment).mockResolvedValue(attachment);
    const store = createAppStore({
      api,
      cacheKey: 'workspace-p1-note-actions',
      mockSnapshot: createEmptyWorkspaceSnapshot()
    });
    await store.getState().loadWorkspace();

    await store.getState().organizeNote('live-note', { folderId: 'folder-1', status: 'active' });
    expect(api.updateNote).toHaveBeenCalledWith('live-note', { folderId: 'folder-1', status: 'active' });
    await expect(store.getState().listNoteAttachments('live-note')).resolves.toEqual([attachment]);

    const input = { noteId: 'live-note', fileName: 'diagram.png', mimeType: 'image/png', contentBase64: 'aW1hZ2U=' };
    await expect(store.getState().uploadNoteAttachment(input)).resolves.toEqual(attachment);
    expect(api.uploadNoteAttachment).toHaveBeenCalledWith(input);
    await expect(store.getState().renameNoteAttachment('attachment-1', 'renamed.png')).resolves.toMatchObject({ fileName: 'renamed.png' });
    await store.getState().deleteNoteAttachment('attachment-1');
    expect(api.deleteNoteAttachment).toHaveBeenCalledWith('attachment-1');
  });

  it('connects P2 batch, server-query, linked-note and annotation operations', async () => {
    const api = createApi();
    const annotation = {
      id: 'annotation-1', spaceId: 'space-live', noteId: 'live-note', noteVersionId: null,
      kind: 'important' as const, sourceMode: 'manual' as const, quoteText: '重要内容', headingPath: ['结论'],
      fromPosition: 1, toPosition: 5, prefixText: '', suffixText: '', anchorFingerprint: 'fingerprint',
      noteContentHash: 'hash', idempotencyKey: 'request-1', status: 'active'
    };
    vi.mocked(api.queryNotes).mockResolvedValue({ items: [], hasNext: true });
    vi.mocked(api.getLinkedNotes).mockResolvedValue([{ id: 'linked-note', title: 'Linked', folderId: null, tagIds: [], internalLinks: [], rawMarkdown: '', contentLoaded: false, favorite: false, deleted: false }]);
    vi.mocked(api.listAnnotations).mockResolvedValue([annotation]);
    vi.mocked(api.createAnnotation).mockResolvedValue(annotation);
    vi.mocked(api.deleteAnnotation).mockResolvedValue({ ...annotation, status: 'archived' });
    vi.mocked(api.restoreAnnotation).mockResolvedValue(annotation);
    vi.mocked(api.updateAnnotationAnchor).mockResolvedValue({ ...annotation, fromPosition: 8, toPosition: 12 });
    const store = createAppStore({ api, cacheKey: 'workspace-p2-note-actions', mockSnapshot: createEmptyWorkspaceSnapshot() });
    await store.getState().loadWorkspace();

    await store.getState().deleteNotes(['live-note']);
    expect(api.deleteNotes).toHaveBeenCalledWith(['live-note']);
    await store.getState().assignTagToNotes(['live-note'], 'tag-1');
    expect(api.assignTagToNotes).toHaveBeenCalledWith(['live-note'], 'tag-1');
    await expect(store.getState().queryNotes({ limit: 30 })).resolves.toEqual({ items: [], hasNext: true });
    expect(api.queryNotes).toHaveBeenCalledWith({ limit: 30, spaceId: 'space-live' });
    await expect(store.getState().getLinkedNotes('live-note')).resolves.toHaveLength(1);
    await expect(store.getState().listAnnotations('live-note')).resolves.toEqual([annotation]);
    expect(api.listAnnotations).toHaveBeenCalledWith('live-note', 'space-live');
    await expect(store.getState().createAnnotation(annotation)).resolves.toEqual(annotation);
    await store.getState().deleteAnnotation(annotation.id);
    await store.getState().restoreAnnotation(annotation.id);
    await store.getState().updateAnnotationAnchor(annotation.id, {
      quoteText: annotation.quoteText, headingPath: annotation.headingPath, fromPosition: 8, toPosition: 12,
      prefixText: '', suffixText: '', anchorFingerprint: 'next', noteContentHash: 'next-hash'
    });
    expect(api.updateAnnotationAnchor).toHaveBeenCalledWith(annotation.id, expect.objectContaining({ fromPosition: 8 }));
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
      tags: [],
      tagGroups: []
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
      rawMarkdown: '# 正文', contentLoaded: true, favorite: false, deleted: false,
      updatedAt: '2026-08-31T01:00:00.000Z'
    });
    vi.mocked(api.updateNote).mockResolvedValue({
      id: 'live-note', title: 'Live', folderId: null, tagIds: [], internalLinks: [],
      rawMarkdown: '# 已编辑', contentLoaded: true, favorite: false, deleted: false,
      updatedAt: '2026-08-31T01:01:00.000Z'
    });
    const store = createAppStore({ api, cacheKey: 'workspace-editor', mockSnapshot: createEmptyWorkspaceSnapshot() });
    await store.getState().loadWorkspace();

    await store.getState().loadNoteContent('live-note');
    await store.getState().loadNoteContent('live-note');
    expect(api.getNote).toHaveBeenCalledTimes(1);
    expect(store.getState().serverData.notes[0]?.rawMarkdown).toBe('# 正文');

    await store.getState().saveNoteContent('live-note', '# 已编辑');
    expect(api.updateNote).toHaveBeenCalledWith('live-note', {
      rawMarkdown: '# 已编辑',
      expectedUpdatedAt: '2026-08-31T01:00:00.000Z'
    });
    expect(store.getState().serverData.notes[0]?.rawMarkdown).toBe('# 已编辑');
  });

  it('skips a content PATCH when markdown is unchanged', async () => {
    const api = createApi();
    vi.mocked(api.loadWorkspaceResources).mockResolvedValue({
      folderTree: [],
      notes: [{
        id: 'live-note', title: 'Live', folderId: null, tagIds: [], internalLinks: [],
        rawMarkdown: '相同正文', contentLoaded: true, favorite: false, deleted: false,
        updatedAt: '2026-08-31T01:00:00.000Z'
      }],
      tags: []
    });
    const store = createAppStore({ api, cacheKey: 'workspace-noop-save', mockSnapshot: createEmptyWorkspaceSnapshot() });
    await store.getState().loadWorkspace();

    await expect(store.getState().saveNoteContent('live-note', '相同正文')).resolves.toMatchObject({
      id: 'live-note',
      updatedAt: '2026-08-31T01:00:00.000Z'
    });
    expect(api.updateNote).not.toHaveBeenCalled();
  });

  it('serializes saves for the same note so an older response cannot overwrite newer text', async () => {
    const api = createApi();
    vi.mocked(api.loadWorkspaceResources).mockResolvedValue({
      folderTree: [],
      notes: [{
        id: 'live-note', title: 'Live', folderId: null, tagIds: [], internalLinks: [],
        rawMarkdown: '初始正文', contentLoaded: true, favorite: false, deleted: false,
        updatedAt: '2026-08-31T01:00:00.000Z'
      }],
      tags: []
    });
    const first = createDeferred<Awaited<ReturnType<WorkspaceApi['updateNote']>>>();
    const second = createDeferred<Awaited<ReturnType<WorkspaceApi['updateNote']>>>();
    vi.mocked(api.updateNote)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const store = createAppStore({ api, cacheKey: 'workspace-save-order', mockSnapshot: createEmptyWorkspaceSnapshot() });
    await store.getState().loadWorkspace();

    const olderSave = store.getState().saveNoteContent('live-note', '较早正文');
    const newerSave = store.getState().saveNoteContent('live-note', '最新正文');
    await vi.waitFor(() => expect(api.updateNote).toHaveBeenCalledTimes(1));

    first.resolve({
      id: 'live-note', title: 'Live', folderId: null, tagIds: [], internalLinks: [],
      rawMarkdown: '较早正文', contentLoaded: true, favorite: false, deleted: false,
      updatedAt: '2026-08-31T01:01:00.000Z'
    });
    await olderSave;
    await vi.waitFor(() => expect(api.updateNote).toHaveBeenCalledTimes(2));
    second.resolve({
      id: 'live-note', title: 'Live', folderId: null, tagIds: [], internalLinks: [],
      rawMarkdown: '最新正文', contentLoaded: true, favorite: false, deleted: false,
      updatedAt: '2026-08-31T01:02:00.000Z'
    });
    await newerSave;

    expect(api.updateNote).toHaveBeenNthCalledWith(1, 'live-note', {
      rawMarkdown: '较早正文',
      expectedUpdatedAt: '2026-08-31T01:00:00.000Z'
    });
    expect(api.updateNote).toHaveBeenNthCalledWith(2, 'live-note', {
      rawMarkdown: '最新正文',
      expectedUpdatedAt: '2026-08-31T01:01:00.000Z'
    });
    expect(store.getState().serverData.notes[0]?.rawMarkdown).toBe('最新正文');
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
    restoreNote: vi.fn().mockResolvedValue({ id: 'live-note' }),
    permanentlyDeleteNote: vi.fn().mockResolvedValue({ id: 'live-note' }),
    setNoteFavorite: vi.fn().mockResolvedValue({ id: 'live-note' }),
    setNoteTags: vi.fn().mockResolvedValue({ id: 'live-note' }),
    createTag: vi.fn(), updateTag: vi.fn(), deleteTag: vi.fn(), mergeTags: vi.fn(), reorderTags: vi.fn(),
    createTagGroup: vi.fn(), updateTagGroup: vi.fn(), deleteTagGroup: vi.fn(),
    deleteNotes: vi.fn().mockResolvedValue([]),
    assignTagToNotes: vi.fn().mockResolvedValue([]),
    updateTagsForNotes: vi.fn().mockResolvedValue([]),
    queryNotes: vi.fn().mockResolvedValue({ items: [], hasNext: false }),
    getLinkedNotes: vi.fn().mockResolvedValue([]),
    listAnnotations: vi.fn().mockResolvedValue([]),
    createAnnotation: vi.fn(),
    deleteAnnotation: vi.fn(),
    restoreAnnotation: vi.fn(),
    updateAnnotationAnchor: vi.fn(),
    listNoteVersions: vi.fn().mockResolvedValue([]),
    getNoteVersion: vi.fn().mockResolvedValue({ id: 'version-1' }),
    listNoteAttachments: vi.fn().mockResolvedValue([]),
    uploadNoteAttachment: vi.fn().mockResolvedValue({ id: 'attachment-1' }),
    renameNoteAttachment: vi.fn().mockResolvedValue({ id: 'attachment-1' }),
    deleteNoteAttachment: vi.fn().mockResolvedValue({ id: 'attachment-1' }),
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
