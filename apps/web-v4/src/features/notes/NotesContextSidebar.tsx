import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  BookIcon,
  ChevronRightIcon,
  ClockIcon,
  FolderIcon,
  MoreHorizontalIcon,
  MoreVerticalIcon,
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
import { Button, Dialog, DialogBody, DialogClose, DialogFooter } from '../../components/ui';
import { useAppStore } from '../../store/AppStoreProvider';
import { useLocation, useNavigate } from '../../app/router';
import { TagChip } from '../tags';
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
  const createTag = useAppStore((state) => state.createTag);
  const navigate = useNavigate();
  const location = useLocation();
  const [trashDialogOpen, setTrashDialogOpen] = useState(false);
  const [createTagOpen, setCreateTagOpen] = useState(false);
  const [tagMenu, setTagMenu] = useState<{ tagId: string; x: number; y: number } | null>(null);
  const [pinnedTagIds, setPinnedTagIds] = useState<string[]>(() => readPinnedTagIds());
  const [tagsExpanded, setTagsExpanded] = useState(true);
  const treeOperations = useSidebarTreeOperations();
  const trashCount = getScopeCount('trash', serverData.notes);
  const rootCount = serverData.folderTree.length + getScopeCount('root', serverData.notes);
  const activeTagIds = (new URLSearchParams(location.pathname.split('?')[1] ?? '').get('tags') ?? '').split(',').filter(Boolean);
  const visibleTags = useMemo(() => {
    const usage = new Map(serverData.tags.map((tag) => [tag.id, serverData.notes.filter((note) => !note.deleted && note.tagIds.includes(tag.id)).length]));
    const pinned = pinnedTagIds.map((id) => serverData.tags.find((tag) => tag.id === id)).filter(Boolean);
    return (pinned.length ? pinned : serverData.tags.slice().sort((a, b) => (usage.get(b.id) ?? 0) - (usage.get(a.id) ?? 0))).slice(0, 8);
  }, [pinnedTagIds, serverData.notes, serverData.tags]);

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

        <SidebarSection id="tags" title={`标签 ${serverData.tags.length}`} collapsible expanded={tagsExpanded} onExpandedChange={setTagsExpanded} action={<div className={styles.tagHeaderActions}><GhostIconButton size={24} aria-label="新建标签" title="新建标签" disabled={!canWrite} onClick={() => setCreateTagOpen(true)}><PlusIcon size={16} /></GhostIconButton><MenuTrigger><GhostIconButton size={24} aria-label="标签更多操作" title="更多"><MoreVerticalIcon size={16} /></GhostIconButton><MenuPopover><Menu ariaLabel="标签操作" onAction={(key) => { if (key === 'manage') navigate('/materials/tags'); if (key === 'expand') setTagsExpanded(true); if (key === 'collapse') setTagsExpanded(false); }}><MenuItem id="manage">管理标签</MenuItem><MenuItem id="expand">展开全部</MenuItem><MenuItem id="collapse">收起全部</MenuItem></Menu></MenuPopover></MenuTrigger></div>}>
          <div className={styles.tags} aria-label="标签筛选">
            {visibleTags.map((tag) => tag ? (
              <TagChip
                key={tag.id}
                tag={tag}
                selected={activeTagIds.includes(tag.id)}
                aria-pressed={activeTagIds.includes(tag.id)}
                onClick={() => {
                  selectNotesTag(activeTagIds.includes(tag.id) ? null : tag.id);
                  if (activeTagIds.includes(tag.id)) navigate('/materials');
                  else navigate(`/materials?tags=${encodeURIComponent(tag.id)}&match=all`);
                }}
                onContextMenu={(event) => { event.preventDefault(); setTagMenu({ tagId: tag.id, x: event.clientX, y: event.clientY }); }}
              />
            ) : null)}
            {serverData.tags.length === 0 ? <div className={styles.tagEmpty}><span className={styles.emptyInline}>暂无标签</span>{canWrite ? <button type="button" onClick={() => setCreateTagOpen(true)}>新建标签</button> : null}</div> : null}
            {serverData.tags.length > visibleTags.length ? <button className={styles.allTags} type="button" onClick={() => navigate('/materials/tags')}>全部标签·{serverData.tags.length}</button> : null}
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
      <QuickCreateTagDialog isOpen={createTagOpen} groups={serverData.tagGroups} onOpenChange={setCreateTagOpen} onCreate={createTag} />
      {tagMenu ? <div className={styles.contextMenuBackdrop} onClick={() => setTagMenu(null)} onContextMenu={(event) => { event.preventDefault(); setTagMenu(null); }}><div className={styles.tagContextMenu} role="menu" aria-label="标签操作" style={{ left: tagMenu.x, top: tagMenu.y }} onClick={(event) => event.stopPropagation()}>{(() => { const tag = serverData.tags.find((item) => item.id === tagMenu.tagId); const pinned = pinnedTagIds.includes(tagMenu.tagId); return <><button role="menuitem" type="button" onClick={() => { navigate(`/materials?tags=${encodeURIComponent(tagMenu.tagId)}&match=all`); setTagMenu(null); }}>查看相关笔记</button><button role="menuitem" type="button" onClick={() => { const next = pinned ? pinnedTagIds.filter((id) => id !== tagMenu.tagId) : [...pinnedTagIds, tagMenu.tagId]; setPinnedTagIds(next); writePinnedTagIds(next); setTagMenu(null); }}>{pinned ? '取消固定' : '固定标签'}</button>{canWrite ? <button role="menuitem" type="button" onClick={() => { navigate('/materials/tags'); setTagMenu(null); }}>编辑标签{tag ? `“${tag.name}”` : ''}</button> : null}<button role="menuitem" type="button" onClick={() => { navigate('/materials/tags'); setTagMenu(null); }}>进入标签管理</button></>; })()}</div></div> : null}
    </div>
  );
}

