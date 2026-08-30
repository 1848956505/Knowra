import { render, screen, within, type RenderResult } from '@testing-library/react';
import type { ReactNode } from 'react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createEmptyWorkspaceSnapshot, type WorkspaceApi } from '@study-accelerator/web-core';
import { AppShell } from '../../shell/AppShell';
import { AppStoreProvider } from '../../store/AppStoreProvider';
import { createAppStore } from '../../store/createAppStore';
import { NotesContextSidebar } from './NotesContextSidebar';
import { NotesIndexView } from './NotesIndexView';

describe('Notes index skeleton', () => {
  it('keeps one flat workspace title and a sibling context sidebar', () => {
    renderWithStore(
      <AppShell
        contextSidebar={<NotesContextSidebar />}
        activeDomain="materials"
        onSelectDomain={vi.fn()}
        onReturnHome={vi.fn()}
        statusbar={{ path: [{ id: 'home', label: '主页' }, { id: 'materials:root', label: '笔记库' }, { id: 'materials:index', label: '全部笔记', current: true }], dataMode: 'api' }}
      >
        <NotesIndexView path={[{ id: 'home', label: '主页' }, { id: 'materials:root', label: '笔记库', onNavigate: vi.fn() }, { id: 'materials:index', label: '全部笔记', current: true }]} />
      </AppShell>
    );

    expect(screen.getAllByRole('heading', { name: '全部笔记', level: 1 })).toHaveLength(1);
    expect(screen.queryByText('INDEX / LIST')).not.toBeInTheDocument();
    expect(screen.queryByText('QUICK LOOK')).not.toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: '笔记上下文导航' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('main').querySelectorAll('main')).toHaveLength(0);
  });

  it('uses a compact shared-location header with the current segment as the only h1', async () => {
    const navigateMaterials = vi.fn();
    renderWithStore(
      <NotesIndexView
        path={[
          { id: 'home', label: '主页' },
          { id: 'materials:root', label: '笔记库', onNavigate: navigateMaterials },
          { id: 'materials:index', label: '全部笔记', current: true }
        ]}
      />
    );

    const header = document.querySelector('[data-header-density="compact"]');
    expect(header).toBeTruthy();
    expect(screen.getByRole('heading', { name: '全部笔记', level: 1 }))
      .toHaveAttribute('data-title-density', 'compact');
    expect(screen.getByRole('heading', { name: '全部笔记', level: 1 })).toHaveAttribute('aria-current', 'page');
    const topLocation = screen.getByRole('navigation', { name: '当前位置' });
    expect(topLocation).not.toHaveTextContent('主页');
    expect(within(topLocation).getByRole('button', { name: '跳转到「笔记库」' })).toBeInTheDocument();
    expect(topLocation).toHaveTextContent('6 项');
    expect(screen.getByRole('toolbar', { name: '笔记索引工具栏' })).toBeInTheDocument();

    await userEvent.click(within(topLocation).getByRole('button', { name: '跳转到「笔记库」' }));
    expect(navigateMaterials).toHaveBeenCalledOnce();
  });

  it('keeps toolbar layout-only and assigns one shadow owner to each floating control', () => {
    renderWithStore(<NotesIndexView path={[{ id: 'materials:index', label: '全部笔记', current: true }]} />);

    const toolbar = screen.getByRole('toolbar', { name: '笔记索引工具栏' });
    expect(toolbar).toHaveAttribute('data-toolbar-surface', 'layout-only');
    expect(toolbar).toHaveAttribute('data-toolbar-list-gap', '12px');
    expect(toolbar).not.toHaveAttribute('data-shadow-owner');
    expect(screen.getByTestId('notes-index-marker')).toHaveAttribute('data-shadow-owner', 'marker');
    expect(screen.getByTestId('notes-index-marker')).toHaveAttribute('data-shadow-token', '--shadow-badge');
    const searchOwner = toolbar.querySelector('[data-shadow-owner="search"]');
    expect(searchOwner).toHaveAttribute('data-shadow-owner', 'search');
    expect(searchOwner).toHaveAttribute('data-shadow-token', '--shadow-input-rest');
    const filterGroup = within(toolbar).getByRole('group', { name: '类型筛选' });
    expect(filterGroup).toHaveAttribute('data-control-group', 'segmented');
    expect(filterGroup).toHaveAttribute('data-shadow-owner', 'filter-group');
    expect(filterGroup).toHaveAttribute('data-shadow-token', '--shadow-badge');
    const filters = within(filterGroup).getAllByRole('button', { name: /^(全部|文件夹|文稿)$/ });
    expect(filters).toHaveLength(3);
    expect(filterGroup.children).toHaveLength(3);
    expect(filters.every((button) => !button.hasAttribute('data-shadow-owner') && !button.hasAttribute('data-shadow-token'))).toBe(true);
    expect(filters.find((button) => button.textContent === '全部')).toHaveAttribute('aria-pressed', 'true');
    expect(within(toolbar).getByRole('button', { name: '↕ 最近更新' })).toHaveAttribute('data-shadow-token', '--shadow-badge');
    expect(within(toolbar).getByRole('group', { name: '视图切换' })).toHaveAttribute('data-shadow-owner', 'view-group');
    expect(within(toolbar).getByRole('group', { name: '视图切换' })).toHaveAttribute('data-shadow-token', '--shadow-badge');
  });

  it('delegates note opening without coupling the index to routing', async () => {
    const onOpenNote = vi.fn();
    renderWithStore(
      <NotesIndexView
        path={[{ id: 'materials:index', label: '全部笔记', current: true }]}
        onOpenNote={onOpenNote}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /规划草案/ }));
    expect(onOpenNote).toHaveBeenCalledWith('note-1');
  });
});

