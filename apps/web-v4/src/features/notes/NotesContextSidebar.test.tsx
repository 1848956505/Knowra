import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createEmptyWorkspaceSnapshot, type WorkspaceApi } from '@study-accelerator/web-core';
import { describe, expect, it, vi } from 'vitest';
import { AppStoreProvider } from '../../store/AppStoreProvider';
import { createAppStore } from '../../store/createAppStore';
import { NotesContextSidebar } from './NotesContextSidebar';

describe('NotesContextSidebar', () => {
  it('derives counts from workspace data and switches quick filters', async () => {
    const onOpenIndex = vi.fn();
    const { store } = renderSidebar({ onOpenIndex });

    expect(screen.getByRole('button', { name: /全部笔记3/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: /收藏1/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /未整理1/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /回收站1/ })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /收藏1/ }));
    expect(store.getState().notesIndex.scope).toBe('favorites');
    expect(screen.getByRole('button', { name: /收藏1/ })).toHaveAttribute('aria-current', 'page');
    expect(onOpenIndex).toHaveBeenCalledOnce();

    await userEvent.click(screen.getByRole('button', { name: /回收站1/ }));
    expect(store.getState().notesIndex.scope).toBe('trash');
    expect(onOpenIndex).toHaveBeenCalledTimes(2);
  });

  it('exposes the note library entry before the folder tree', async () => {
    const onOpenIndex = vi.fn();
    const { store } = renderSidebar({ onOpenIndex });

    const rootEntry = screen.getByRole('button', { name: /笔记库2/ });
    const firstFolder = screen.getByRole('button', { name: /产品设计2/ });
    expect(rootEntry.compareDocumentPosition(firstFolder) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await userEvent.click(rootEntry);

    expect(store.getState().notesIndex.scope).toBe('root');
    expect(rootEntry).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: /全部笔记3/ })).not.toHaveAttribute('aria-current');
    expect(onOpenIndex).toHaveBeenCalledOnce();
  });

  it('selects folders and tags, expands note children, and delegates text search to the backend', async () => {
    const { api, store } = renderSidebar();

    const folderButton = screen.getByRole('button', { name: /产品设计2/ });
    await userEvent.click(folderButton);
    expect(store.getState().navigation.selectedFolderId).toBe('folder-1');
    expect(store.getState().notesIndex.scope).toBe('all');
    expect(store.getState().navigation.openFolders['folder-1']).toBe(true);
    expect(screen.getByRole('button', { name: '规划草案' })).toBeInTheDocument();
    await userEvent.click(folderButton);
    expect(store.getState().navigation.selectedFolderId).toBe('folder-1');
    expect(store.getState().notesIndex.scope).toBe('all');
    expect(store.getState().navigation.openFolders['folder-1']).toBe(false);
    expect(screen.queryByRole('button', { name: '规划草案' })).not.toBeInTheDocument();
    await userEvent.click(folderButton);
    expect(store.getState().navigation.openFolders['folder-1']).toBe(true);
    expect(screen.getByRole('button', { name: '规划草案' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '收起产品设计' }));
    expect(screen.queryByRole('button', { name: '规划草案' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '展开产品设计' }));
    expect(screen.getByRole('button', { name: '规划草案' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '设计' }));
    expect(store.getState().notesIndex.selectedTagId).toBe('tag-1');
    expect(store.getState().navigation.selectedFolderId).toBeNull();

    fireEvent.change(screen.getByRole('searchbox', { name: '搜索笔记目录' }), {
      target: { value: '正文关键词' }
    });
    await waitFor(() => expect(api.searchNoteIds).toHaveBeenCalledWith({
      query: '正文关键词',
      spaceId: 'space-1'
    }));
    expect(screen.getByText('没有匹配的文件夹')).toBeInTheDocument();
  });

  it('keeps the tag section expanded by default and exposes an accessible collapse control', async () => {
    renderSidebar();

    const collapseButton = screen.getByRole('button', { name: '标签' });
    expect(collapseButton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: '设计' })).toBeInTheDocument();

    await userEvent.click(collapseButton);
    expect(screen.getByRole('button', { name: '标签' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: '设计' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '标签' }));
    expect(screen.getByRole('button', { name: '设计' })).toBeInTheDocument();
  });

  it('offers folder creation from the folder section when the library is empty', async () => {
    renderSidebar({ empty: true });

    expect(screen.getByText('暂无文件夹，可使用右侧按钮创建')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '新建文件夹' }));
    expect(screen.getByRole('dialog', { name: '新建文件夹' })).toBeInTheDocument();
  });

  it('opens the existing design-system dialogs for note and folder creation', async () => {
    renderSidebar();

    await userEvent.click(screen.getByRole('button', { name: '新建笔记' }));
    expect(screen.getByRole('dialog', { name: '新建笔记' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '取消' }));

    await userEvent.click(screen.getByRole('button', { name: '笔记更多操作' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: '新建文件夹' }));
    expect(screen.getByRole('dialog', { name: '新建文件夹' })).toBeInTheDocument();
  });

  it('opens the folder context menu and creates entries under the captured folder', async () => {
    const { api } = renderSidebar();
    fireEvent.contextMenu(screen.getByRole('button', { name: /产品设计2/ }), {
      clientX: 120,
      clientY: 80
    });

    expect(await screen.findByRole('menu')).toHaveAttribute('aria-label', '产品设计文件夹操作');
    expect(screen.getByRole('menuitem', { name: '新建子文件夹' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '新建笔记' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '重命名' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '删除' })).toHaveAttribute('data-danger', 'true');

    await userEvent.click(screen.getByRole('menuitem', { name: '新建子文件夹' }));
    await userEvent.type(screen.getByRole('textbox', { name: '文件夹名称' }), '研究资料');
    await userEvent.click(screen.getByRole('button', { name: '创建' }));
    await waitFor(() => expect(api.createFolder).toHaveBeenCalledWith({
      spaceId: 'space-1',
      parentId: 'folder-1',
      name: '研究资料'
    }));
  });

  it('renames a folder and confirms folder deletion through project dialogs', async () => {
    const { api } = renderSidebar();
    const folderButton = screen.getByRole('button', { name: /产品设计2/ });
    fireEvent.contextMenu(folderButton);
    await userEvent.click(await screen.findByRole('menuitem', { name: '重命名' }));
    const input = screen.getByRole('textbox', { name: '文件夹名称' });
    await userEvent.clear(input);
    await userEvent.type(input, '产品资料');
    await userEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(api.updateFolder).toHaveBeenCalledWith('folder-1', {
      name: '产品资料',
      parentId: null
    }));

    fireEvent.contextMenu(screen.getByRole('button', { name: /产品设计2/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: '删除' }));
    expect(screen.getByRole('dialog', { name: '删除文件夹？' })).toHaveTextContent('其中的笔记会移至未整理');
    await userEvent.click(screen.getByRole('button', { name: '删除' }));
    await waitFor(() => expect(api.deleteFolder).toHaveBeenCalledWith('folder-1'));
  });

  it('offers favorite, rename and delete actions from a note context menu', async () => {
    const { api } = renderSidebar();
    await userEvent.click(screen.getByRole('button', { name: '展开产品设计' }));
    fireEvent.contextMenu(screen.getByRole('button', { name: '规划草案' }));

    expect(await screen.findByRole('menu')).toHaveAttribute('aria-label', '规划草案笔记操作');
    expect(screen.getByRole('menuitem', { name: '取消收藏' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '重命名' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '删除' })).toHaveAttribute('data-danger', 'true');
    await userEvent.click(screen.getByRole('menuitem', { name: '取消收藏' }));
    await waitFor(() => expect(api.setNoteFavorite).toHaveBeenCalledWith('note-1', false));
  });

  it('delegates note opening while keeping tree selection inside the sidebar', async () => {
    const onOpenNote = vi.fn();
    const { store } = renderSidebar({ onOpenNote });
    await userEvent.click(screen.getByRole('button', { name: '展开产品设计' }));
    await userEvent.click(screen.getByRole('button', { name: '规划草案' }));

    expect(store.getState().navigation.selectedNoteId).toBe('note-1');
    expect(onOpenNote).toHaveBeenCalledWith('note-1');
  });

  it('renames and confirms deletion for notes without native browser dialogs', async () => {
    const { api } = renderSidebar();
    await userEvent.click(screen.getByRole('button', { name: '展开产品设计' }));
    const noteButton = screen.getByRole('button', { name: '设计复盘' });
    fireEvent.contextMenu(noteButton);
    await userEvent.click(await screen.findByRole('menuitem', { name: '重命名' }));
    const input = screen.getByRole('textbox', { name: '笔记名称' });
    await userEvent.clear(input);
    await userEvent.type(input, '设计总结');
    await userEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(api.updateNote).toHaveBeenCalledWith('note-2', { title: '设计总结' }));

    await userEvent.click(screen.getByRole('button', { name: '展开产品设计' }));
    fireEvent.contextMenu(screen.getByRole('button', { name: '设计复盘' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: '删除' }));
    expect(screen.getByRole('dialog', { name: '删除笔记？' })).toHaveTextContent('将移入回收站');
    await userEvent.click(screen.getByRole('button', { name: '删除' }));
    await waitFor(() => expect(api.deleteNote).toHaveBeenCalledWith('note-2'));
  });
});

