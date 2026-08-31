import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EditorContextMenu } from './EditorContextMenu';

describe('EditorContextMenu', () => {
  it('routes quick actions and submenu actions through existing editor contracts', async () => {
    const user = userEvent.setup();
    const onRunCommand = vi.fn();
    const onEditAction = vi.fn();
    render(
      <EditorContextMenu
        enabled
        canEdit
        onRunCommand={onRunCommand}
        onEditAction={onEditAction}
      >
        <div>正文编辑区</div>
      </EditorContextMenu>
    );

    fireEvent.contextMenu(screen.getByText('正文编辑区'), { clientX: 80, clientY: 80 });
    expect(await screen.findByRole('menu', { name: '编辑器右键快捷功能' })).toBeVisible();
    await user.click(screen.getByRole('menuitem', { name: '复制' }));
    expect(onEditAction).toHaveBeenCalledWith('copy');

    fireEvent.contextMenu(screen.getByText('正文编辑区'), { clientX: 80, clientY: 80 });
    await user.click(await screen.findByRole('menuitem', { name: '加粗' }));
    expect(onRunCommand).toHaveBeenCalledWith('bold');

    fireEvent.contextMenu(screen.getByText('正文编辑区'), { clientX: 80, clientY: 80 });
    expect(await screen.findByRole('menuitem', { name: '标题' })).toHaveAttribute('data-has-submenu', 'true');
    expect(screen.getByRole('menuitem', { name: '插入' })).toHaveAttribute('data-has-submenu', 'true');
  });

  it('keeps the native editor menu when the feature is disabled', () => {
    render(
      <EditorContextMenu
        enabled={false}
        canEdit={false}
        onRunCommand={vi.fn()}
        onEditAction={vi.fn()}
      >
        <div>源码并排预览</div>
      </EditorContextMenu>
    );
    fireEvent.contextMenu(screen.getByText('源码并排预览'));
    expect(screen.queryByRole('menu', { name: '编辑器右键快捷功能' })).not.toBeInTheDocument();
  });
});
