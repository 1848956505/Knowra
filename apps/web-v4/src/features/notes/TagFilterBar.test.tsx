import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Tag } from '@study-accelerator/web-core';
import { fitTagChips, TagFilterBar } from './TagFilterBar';

const tags: Tag[] = [
  { id: 'tag-a', name: '论文', color: 'blue' },
  { id: 'tag-b', name: '学习方法', color: 'green' },
  { id: 'tag-c', name: '重点', color: 'orange' }
];

afterEach(() => vi.restoreAllMocks());

describe('TagFilterBar', () => {
  it('fits chips to the available width and reserves room for the more control', () => {
    expect(fitTagChips([80, 80, 80], 280)).toBe(3);
    expect(fitTagChips([80, 80, 80], 240)).toBe(1);
    expect(fitTagChips([80, 80, 80], 100)).toBe(0);
  });

  it('keeps selected tags visible and finds hidden tags in the searchable list', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
      if (!this.hasAttribute('data-tag-viewport')) return 0;
      return this.parentElement?.querySelector('button[aria-label^="更多标签"]') ? 112 : 240;
    });
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const width = this.parentElement?.hasAttribute('data-tag-measure') ? 80 : 0;
      return { x: 0, y: 0, width, height: 26, top: 0, left: 0, right: width, bottom: 26, toJSON: () => ({}) };
    });
    const onToggleTag = vi.fn();
    const user = userEvent.setup();
    render(<TagFilterBar tags={tags} groups={[]} selectedIds={['tag-c']} match="all" onToggleTag={onToggleTag} onMatchChange={vi.fn()} onManage={vi.fn()} />);

    const visible = screen.getByLabelText('常用与已选标签');
    expect(within(visible).getByRole('button', { name: '重点' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(visible).queryByRole('button', { name: '论文' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '更多标签，隐藏 2 个' }));
    const popover = await screen.findByRole('dialog', { name: '全部标签' });
    await user.type(within(popover).getByRole('searchbox', { name: '搜索全部标签' }), '学习');
    expect(within(popover).getByRole('button', { name: '学习方法' })).toBeInTheDocument();
    expect(within(popover).queryByRole('button', { name: '论文' })).not.toBeInTheDocument();
    await user.click(within(popover).getByRole('button', { name: '学习方法' }));
    expect(onToggleTag).toHaveBeenCalledWith('tag-b');
  });

  it('keeps match controls and management outside the chip overflow', async () => {
    const user = userEvent.setup();
    const onMatchChange = vi.fn();
    const onManage = vi.fn();
    render(<TagFilterBar tags={tags} groups={[]} selectedIds={['tag-a', 'tag-c']} match="all" onToggleTag={vi.fn()} onMatchChange={onMatchChange} onManage={onManage} />);
    await user.click(screen.getByRole('button', { name: '满足任一' }));
    await user.click(screen.getByRole('button', { name: '管理标签' }));
    expect(onMatchChange).toHaveBeenCalledWith('any');
    expect(onManage).toHaveBeenCalledOnce();
  });
});