function renderSidebar({
  empty = false,
  onOpenNote,
  onOpenIndex
}: {
  empty?: boolean;
  onOpenNote?(noteId: string): void;
  onOpenIndex?(): void;
} = {}) {
  const api = createApi();
  const store = createAppStore({ api, cacheKey: 'sidebar-test', mockSnapshot: createEmptyWorkspaceSnapshot() });
  const folder = { id: 'folder-1', name: '产品设计', parentId: null, children: [] };
  store.setState({
    dataMode: 'api',
    workspaceLoadState: 'ready',
    serverData: {
      spaces: [{ id: 'space-1' }],
      currentSpaceId: 'space-1',
      folderTree: empty ? [] : [folder],
      foldersById: empty ? {} : { [folder.id]: folder },
      notes: empty ? [] : [
        createNote('note-1', '规划草案', 'folder-1', { favorite: true, tagIds: ['tag-1'] }),
        createNote('note-2', '设计复盘', 'folder-1'),
        createNote('note-3', '收件箱', null),
        createNote('note-4', '已删除', null, { deleted: true })
      ],
      tags: empty ? [] : [{ id: 'tag-1', name: '设计' }],
      tagGroups: []
    }
  });
  render(
    <AppStoreProvider
      store={store}
      dependencies={{ api, cacheKey: 'sidebar-test', mockSnapshot: createEmptyWorkspaceSnapshot() }}
    >
      <NotesContextSidebar onOpenNote={onOpenNote} onOpenIndex={onOpenIndex} />
    </AppStoreProvider>
  );
  return { api, store };
}

