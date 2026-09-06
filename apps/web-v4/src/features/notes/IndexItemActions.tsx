import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import type { Note } from '@study-accelerator/web-core';
import { GhostIconButton, Menu, MenuItem, MenuPopover, MenuTrigger } from '../../components/ui';
import { DeleteIcon, MoreHorizontalIcon, RefreshIcon } from '../../shell/icons';
import { FolderContextMenu, NoteContextMenu, type SidebarTreeAction } from './SidebarFolderTree';
import type { IndexItem } from './notesIndexPresentation';

export function openIndexItemMenu(event: ReactMouseEvent<HTMLElement>) {
  event.preventDefault();
  const trigger = event.currentTarget.querySelector<HTMLButtonElement>('[data-index-item-menu-trigger]');
  trigger?.click();
}
export function IndexItemActions({ item, canWrite, onAction }: {
  item: IndexItem;
  canWrite: boolean;
  onAction(action: SidebarTreeAction): void;
}) {
  const name = item.kind === 'folder' ? item.folder.name : item.note.title || '未命名笔记';
  const trigger = (
    <GhostIconButton data-index-item-menu-trigger="true" size={30} aria-label={`${name}的${item.kind === 'folder' ? '文件夹' : '笔记'}操作`}>
      <MoreHorizontalIcon size={16} />
    </GhostIconButton>
  );
  return item.kind === 'folder'
    ? <FolderContextMenu folder={item.folder} canWrite={canWrite} onAction={onAction} contextMenu={false}>{trigger}</FolderContextMenu>
    : <NoteContextMenu note={item.note} canWrite={canWrite} onAction={onAction} contextMenu={false}>{trigger}</NoteContextMenu>;
}

export function RecycleNoteActions({ note, pending, onRestore, onRequestPermanentDelete }: {
  note: Note;
  pending: boolean;
  onRestore(note: Note): void;
  onRequestPermanentDelete(note: Note): void;
}) {
  const title = note.title || '无标题笔记';
  return (
    <RecycleNoteMenu
      note={note}
      pending={pending}
      onRestore={onRestore}
      onRequestPermanentDelete={onRequestPermanentDelete}
    >
      <GhostIconButton data-index-item-menu-trigger="true" size={30} aria-label={`${title}的回收站操作`} disabled={pending}>
        <MoreHorizontalIcon size={16} />
      </GhostIconButton>
    </RecycleNoteMenu>
  );
}

function RecycleNoteMenu({ note, pending, onRestore, onRequestPermanentDelete, children }: {
  note: Note;
  pending: boolean;
  onRestore(note: Note): void;
  onRequestPermanentDelete(note: Note): void;
  children: ReactNode;
}) {
  const title = note.title || '无标题笔记';
  return (
    <MenuTrigger>
      {children}
      <MenuPopover placement="bottom end">
        <Menu ariaLabel={`${title}的回收站操作`}>
          <MenuItem id="restore" icon={<RefreshIcon size={14} />} isDisabled={pending} onAction={() => onRestore(note)}>恢复笔记</MenuItem>
          <MenuItem id="permanent-delete" icon={<DeleteIcon size={14} />} isDanger isDisabled={pending} onAction={() => onRequestPermanentDelete(note)}>彻底删除</MenuItem>
        </Menu>
      </MenuPopover>
    </MenuTrigger>
  );
}