function renderWithStore(ui: ReactNode): RenderResult {
  const api = createApi();
  const store = createAppStore({
    api,
    cacheKey: 'notes-index-test',
    mockSnapshot: createEmptyWorkspaceSnapshot()
  });
  const folders = [
    { id: 'folder-1', name: '产品设计', parentId: null, children: [] },
    { id: 'folder-2', name: '学习', parentId: null, children: [] },
    { id: 'folder-3', name: '灵感', parentId: null, children: [] }
  ];
  store.setState({
    dataMode: 'api',
    workspaceLoadState: 'ready',
    serverData: {
      spaces: [{ id: 'space-1' }],
      currentSpaceId: 'space-1',
      folderTree: folders,
      foldersById: Object.fromEntries(folders.map((folder) => [folder.id, folder])),
      notes: [
        createNote('note-1', '规划草案', 'folder-1'),
        createNote('note-2', '注意力机制', 'folder-2'),
        createNote('note-3', '灵感记录', null)
      ],
      tags: []
    }
  });
  return render(
    <AppStoreProvider
      store={store}
      dependencies={{ api, cacheKey: 'notes-index-test', mockSnapshot: createEmptyWorkspaceSnapshot() }}
    >
      {ui}
    </AppStoreProvider>
  );
}

function createApi(): WorkspaceApi {
  return {
    listKnowledgeSpaces: vi.fn().mockResolvedValue([{ id: 'space-1' }]),
    createDefaultKnowledgeSpace: vi.fn().mockResolvedValue({ id: 'space-1' }),
    loadWorkspaceResources: vi.fn().mockResolvedValue({ folderTree: [], notes: [], tags: [] }),
    searchNoteIds: vi.fn().mockResolvedValue([]),
    createNote: vi.fn(),
    createFolder: vi.fn(),
    updateNote: vi.fn(),
    deleteNote: vi.fn(),
    setNoteFavorite: vi.fn(),
    updateFolder: vi.fn(),
    deleteFolder: vi.fn(),
    emptyRecycleBin: vi.fn()
  };
}

function createNote(id: string, title: string, folderId: string | null) {
  return {
    id,
    title,
    folderId,
    tagIds: [],
    internalLinks: [],
    rawMarkdown: '',
    contentLoaded: false,
    favorite: false,
    deleted: false,
    updatedAt: '2026-08-23T08:00:00.000Z'
  };
}