function createApi(): WorkspaceApi {
  return {
    listKnowledgeSpaces: vi.fn().mockResolvedValue([{ id: 'space-1' }]),
    createDefaultKnowledgeSpace: vi.fn().mockResolvedValue({ id: 'space-1' }),
    loadWorkspaceResources: vi.fn().mockResolvedValue({
      folderTree: [{ id: 'folder-1', name: '产品设计', parentId: null, children: [] }],
      notes: [
        createNote('note-1', '规划草案', 'folder-1', { favorite: true, tagIds: ['tag-1'] }),
        createNote('note-2', '设计复盘', 'folder-1'),
        createNote('note-3', '收件箱', null),
        createNote('note-4', '已删除', null, { deleted: true })
      ],
      tags: [{ id: 'tag-1', name: '设计' }],
      tagGroups: []
    }),
    searchNoteIds: vi.fn().mockResolvedValue(['note-2']),
    createNote: vi.fn().mockResolvedValue({ id: 'created-note' }),
    importMarkdownNotes: vi.fn().mockResolvedValue([{ id: 'imported-note' }]),
    getNote: vi.fn().mockResolvedValue({ id: 'note-1' }),
    createFolder: vi.fn().mockResolvedValue({ id: 'created-folder' }),
    updateNote: vi.fn().mockResolvedValue({ id: 'note-1' }),
    deleteNote: vi.fn().mockResolvedValue({ id: 'note-1' }),
    restoreNote: vi.fn().mockResolvedValue({ id: 'note-1' }),
    permanentlyDeleteNote: vi.fn().mockResolvedValue({ id: 'note-1' }),
    setNoteFavorite: vi.fn().mockResolvedValue({ id: 'note-1' }),
    setNoteTags: vi.fn().mockResolvedValue({ id: 'note-1' }),
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
    emptyRecycleBin: vi.fn()
  };
}

function createNote(
  id: string,
  title: string,
  folderId: string | null,
  overrides: { favorite?: boolean; deleted?: boolean; tagIds?: string[] } = {}
) {
  return {
    id,
    title,
    folderId,
    tagIds: overrides.tagIds ?? [],
    internalLinks: [],
    rawMarkdown: '',
    contentLoaded: false,
    favorite: overrides.favorite ?? false,
    deleted: overrides.deleted ?? false,
    updatedAt: '2026-08-23T08:00:00.000Z'
  };
}
