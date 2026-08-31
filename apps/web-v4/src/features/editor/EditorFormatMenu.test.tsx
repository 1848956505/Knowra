import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PressableButton } from '../../components/ui/button';
import { Menu, MenuPopover, MenuTrigger } from '../../components/ui/overlay';
import { renderEditorFormatMenu } from './EditorFormatMenu';

function renderFormatMenu(onCommand = vi.fn()) {
  render(
    <MenuTrigger>
      <PressableButton>格式</PressableButton>
      <MenuPopover><Menu ariaLabel="格式菜单">{renderEditorFormatMenu({ onCommand })}</Menu></MenuPopover>
    </MenuTrigger>
  );
  return onCommand;
}

describe('EditorFormatMenu', () => {
  it('exposes the reference command order while keeping image disabled', async () => {
    const user = userEvent.setup();
    renderFormatMenu();
    await user.click(screen.getByRole('button', { name: '格式' }));
    expect(screen.getByRole('menuitem', { name: '图片' })).toHaveAttribute('aria-disabled', 'true');
    for (const label of ['内部链接', '加粗', '斜体', '删除线', '行内代码', '高亮']) {
      expect(screen.getByRole('menuitem', { name: new RegExp(`^${label}`) })).toBeEnabled();
    }
    expect(screen.getByRole('menuitem', { name: /^加粗/ })).toHaveTextContent('Ctrl+B');
    expect(screen.getByRole('menuitem', { name: /^行内代码/ })).toHaveTextContent('Ctrl+E');
    expect(screen.getByRole('menuitem', { name: /^高亮/ })).toHaveTextContent('Ctrl+Shift+H');
  });

  it('dispatches the migrated formatting commands', async () => {
    const user = userEvent.setup();
    const onCommand = renderFormatMenu();
    await user.click(screen.getByRole('button', { name: '格式' }));
    await user.click(screen.getByRole('menuitem', { name: '内部链接' }));
    expect(onCommand).toHaveBeenCalledWith('internal-link');
  });
});
