import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import type { Folder } from '@study-accelerator/web-core';
import { Button, IconButton, Menu, MenuItem, MenuPopover, MenuTrigger, Tree } from '../../components/ui';
import { FolderIcon, MoreIcon, PlusIcon } from '../../shell/icons';
import type { LibraryFolderTreeItem } from './libraryTypes';
import styles from './Library.module.css';

interface LibrarySidebarProps {
  foldersById: Record<string, Folder>;
  items: LibraryFolderTreeItem[];
  selectedKey: string;
  selectedFolderId: string | null;
  onSelect(key: string): void;
  onCreateFolder(parentId: string | null): void;
  onRenameFolder(folderId: string, name: string): Promise<void>;
  onDeleteFolder(folderId: string): void;
  onMoveFolder(folderId: string, parentId: string): Promise<void>;
  onError(message: string): void;
}

export function LibrarySidebar({
  foldersById,
  items,
  selectedKey,
  selectedFolderId,
  onSelect,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveFolder,
  onError
}: LibrarySidebarProps) {
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const dragSourceRef = useRef<string | null>(null);
  const renameSubmittingRef = useRef(false);
  const selectedParentId = selectedFolderId && foldersById[selectedFolderId]
    ? selectedFolderId
    : null;

  function beginRename(folderId: string, name: string) {
    setEditingFolderId(folderId);
    setEditingValue(name);
  }

  async function commitRename() {
    if (!editingFolderId || renameSubmittingRef.current) return;
    const folderId = editingFolderId;
    const name = editingValue.trim();
    if (!name) {
      onError('目录名称不能为空。');
      return;
    }
    renameSubmittingRef.current = true;
    try {
      await onRenameFolder(folderId, name);
      setEditingFolderId(null);
    } catch (error) {
      onError(error instanceof Error ? error.message : '目录重命名失败。');
    } finally {
      renameSubmittingRef.current = false;
    }
  }

  function renderLabel(item: LibraryFolderTreeItem): ReactNode {
    if (item.kind !== 'folder' || item.folderId !== editingFolderId) return item.label;
    return (
      <input
        autoFocus
        className={styles.inlineEdit}
        value={editingValue}
        aria-label={`重命名 ${item.label}`}
        onChange={(event) => setEditingValue(event.target.value)}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Enter') void commitRename();
          if (event.key === 'Escape') setEditingFolderId(null);
        }}
        onBlur={() => void commitRename()}
      />
    );
  }

  function renderExtras(item: LibraryFolderTreeItem): ReactNode {
    if (item.kind !== 'folder' || !item.folderId) return null;
    return (
      <span className={styles.treeActions} onClick={(event) => event.stopPropagation()}>
        <MenuTrigger>
          <IconButton variant="ghost" aria-label={`${item.label}更多操作`} className={styles.treeMore}>
            <MoreIcon size={14} />
          </IconButton>
          <MenuPopover>
            <Menu ariaLabel={`${item.label}操作`} onAction={(key) => {
              if (key === 'rename') beginRename(item.folderId!, item.label);
              if (key === 'delete') onDeleteFolder(item.folderId!);
            }}>
              <MenuItem id="rename">重命名</MenuItem>
              <MenuItem id="delete" isDanger>删除目录</MenuItem>
            </Menu>
          </MenuPopover>
        </MenuTrigger>
      </span>
    );
  }

  function handleDragStart(item: LibraryFolderTreeItem, event: DragEvent<HTMLSpanElement>) {
    if (item.kind !== 'folder' || !item.folderId) return;
    dragSourceRef.current = item.folderId;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', item.folderId);
  }

  function handleDragOver(item: LibraryFolderTreeItem, event: DragEvent<HTMLSpanElement>) {
    const source = dragSourceRef.current;
    if (item.kind !== 'folder' || !item.folderId || !source || source === item.folderId) return;
    if (isFolderDescendant(item.folderId, source, foldersById)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }

  async function handleDrop(item: LibraryFolderTreeItem, event: DragEvent<HTMLSpanElement>) {
    const source = dragSourceRef.current;
    dragSourceRef.current = null;
    if (item.kind !== 'folder' || !item.folderId || !source || source === item.folderId) return;
    if (isFolderDescendant(item.folderId, source, foldersById)) {
      onError('不能将目录移动到自己的子目录中。');
      return;
    }
    event.preventDefault();
    try {
      await onMoveFolder(source, item.folderId);
    } catch (error) {
      onError(error instanceof Error ? error.message : '目录移动失败。');
    }
  }

  return (
    <aside className={styles.sidebar} aria-label="资料目录">
      <div className={styles.sidebarHeader}>
        <div className={styles.sidebarTitle}>
          <FolderIcon size={16} />
          <span>资料目录</span>
        </div>
        <Button
          variant="accent"
          className={styles.smallAction}
          aria-label={selectedParentId ? '在当前目录中新建子目录' : '新建目录'}
          onClick={() => onCreateFolder(selectedParentId)}
        >
          <PlusIcon size={14} />
        </Button>
      </div>
      <div className={styles.sidebarHint}>拖动目录可调整层级</div>
      <Tree
        items={items}
        ariaLabel="笔记目录"
        selectedKeys={selectedKey ? new Set([selectedKey]) : new Set()}
        onSelectionChange={(keys) => {
          if (keys === 'all') return;
          const key = [...keys][0];
          if (key) onSelect(String(key));
        }}
        renderLabel={renderLabel}
        renderExtras={renderExtras}
        onItemDragStart={handleDragStart}
        onItemDragOver={handleDragOver}
        onItemDrop={(item, event) => void handleDrop(item as LibraryFolderTreeItem, event)}
        className={styles.folderTree}
      />
      <div className={styles.sidebarFooter}>
        <span className={styles.statusSquare} aria-hidden="true" />
        <span>目录与资料同步</span>
      </div>
    </aside>
  );
}

function isFolderDescendant(
  targetId: string,
  sourceId: string,
  foldersById: Record<string, Folder>
): boolean {
  let cursor = foldersById[targetId]?.parentId ?? null;
  while (cursor) {
    if (cursor === sourceId) return true;
    cursor = foldersById[cursor]?.parentId ?? null;
  }
  return false;
}
