import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TagManagerView } from './TagManagerView';

const mocked = vi.hoisted(() => ({ state: {} as Record<string, unknown> }));
vi.mock('../../store/AppStoreProvider', () => ({ useAppStore: (selector: (state: Record<string, unknown>) => unknown) => selector(mocked.state) }));
vi.mock('../../app/router', () => ({ useNavigate: () => vi.fn() }));

beforeEach(() => {
  mocked.state = {
    serverData: {
      tags: [{ id: 'tag-1', name: '测试标签', color: 'blue', groupId: 'group-1', sortOrder: 0, isSystem: false }],
      tagGroups: [{ id: 'group-1', name: '普通标签', sortOrder: 0, selectionMode: 'multiple', isSystem: false }],
      notes: []
    },
    canWriteWorkspace: () => true,
    createTag: vi.fn(), updateTag: vi.fn(), deleteTag: vi.fn().mockResolvedValue(undefined), mergeTags: vi.fn(), reorderTags: vi.fn(),
    createTagGroup: vi.fn(), updateTagGroup: vi.fn(), deleteTagGroup: vi.fn()
  };
});
afterEach(() => { vi.useRealTimers(); });

describe('TagManagerView 标签删除', () => {
  it('确认后先提供撤销窗口，撤销不向服务端发送删除', async () => {
    const user = userEvent.setup();
    render(<TagManagerView />);
    await user.click(screen.getByRole('button', { name: '删除…' }));
    await user.click(screen.getByRole('button', { name: '删除标签' }));
    expect(screen.getByRole('button', { name: '撤销删除' })).toBeInTheDocument();
    expect(mocked.state.deleteTag).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '撤销删除' }));
    vi.useFakeTimers();
    act(() => { vi.advanceTimersByTime(11000); });
    expect(mocked.state.deleteTag).not.toHaveBeenCalled();
    expect(screen.getByText('测试标签')).toBeInTheDocument();
  });
});
