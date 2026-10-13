import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EditorToolbar } from './EditorToolbar';

const props = {
  toolbarRef: { current: null },
  pinned: false,
  canWrite: true,
  canEditContent: true,
  favorite: false,
  inspectorOpen: false,
  favoritePending: false,
  view: { mode: 'edit', modeBeforeFocus: null, showLeftSidebar: true, showRightSidebar: false, showSourceEditor: false, contentMode: 'edit', preferredShowLeftSidebar: true, preferredShowRightSidebar: false },
  onRunCommand: vi.fn(),
  onEditAction: vi.fn(),
  onViewAction: vi.fn(),
  onFileAction: vi.fn(),
  onToggleFavorite: vi.fn(),
  onToggleInspector: vi.fn(),
  onInsertImage: vi.fn()
} as unknown as Parameters<typeof EditorToolbar>[0];

describe('EditorToolbar 菜单', () => {
  it('鼠标悬停菜单按钮即可打开，移到另一个按钮时切换，移走后关闭', async () => {
    const user = userEvent.setup();
    render(<EditorToolbar {...props} />);
    await user.hover(screen.getByRole('button', { name: '文件' }));
    expect(await screen.findByRole('menu', { name: '文件' })).toBeVisible();
    await user.hover(screen.getByRole('button', { name: '编辑' }));
    expect(await screen.findByRole('menu', { name: '编辑' })).toBeVisible();
    await waitFor(() => expect(screen.queryByRole('menu', { name: '文件' })).not.toBeInTheDocument());
    await user.unhover(screen.getByRole('button', { name: '编辑' }));
    await waitFor(() => expect(screen.queryByRole('menu', { name: '编辑' })).not.toBeInTheDocument());
  });

  it('点击仍然可以打开菜单', async () => {
    const user = userEvent.setup();
    render(<EditorToolbar {...props} />);
    await user.click(screen.getByRole('button', { name: '视图' }));
    expect(await screen.findByRole('menu', { name: '视图' })).toBeVisible();
  });

  it('悬停并固定后，Esc 一次就能关闭', async () => {
    const user = userEvent.setup();
    render(<EditorToolbar {...props} />);
    await user.click(screen.getByRole('button', { name: '文件' }));
    expect(await screen.findByRole('menu', { name: '文件' })).toBeVisible();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu', { name: '文件' })).not.toBeInTheDocument());
  });
});
