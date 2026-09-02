import { useEffect, useState, type ReactNode } from 'react';
import {
  BookIcon,
  ClockIcon,
  FolderIcon,
  MoreHorizontalIcon,
  NoteIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  TagIcon
} from '../../shell/icons';
import {
  GhostIconButton,
  Menu,
  MenuItem,
  MenuPopover,
  MenuSeparator,
  MenuTrigger
} from '../../components/ui';
import { useAppStore } from '../../store/AppStoreProvider';
import type { NotesIndexScope } from '../../store/types';
import { NOTES_SEARCH_DEBOUNCE_MS, getScopeCount } from './notesIndexModel';
import { EmptyRecycleDialog } from './EmptyRecycleDialog';
import { SidebarFolderTree } from './SidebarFolderTree';
import { useSidebarTreeOperations } from './useSidebarTreeOperations';
import styles from './NotesContextSidebar.module.css';

interface NavEntry {
  scope: Exclude<NotesIndexScope, 'root' | 'trash'>;
  label: string;
  Icon: typeof NoteIcon;
}

const QUICK_ENTRIES: readonly NavEntry[] = [
  { scope: 'all', label: '全部笔记', Icon: NoteIcon },
  { scope: 'recent', label: '最近编辑', Icon: ClockIcon },
  { scope: 'favorites', label: '收藏', Icon: TagIcon },
  { scope: 'unfiled', label: '未整理', Icon: RefreshIcon }
];

