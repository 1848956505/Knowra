import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button, Menu, MenuItem, MenuSeparator, MenuTrigger } from '../index';

describe('V4-04 Menu', () => {
  it('toggles the menu between closed and open via the trigger', async () => {
    const user = userEvent.setup();
    render(
      <MenuTrigger>
        <Button>操作</Button>
        <Menu ariaLabel="操作">
          <MenuItem id="copy">复制</MenuItem>
          <MenuItem id="export">导出</MenuItem>
        </Menu>
      </MenuTrigger>
    );

    // 关闭状态：trigger aria-expanded=false；菜单容器已挂载但 menuitem 处于未激活态。
    const trigger = screen.getByRole('button', { name: '操作' });
    expect(trigger).toHaveAttribute('aria-haspopup');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menu', { name: '操作' })).toBeInTheDocument();
    expect(screen.getAllByRole('menuitem')).toHaveLength(2);
  });

  it('marks separator with role="separator" when the menu is open', async () => {
    const user = userEvent.setup();
    render(
      <MenuTrigger>
        <Button>操作</Button>
        <Menu ariaLabel="操作">
          <MenuItem id="copy">复制</MenuItem>
          <MenuSeparator />
          <MenuItem id="delete" isDanger>删除</MenuItem>
        </Menu>
      </MenuTrigger>
    );

    await user.click(screen.getByRole('button', { name: '操作' }));
    expect(await screen.findByRole('separator')).toBeInTheDocument();
  });

  it('marks danger items with the data-danger attribute', async () => {
    const user = userEvent.setup();
    render(
      <MenuTrigger>
        <Button>操作</Button>
        <Menu ariaLabel="操作">
          <MenuItem id="delete" isDanger>删除</MenuItem>
        </Menu>
      </MenuTrigger>
    );

    await user.click(screen.getByRole('button', { name: '操作' }));
    const item = await screen.findByRole('menuitem', { name: '删除' });
    expect(item).toHaveAttribute('data-danger', 'true');
  });

  it('exposes the keyboard hint slot in the menuitem markup', async () => {
    const user = userEvent.setup();
    render(
      <MenuTrigger>
        <Button>操作</Button>
        <Menu ariaLabel="操作">
          <MenuItem id="copy" kbd="⌘D">复制</MenuItem>
        </Menu>
      </MenuTrigger>
    );

    await user.click(screen.getByRole('button', { name: '操作' }));
    const item = await screen.findByRole('menuitem', { name: /复制/ });
    expect(item).toHaveTextContent('⌘D');
  });

  it('cleans up the menu on unmount', async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <MenuTrigger>
        <Button>操作</Button>
        <Menu ariaLabel="操作">
          <MenuItem id="only">选项</MenuItem>
        </Menu>
      </MenuTrigger>
    );
    await user.click(screen.getByRole('button', { name: '操作' }));
    expect(screen.queryByRole('menu')).toBeInTheDocument();
    unmount();
    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
  });
});
