import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AppShell } from '../../shell/AppShell';
import { NotesContextSidebar } from './NotesContextSidebar';
import { NotesIndexView } from './NotesIndexView';

describe('Notes index skeleton', () => {
  it('keeps one flat workspace title and a sibling context sidebar', () => {
    render(
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
    render(
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
    render(<NotesIndexView path={[{ id: 'materials:index', label: '全部笔记', current: true }]} />);

    const toolbar = screen.getByRole('toolbar', { name: '笔记索引工具栏' });
    expect(toolbar).toHaveAttribute('data-toolbar-surface', 'layout-only');
    expect(toolbar).not.toHaveAttribute('data-shadow-owner');
    expect(screen.getByTestId('notes-index-marker')).toHaveAttribute('data-shadow-owner', 'marker');
    expect(screen.getByTestId('notes-index-marker')).toHaveAttribute('data-shadow-token', '--shadow-badge');
    const searchOwner = toolbar.querySelector('[data-shadow-owner="search"]');
    expect(searchOwner).toHaveAttribute('data-shadow-owner', 'search');
    expect(searchOwner).toHaveAttribute('data-shadow-token', '--shadow-input-rest');
    const filters = within(toolbar).getAllByRole('button', { name: /^(全部|文件夹|文稿)$/ });
    expect(filters).toHaveLength(3);
    expect(filters.every((button) => button.getAttribute('data-shadow-owner') === 'filter')).toBe(true);
    expect(filters.find((button) => button.textContent === '全部')).toHaveAttribute('data-shadow-token', '--shadow-focus');
    expect(filters.find((button) => button.textContent === '文件夹')).toHaveAttribute('data-shadow-token', '--shadow-badge');
    expect(within(toolbar).getByRole('button', { name: '↕ 最近更新' })).toHaveAttribute('data-shadow-token', '--shadow-badge');
    expect(within(toolbar).getByRole('group', { name: '视图切换' })).toHaveAttribute('data-shadow-owner', 'view-group');
    expect(within(toolbar).getByRole('group', { name: '视图切换' })).toHaveAttribute('data-shadow-token', '--shadow-badge');
  });
});
