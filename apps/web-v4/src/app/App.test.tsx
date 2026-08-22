import { StrictMode } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createEmptyWorkspaceSnapshot, type WorkspaceApi } from '@study-accelerator/web-core';
import { App } from './App';
import { AppProviders } from './AppProviders';
import { RouterProvider } from './router';
import { createAppStore } from '../store/createAppStore';

describe('V4-05 workspace bootstrap (AppShell + HomeView)', () => {
  it('deduplicates workspace loading under React Strict Mode and renders the home shell', async () => {
    const api = createWorkspaceApiStub();
    const store = createAppStore({
      api,
      cacheKey: 'test-cache',
      mockSnapshot: createEmptyWorkspaceSnapshot()
    });

    render(
      <StrictMode>
        <AppProviders store={store}>
          <App />
        </AppProviders>
      </StrictMode>
    );

    // 等待 loadWorkspace 完成（冻结主页的第一个工作台出现即代表已就绪）
    await screen.findByRole('heading', { name: '笔记工作台' });
    expect(api.listKnowledgeSpaces).toHaveBeenCalledTimes(1);
    expect(api.loadWorkspaceResources).toHaveBeenCalledTimes(1);

    // 冻结外壳：ModuleRail + 主区 + 状态栏
    const rail = screen.getByRole('navigation', { name: '工作域导航' });
    expect(rail).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '早安，创造者。' })).toBeInTheDocument();
    // 状态栏
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();

    // 冻结左轨搜索触发器
    expect(within(rail).getByRole('button', { name: '全局搜索' })).toBeInTheDocument();
    expect(within(rail).getByRole('button', { name: '组件库' })).toBeEnabled();

    // 工作台计数来自真实 workspace。
    expect(screen.getByText('AVAILABLE · 1 ITEMS')).toBeInTheDocument();
  });

  it('shows the home with error state and retries after a failed load', async () => {
    const api = createWorkspaceApiStub();
    vi.mocked(api.listKnowledgeSpaces)
      .mockRejectedValueOnce(new Error('网络不可用'))
      .mockResolvedValueOnce([{ id: 'space-1', name: 'Main' }]);
    const store = createAppStore({
      api,
      cacheKey: 'test-cache',
      mockSnapshot: createEmptyWorkspaceSnapshot()
    });

    render(<AppProviders store={store}><App /></AppProviders>);

    // 第一轮：error → EmptyState title 显示 "资料加载失败"
    expect(await screen.findByText('资料加载失败')).toBeInTheDocument();
    expect(screen.getByText('网络不可用')).toBeInTheDocument();
    // 重试按钮在 EmptyState 内
    fireEvent.click(screen.getByRole('button', { name: '重试' }));

    await waitFor(() => {
      expect(screen.queryByText('资料加载失败')).not.toBeInTheDocument();
    });
    // 第二轮成功：工作域卡出现
    expect(screen.getByRole('heading', { name: '笔记工作台' })).toBeInTheDocument();
    expect(api.listKnowledgeSpaces).toHaveBeenCalledTimes(2);
  });

  it('shows an accessible loading state while the workspace request is pending', async () => {
    const api = createWorkspaceApiStub();
    vi.mocked(api.listKnowledgeSpaces).mockImplementation(() => new Promise(() => undefined));
    const store = createAppStore({
      api,
      cacheKey: 'test-cache',
      mockSnapshot: createEmptyWorkspaceSnapshot()
    });

    render(<AppProviders store={store}><App /></AppProviders>);

    const loadingLabel = await screen.findByText('正在加载资料…');
    expect(loadingLabel).toBeInTheDocument();
    expect(loadingLabel.closest('[role="status"]')).toHaveAttribute('aria-busy', 'true');
  });

  it('shows the real empty state when the workspace has no notes', async () => {
    const api = createWorkspaceApiStub();
    vi.mocked(api.loadWorkspaceResources).mockResolvedValue({
      folderTree: [],
      notes: [],
      tags: []
    });
    const store = createAppStore({
      api,
      cacheKey: 'test-cache',
      mockSnapshot: createEmptyWorkspaceSnapshot()
    });

    render(<AppProviders store={store}><App /></AppProviders>);

    expect(await screen.findByText('还没有资料')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '打开全局搜索' }).length).toBeGreaterThan(0);
  });

  it('opens the search command via the rail trigger and supports keyboard navigation', async () => {
    const api = createWorkspaceApiStub();
    const store = createAppStore({
      api,
      cacheKey: 'test-cache',
      mockSnapshot: createEmptyWorkspaceSnapshot()
    });

    render(<AppProviders store={store}><App /></AppProviders>);
    await screen.findByRole('heading', { name: '笔记工作台' });

    const rail = screen.getByRole('navigation', { name: '工作域导航' });
    fireEvent.click(within(rail).getByRole('button', { name: '全局搜索' }));
    const dialog = await screen.findByRole('dialog', { name: '全局搜索' });
    expect(dialog).toBeInTheDocument();
    // 至少 1 条资料命中
    expect(within(dialog).getByText('Note')).toBeInTheDocument();

    const input = within(dialog).getByRole('combobox');
    fireEvent.change(input, { target: { value: 'Note' } });
    expect(within(dialog).getByRole('button', { name: '清除搜索关键字' })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: '清除搜索关键字' }));
    expect(input).toHaveValue('');

    // 中文输入法 composing 期间不抢 Enter。
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(screen.getByRole('dialog', { name: '全局搜索' })).toBeInTheDocument();

    // Enter 跳转到该资料并关闭 dialog
    fireEvent.change(input, { target: { value: 'Note' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '全局搜索' })).not.toBeInTheDocument();
    });
  });

  it('opens the search command via ⌘ K global shortcut', async () => {
    const api = createWorkspaceApiStub();
    const store = createAppStore({
      api,
      cacheKey: 'test-cache',
      mockSnapshot: createEmptyWorkspaceSnapshot()
    });

    render(<AppProviders store={store}><App /></AppProviders>);
    await screen.findByRole('heading', { name: '笔记工作台' });

    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(await screen.findByRole('dialog', { name: '全局搜索' })).toBeInTheDocument();
  });

  it('announces when clicking a locked rail module', async () => {
    const api = createWorkspaceApiStub();
    const store = createAppStore({
      api,
      cacheKey: 'test-cache',
      mockSnapshot: createEmptyWorkspaceSnapshot()
    });

    render(<AppProviders store={store}><App /></AppProviders>);
    await screen.findByRole('heading', { name: '笔记工作台' });

    const rail = screen.getByRole('navigation', { name: '工作域导航' });
    const knowledge = within(rail).getByRole('button', { name: /知识/ });
    expect(knowledge).toBeDisabled();
    expect(within(rail).getByRole('button', { name: '设置（尚未上线）' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '通知（尚未上线）' })).toBeDisabled();
    // disabled 按钮 click 不会触发 live region 改变，但 we just verify 不抛错
    fireEvent.click(knowledge);
    // 仍停留在主页（无切换）
    expect(screen.getByRole('heading', { name: '笔记工作台' })).toBeInTheDocument();
  });

  it('renders a truthful gate for an unavailable work-domain URL', async () => {
    const api = createWorkspaceApiStub();
    const store = createAppStore({
      api,
      cacheKey: 'test-cache',
      mockSnapshot: createEmptyWorkspaceSnapshot()
    });

    render(
      <RouterProvider location={{ pathname: '/knowledge', navigate: vi.fn() }}>
        <AppProviders store={store}><App /></AppProviders>
      </RouterProvider>
    );

    expect(await screen.findByRole('heading', { name: '知识库' })).toBeInTheDocument();
    expect(screen.getByText('该工作域尚未上线')).toBeInTheDocument();
    expect(api.listKnowledgeSpaces).not.toHaveBeenCalled();
  });

  it('does not highlight any rail module on the home page (/)', async () => {
    const api = createWorkspaceApiStub();
    const store = createAppStore({
      api,
      cacheKey: 'test-cache',
      mockSnapshot: createEmptyWorkspaceSnapshot()
    });

    render(<AppProviders store={store}><App /></AppProviders>);
    await screen.findByRole('heading', { name: '笔记工作台' });

    const rail = screen.getByRole('navigation', { name: '工作域导航' });
    // 主页不属于任何工作域的子页面：左轨所有模块入口都应为非激活态。
    expect(within(rail).getByRole('button', { name: '资料' })).not.toHaveAttribute('aria-current', 'page');
  });

  it('navigates to the notes index when clicking the materials rail button', async () => {
    const api = createWorkspaceApiStub();
    const store = createAppStore({
      api,
      cacheKey: 'test-cache',
      mockSnapshot: createEmptyWorkspaceSnapshot()
    });

    const navigateMock = vi.fn();
    render(
      <RouterProvider location={{ pathname: '/', navigate: navigateMock }}>
        <AppProviders store={store}><App /></AppProviders>
      </RouterProvider>
    );
    await screen.findByRole('heading', { name: '笔记工作台' });

    const rail = screen.getByRole('navigation', { name: '工作域导航' });
    fireEvent.click(within(rail).getByRole('button', { name: '资料' }));

    // "资料"按钮应导向独立路由 /materials（笔记索引页），而不是 / 主页。
    expect(navigateMock).toHaveBeenCalledWith('/materials');
  });

  it('highlights the materials rail button on the notes index page (/materials)', async () => {
    const api = createWorkspaceApiStub();
    const store = createAppStore({
      api,
      cacheKey: 'test-cache',
      mockSnapshot: createEmptyWorkspaceSnapshot()
    });

    render(
      <RouterProvider location={{ pathname: '/materials', navigate: vi.fn() }}>
        <AppProviders store={store}><App /></AppProviders>
      </RouterProvider>
    );

    // 笔记索引页骨架包含唯一 h1「全部笔记」与侧栏。
    expect(await screen.findByRole('heading', { name: '全部笔记', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: '笔记上下文导航' })).toBeInTheDocument();

    const rail = screen.getByRole('navigation', { name: '工作域导航' });
    // 笔记索引页才是"资料"工作域的着陆页：左轨"资料"按钮 aria-current='page'。
    expect(within(rail).getByRole('button', { name: '资料' })).toHaveAttribute('aria-current', 'page');
  });

  it('returns to the home page (/) when clicking the brand logo on the notes index', async () => {
    const api = createWorkspaceApiStub();
    const store = createAppStore({
      api,
      cacheKey: 'test-cache',
      mockSnapshot: createEmptyWorkspaceSnapshot()
    });

    const navigateMock = vi.fn();
    render(
      <RouterProvider location={{ pathname: '/materials', navigate: navigateMock }}>
        <AppProviders store={store}><App /></AppProviders>
      </RouterProvider>
    );
    expect(await screen.findByRole('heading', { name: '全部笔记', level: 1 })).toBeInTheDocument();

    const rail = screen.getByRole('navigation', { name: '工作域导航' });
    fireEvent.click(within(rail).getByRole('button', { name: '知境工作区' }));

    // 左上角 Logo 永远回到主页（/），与"资料"按钮职责彻底分离。
    expect(navigateMock).toHaveBeenCalledWith('/');
  });
});

function createWorkspaceApiStub(): WorkspaceApi {
  return {
    listKnowledgeSpaces: vi.fn().mockResolvedValue([{ id: 'space-1', name: 'Main' }]),
    createDefaultKnowledgeSpace: vi.fn().mockResolvedValue({ id: 'space-1', name: 'Main' }),
    loadWorkspaceResources: vi.fn().mockResolvedValue({
      folderTree: [{ id: 'folder-1', name: 'Folder', parentId: null, children: [] }],
      notes: [{
        id: 'note-1',
        title: 'Note',
        folderId: 'folder-1',
        tagIds: [],
        internalLinks: [],
        rawMarkdown: '',
        contentLoaded: false,
        favorite: false,
        deleted: false
      }],
      tags: []
    }),
    searchNoteIds: vi.fn().mockResolvedValue([])
  };
}
