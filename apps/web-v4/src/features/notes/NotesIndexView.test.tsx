import { render, screen } from '@testing-library/react';
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
        statusbar={{ path: [{ id: 'home', label: '主页' }, { id: 'materials', label: '笔记库', current: true }], dataMode: 'api' }}
      >
        <NotesIndexView />
      </AppShell>
    );

    expect(screen.getAllByRole('heading', { name: '全部笔记', level: 1 })).toHaveLength(1);
    expect(screen.queryByText('INDEX / LIST')).not.toBeInTheDocument();
    expect(screen.queryByText('QUICK LOOK')).not.toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: '笔记上下文导航' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('main').querySelectorAll('main')).toHaveLength(0);
  });
});
