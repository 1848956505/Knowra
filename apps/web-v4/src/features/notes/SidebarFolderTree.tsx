import type { ReactNode } from 'react';
import type { Folder, Note } from '@study-accelerator/web-core';
import {
  Menu,
  MenuItem,
  MenuPopover,
  MenuSeparator,
  MenuTrigger,
  PressableButton
} from '../../components/ui';
import { ChevronRightIcon, FolderIcon, NoteIcon } from '../../shell/icons';
import { useAppStore } from '../../store/AppStoreProvider';
import { countFolderNotes, folderMatchesQuery } from './notesIndexModel';
import styles from './NotesContextSidebar.module.css';

export type SidebarTreeAction =
  | { type: 'create-folder'; folder: Folder }
  | { type: 'create-note'; folder: Folder }
  | { type: 'rename-folder'; folder: Folder }
  | { type: 'delete-folder'; folder: Folder }
  | { type: 'toggle-favorite'; note: Note }
  | { type: 'rename-note'; note: Note }
  | { type: 'delete-note'; note: Note };

interface SidebarFolderTreeProps {
  folders: Folder[];
  notes: Note[];
  query: string;
  canWrite: boolean;
  onAction(action: SidebarTreeAction): void;
  onOpenNote?(noteId: string): void;
}

export function SidebarFolderTree({ folders, notes, query, canWrite, onAction, onOpenNote }: SidebarFolderTreeProps) {
  const visibleFolders = folders.filter((folder) => folderMatchesQuery(folder, notes, query));
  if (visibleFolders.length === 0) {
    const isEmptyLibrary = folders.length === 0 && !query.trim();
    return (
      <p className={styles.empty}>
        {isEmptyLibrary ? '暂无文件夹，可使用右侧按钮创建' : '没有匹配的文件夹'}
      </p>
    );
  }
  return (
    <div className={styles.folderTree} role="tree" aria-label="笔记文件夹">
      {visibleFolders.map((folder) => (
        <FolderBranch
          key={folder.id}
          folder={folder}
          notes={notes}
          query={query}
          level={1}
          canWrite={canWrite}
          onAction={onAction}
          onOpenNote={onOpenNote}
        />
      ))}
    </div>
  );
}