const TAG_TONES = [styles.tagBlue, styles.tagPurple, styles.tagGreen, styles.tagOrange];
export function NotesContextSidebar({
  onOpenNote,
  onOpenIndex
}: {
  onOpenNote?(noteId: string): void;
  onOpenIndex?(): void;
}) {
  const serverData = useAppStore((state) => state.serverData);
  const notesIndex = useAppStore((state) => state.notesIndex);
  const selectedFolderId = useAppStore((state) => state.navigation.selectedFolderId);
  const selectNotesScope = useAppStore((state) => state.selectNotesScope);
  const selectNotesTag = useAppStore((state) => state.selectNotesTag);
  const setNotesQuery = useAppStore((state) => state.setNotesQuery);
  const searchNotes = useAppStore((state) => state.searchNotes);
  const retryWorkspace = useAppStore((state) => state.retryWorkspace);
  const canWrite = useAppStore((state) => state.canWriteWorkspace());
  const emptyRecycleBin = useAppStore((state) => state.emptyRecycleBin);
  const [trashDialogOpen, setTrashDialogOpen] = useState(false);
  const treeOperations = useSidebarTreeOperations();
  const trashCount = getScopeCount('trash', serverData.notes);
  const rootCount = serverData.folderTree.length + getScopeCount('root', serverData.notes);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void searchNotes(notesIndex.query);
    }, NOTES_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timeoutId);
  }, [notesIndex.query, searchNotes]);

  return (
    <div className={styles.sidebarContent}>
      <header className={styles.header}>
        <span className={styles.title}>笔记</span>
        <MenuTrigger>
          <GhostIconButton aria-label="笔记更多操作" title="更多操作">
            <MoreHorizontalIcon size={20} />
          </GhostIconButton>
          <MenuPopover>
            <Menu
              ariaLabel="笔记目录操作"
              onAction={(key) => {
                if (key === 'new-folder') treeOperations.openCreate('folder', selectedFolderId);
                if (key === 'refresh') void retryWorkspace();
                if (key === 'empty-trash') setTrashDialogOpen(true);
              }}
            >
              <MenuItem id="new-folder" icon={<FolderIcon size={14} />} isDisabled={!canWrite}>新建文件夹</MenuItem>
              <MenuSeparator />
              <MenuItem id="refresh" icon={<RefreshIcon size={14} />}>刷新目录</MenuItem>
              <MenuItem id="empty-trash" isDanger isDisabled={!canWrite || trashCount === 0}>清空回收站</MenuItem>
            </Menu>
          </MenuPopover>
        </MenuTrigger>
        <GhostIconButton
          aria-label="新建笔记"
          title="新建笔记 · Ctrl/⌘ N"
          disabled={!canWrite}
          onClick={() => treeOperations.openCreate('note', selectedFolderId)}
        >
          <PlusIcon size={20} />
        </GhostIconButton>
      </header>

      <label className={styles.search}>
        <SearchIcon size={16} />
        <input
          data-input-control="true"
          type="search"
          name="notes-sidebar-search"
          autoComplete="off"
          value={notesIndex.query}
          onChange={(event) => setNotesQuery(event.target.value)}
          placeholder="搜索标题、正文或标签…"
          aria-label="搜索笔记目录"
        />
      </label>

      <div className={styles.scrollBody}>
        <SidebarSection id="quick" title="快速入口">
          {QUICK_ENTRIES.map((entry) => {
            const current = notesIndex.scope === entry.scope
              && !selectedFolderId
              && !notesIndex.selectedTagId;
            return (
              <button
                key={entry.scope}
                className={styles.navRow}
                type="button"
                aria-current={current ? 'page' : undefined}
                onClick={() => {
                  selectNotesScope(entry.scope);
                  onOpenIndex?.();
                }}
              >
                <entry.Icon size={16} />
                <span>{entry.label}</span>
                <small>{getScopeCount(entry.scope, serverData.notes)}</small>
              </button>
            );
          })}
        </SidebarSection>

        <SidebarSection
          id="folders"
          title="文件夹"
          action={(
            <GhostIconButton
              size={24}
              aria-label="新建文件夹"
              title="新建文件夹"
              disabled={!canWrite}
              onClick={() => treeOperations.openCreate('folder', selectedFolderId)}
            >
              <PlusIcon size={16} />
            </GhostIconButton>
          )}
        >
          <button
            className={`${styles.navRow} ${styles.libraryRow}`}
            type="button"
            aria-current={notesIndex.scope === 'root' ? 'page' : undefined}
            onClick={() => {
              selectNotesScope('root');
              onOpenIndex?.();
            }}
          >
            <BookIcon size={16} />
            <span>笔记库</span>
            <small>{rootCount}</small>
          </button>
          <SidebarFolderTree
            folders={serverData.folderTree}
            notes={serverData.notes}
            query={notesIndex.query}
            canWrite={canWrite}
            onAction={treeOperations.handleTreeAction}
            onOpenIndex={onOpenIndex}
            onOpenNote={onOpenNote}
          />
        </SidebarSection>

        <SidebarSection id="tags" title="标签">
          <div className={styles.tags} aria-label="标签筛选">
            {serverData.tags.map((tag, index) => (
              <button
                key={tag.id}
                type="button"
                className={TAG_TONES[index % TAG_TONES.length]}
                aria-pressed={notesIndex.selectedTagId === tag.id}
                onClick={() => {
                  selectNotesTag(notesIndex.selectedTagId === tag.id ? null : tag.id);
                  onOpenIndex?.();
                }}
              >
                {tag.name || '未命名'}
              </button>
            ))}
            {serverData.tags.length === 0 ? <span className={styles.emptyInline}>暂无标签</span> : null}
          </div>
        </SidebarSection>
      </div>

      <button
        className={styles.recycle}
        type="button"
        aria-current={notesIndex.scope === 'trash' ? 'page' : undefined}
        onClick={() => {
          selectNotesScope('trash');
          onOpenIndex?.();
        }}
      >
        <RefreshIcon size={16} />
        <span>回收站</span>
        <small>{trashCount}</small>
      </button>

      {treeOperations.dialogs}
      <EmptyRecycleDialog
        isOpen={trashDialogOpen}
        count={trashCount}
        onOpenChange={setTrashDialogOpen}
        onEmpty={emptyRecycleBin}
      />
    </div>
  );
}

function SidebarSection({
  id,
  title,
  action,
  children
}: {
  id: string;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={styles.section} aria-labelledby={`sidebar-${id}`}>
      {action ? (
        <div className={styles.sectionHeader}>
          <h2 id={`sidebar-${id}`} className={styles.sectionTitle}>{title}</h2>
          {action}
        </div>
      ) : (
        <h2 id={`sidebar-${id}`} className={styles.sectionTitle}>{title}</h2>
      )}
      <div className={styles.sectionBody}>{children}</div>
    </section>
  );
}
