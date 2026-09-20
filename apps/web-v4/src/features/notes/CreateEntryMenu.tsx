import type { ReactNode } from 'react';
import { Menu, MenuItem, MenuPopover, MenuTrigger } from '../../components/ui';
import { FolderIcon, NoteIcon } from '../../shell/icons';

export function CreateEntryChoices({ canWrite, onCreate }: { canWrite: boolean; onCreate(mode: 'note' | 'folder'): void }) {
  return <Menu ariaLabel="新建" onAction={key => onCreate(key as 'note' | 'folder')}>
    <MenuItem id="note" icon={<NoteIcon size={14} />} isDisabled={!canWrite}>新建笔记</MenuItem>
    <MenuItem id="folder" icon={<FolderIcon size={14} />} isDisabled={!canWrite}>新建文件夹</MenuItem>
  </Menu>;
}

export function CreateEntryMenu({ canWrite, onCreate, children, contextMenu = false }: {
  canWrite: boolean; onCreate(mode: 'note' | 'folder'): void; children: ReactNode; contextMenu?: boolean;
}) {
  return <MenuTrigger {...(contextMenu ? { trigger: 'contextMenu' as const } : {})}>
    {children}
    <MenuPopover><CreateEntryChoices canWrite={canWrite} onCreate={onCreate} /></MenuPopover>
  </MenuTrigger>;
}