function FolderBranch({ folder, notes, query, level, canWrite, onAction, onOpenNote }: {
  folder: Folder;
  notes: Note[];
  query: string;
  level: number;
  canWrite: boolean;
  onAction(action: SidebarTreeAction): void;
  onOpenNote?(noteId: string): void;
}) {
  const isOpen = useAppStore((state) => Boolean(state.navigation.openFolders[folder.id]));
  const isSelected = useAppStore((state) => state.navigation.selectedFolderId === folder.id);
  const selectedNoteId = useAppStore((state) => state.navigation.selectedNoteId);
  const toggleFolder = useAppStore((state) => state.toggleFolder);
  const selectFolder = useAppStore((state) => state.selectNotesFolder);
  const selectNote = useAppStore((state) => state.selectNote);
  const directNotes = notes.filter((note) => !note.deleted && note.folderId === folder.id);
  const childFolders = folder.children.filter((child) => folderMatchesQuery(child, notes, query));
  const canExpand = childFolders.length > 0 || directNotes.length > 0;
  const forcedOpen = Boolean(query.trim());
  const expanded = canExpand && (isOpen || forcedOpen);

  return (
    <div role="treeitem" aria-level={level} aria-expanded={canExpand ? expanded : undefined}>
      <div className={styles.folderLine}>
        <button
          type="button"
          className={styles.folderToggle}
          aria-label={`${expanded ? '收起' : '展开'}${folder.name}`}
          disabled={!canExpand}
          data-folder-toggle={folder.id}
          onClick={() => toggleFolder(folder.id)}
        >
          <ChevronRightIcon size={14} data-open={expanded || undefined} />
        </button>
        <FolderContextMenu folder={folder} canWrite={canWrite} onAction={onAction}>
          <PressableButton
            type="button"
            className={styles.folderRow}
            data-folder-id={folder.id}
            aria-current={isSelected ? 'page' : undefined}
            onClick={() => {
              selectFolder(folder.id);
              if (canExpand) toggleFolder(folder.id);
            }}
          >
            <FolderIcon size={16} />
            <span>{folder.name}</span>
            <small>{countFolderNotes(folder, notes)}</small>
          </PressableButton>
        </FolderContextMenu>
      </div>
      {expanded ? (
        <div role="group" className={styles.folderChildren}>
          {childFolders.map((child) => (
            <FolderBranch
              key={child.id}
              folder={child}
              notes={notes}
              query={query}
              level={level + 1}
              canWrite={canWrite}
              onAction={onAction}
              onOpenNote={onOpenNote}
            />
          ))}
          {directNotes
            .filter((note) => note.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
            .map((note) => (
              <NoteContextMenu key={note.id} note={note} canWrite={canWrite} onAction={onAction}>
                <PressableButton
                  type="button"
                  className={styles.documentRow}
                  data-note-id={note.id}
                  aria-current={selectedNoteId === note.id ? 'page' : undefined}
                  onClick={() => {
                    selectNote(note.id);
                    onOpenNote?.(note.id);
                  }}
                >
                  <NoteIcon size={15} />
                  <span>{note.title || '未命名笔记'}</span>
                </PressableButton>
              </NoteContextMenu>
            ))}
        </div>
      ) : null}
    </div>
  );
}

function FolderContextMenu({ folder, canWrite, onAction, children }: {
  folder: Folder;
  canWrite: boolean;
  onAction(action: SidebarTreeAction): void;
  children: ReactNode;
}) {
  return (
    <MenuTrigger trigger="contextMenu">
      {children}
      <MenuPopover placement="right top">
        <Menu ariaLabel={`${folder.name}文件夹操作`} onAction={(key) => {
          if (key === 'create-folder') onAction({ type: 'create-folder', folder });
          if (key === 'create-note') onAction({ type: 'create-note', folder });
          if (key === 'rename') onAction({ type: 'rename-folder', folder });
          if (key === 'delete') onAction({ type: 'delete-folder', folder });
        }}>
          <MenuItem id="create-folder" icon={<FolderIcon size={14} />} isDisabled={!canWrite}>新建子文件夹</MenuItem>
          <MenuItem id="create-note" icon={<NoteIcon size={14} />} isDisabled={!canWrite}>新建笔记</MenuItem>
          <MenuSeparator />
          <MenuItem id="rename" isDisabled={!canWrite}>重命名</MenuItem>
          <MenuItem id="delete" isDanger isDisabled={!canWrite}>删除</MenuItem>
        </Menu>
      </MenuPopover>
    </MenuTrigger>
  );
}

function NoteContextMenu({ note, canWrite, onAction, children }: {
  note: Note;
  canWrite: boolean;
  onAction(action: SidebarTreeAction): void;
  children: ReactNode;
}) {
  return (
    <MenuTrigger trigger="contextMenu">
      {children}
      <MenuPopover placement="right top">
        <Menu ariaLabel={`${note.title || '未命名笔记'}笔记操作`} onAction={(key) => {
          if (key === 'favorite') onAction({ type: 'toggle-favorite', note });
          if (key === 'rename') onAction({ type: 'rename-note', note });
          if (key === 'delete') onAction({ type: 'delete-note', note });
        }}>
          <MenuItem id="favorite" isDisabled={!canWrite}>{note.favorite ? '取消收藏' : '收藏笔记'}</MenuItem>
          <MenuSeparator />
          <MenuItem id="rename" isDisabled={!canWrite}>重命名</MenuItem>
          <MenuItem id="delete" isDanger isDisabled={!canWrite}>删除</MenuItem>
        </Menu>
      </MenuPopover>
    </MenuTrigger>
  );
}