function SidebarSection({
  id,
  title,
  action,
  collapsible = false,
  expanded: controlledExpanded,
  onExpandedChange,
  children
}: {
  id: string;
  title: string;
  action?: ReactNode;
  collapsible?: boolean;
  expanded?: boolean;
  onExpandedChange?(expanded: boolean): void;
  children: ReactNode;
}) {
  const [internalExpanded, setInternalExpanded] = useState(true);
  const expanded = controlledExpanded ?? internalExpanded;
  const setExpanded = (next: boolean) => {
    if (controlledExpanded === undefined) setInternalExpanded(next);
    onExpandedChange?.(next);
  };
  const bodyId = `sidebar-${id}-body`;
  return (
    <section className={styles.section} aria-labelledby={`sidebar-${id}`}>
      {action || collapsible ? (
        <div className={styles.sectionHeader}>
          <h2 id={`sidebar-${id}`} className={styles.sectionTitle}>
            {collapsible ? (
              <button
                type="button"
                className={styles.sectionToggle}
                aria-label={id === 'tags' ? '标签' : undefined}
                aria-expanded={expanded}
                aria-controls={bodyId}
                onClick={() => setExpanded(!expanded)}
              >
                <span className={styles.sectionChevron} data-expanded={expanded || undefined} aria-hidden="true">
                  <ChevronRightIcon size={14} />
                </span>
                <span>{title}</span>
              </button>
            ) : title}
          </h2>
          {action}
        </div>
      ) : (
        <h2 id={`sidebar-${id}`} className={styles.sectionTitle}>{title}</h2>
      )}
      <div id={bodyId} className={styles.sectionBody} hidden={collapsible && !expanded}>{children}</div>
    </section>
  );
}

function QuickCreateTagDialog({ isOpen, groups, onOpenChange, onCreate }: { isOpen: boolean; groups: import('@study-accelerator/web-core').TagGroup[]; onOpenChange(open: boolean): void; onCreate(input: { name: string; color: import('@study-accelerator/web-core').TagColor; groupId: string }): Promise<unknown> }) {
  const [name, setName] = useState(''); const [pending, setPending] = useState(false); const [error, setError] = useState(''); const ordinary = groups.find((group) => group.code === 'ordinary') ?? groups[0];
  if (!isOpen) return null;
  return <Dialog title="新建标签" description="默认创建到“普通标签”分组，更多属性可在标签管理中调整。" isOpen onOpenChange={onOpenChange} isPending={pending}><DialogBody><label className={styles.quickTagField}>标签名称<input autoFocus value={name} maxLength={30} onChange={(event) => setName(event.target.value)} /></label>{error ? <p className={styles.tagError} role="alert">{error}</p> : null}</DialogBody><DialogFooter><DialogClose variant="ghost">取消</DialogClose><Button variant="primary" isDisabled={!name.trim() || !ordinary} isPending={pending} onPress={() => { if (!ordinary) return; setPending(true); setError(''); void onCreate({ name: name.trim(), color: 'blue', groupId: ordinary.id }).then(() => { setName(''); onOpenChange(false); }).catch((cause) => setError(cause instanceof Error ? cause.message : '创建失败')).finally(() => setPending(false)); }}>创建标签</Button></DialogFooter></Dialog>;
}

function readPinnedTagIds(): string[] { try { const value = localStorage.getItem('knowra:pinned-tags'); return value ? JSON.parse(value) : []; } catch { return []; } }
function writePinnedTagIds(ids: string[]) { try { localStorage.setItem('knowra:pinned-tags', JSON.stringify(ids)); } catch { /* local preference is best effort */ } }
