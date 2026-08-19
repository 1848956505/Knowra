import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TagGroup } from './index';

describe('V4-04 TagGroup', () => {
  it('renders the tag list and exposes the tags', () => {
    render(
      <TagGroup
        label="标签"
        items={[
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' }
        ]}
      />
    );
    // React Aria 的 TagGroup 渲染为 role="listbox" 的容器；这里只断言内容。
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
  });

  it('toggles selection on click', async () => {
    const user = userEvent.setup();
    render(
      <TagGroup
        label="标签"
        items={[{ id: 'a', label: 'A' }]}
        selectionMode="single"
      />
    );
    const tag = screen.getByText('A');
    await user.click(tag);
    expect(tag.closest('[data-selected]')).toBeTruthy();
  });
});
