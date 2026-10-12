import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NotesIndexHeader } from './NotesIndexHeader';

describe('笔记索引路径导航', () => {
  it('保留长路径的完整说明、当前段和可键盘返回的父目录', async () => {
    const navigate = vi.fn();
    const parent = '父目录的完整名称，窄屏仍可返回';
    const current = '当前目录的完整名称，视觉可省略';
    render(<NotesIndexHeader path={[
      { id: 'root', label: '笔记库', onNavigate: vi.fn() },
      { id: 'parent', label: parent, onNavigate: navigate },
      { id: 'current', label: current }
    ]} count={4} canWrite isRecycleView={false} selectionMode={false}
      onToggleSelection={vi.fn()} onImport={vi.fn()} onCreate={vi.fn()} onOpenSpaces={vi.fn()} />);
    const trail = screen.getByRole('navigation', { name: '当前位置' });
    expect(trail).toHaveAttribute('title', `笔记库 / ${parent} / ${current}`);
    expect(within(trail).getByText(current)).toHaveAttribute('aria-current', 'page');
    within(trail).getByRole('button', { name: `跳转到「${parent}」` }).focus();
    await userEvent.setup().keyboard('{Enter}');
    expect(navigate).toHaveBeenCalledOnce();
  });
});
