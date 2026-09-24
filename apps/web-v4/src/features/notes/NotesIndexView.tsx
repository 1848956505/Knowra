import { CreateEntryChoices } from './CreateEntryMenu';
import { workspaceCapabilities, LOCAL_PERMANENT_DELETE_REASON } from '../../store/workspaceCapabilities';
import { NotesIndexPagination } from './NotesIndexPagination';
import { useNotesIndexData } from './useNotesIndexData';
import { NotesIndexHeader } from './NotesIndexHeader';
import { buildIndexPath, indexRoute } from './notesIndexNavigation';
import { MarkdownImportDialog } from '../editor/MarkdownImportDialog';
import itemStyles from './NotesIndexItems.module.css';
import { useEffect, useMemo, useState, useRef } from 'react';
import type { Note } from '@study-accelerator/web-core';
import {
  SortArrowsIcon,
  ChevronDownIcon,
  ComponentLibraryIcon,
  ListIcon,
  SearchIcon,
  TagIcon
} from '../../shell/icons';
import {
  Button, SearchBox, SegmentedButton, SegmentedControl,
  Menu, MenuItem, MenuTrigger, MenuPopover, PointMenu,
  Checkbox,
  Dialog,
  DialogBody,
  DialogClose,
  DialogFooter,
} from '../../components/ui';
import { type PathSegment } from '../../shell/path';
import { useAppStore } from '../../store/AppStoreProvider';
import { PermanentDeleteNoteDialog } from './PermanentDeleteNoteDialog';
import styles from './NotesIndexView.module.css';
import { useLocation, useNavigate } from '../../app/router';
import { TagFilterBar } from './TagFilterBar';
import { useSidebarTreeOperations } from './useSidebarTreeOperations';
import { scrollEntryContainer, useEntryDragDrop, useEntryDropTarget } from './EntryDragDrop';
import { WorkspacePanel, WorkspacePanelBody, WorkspacePanelToolbar } from '../../components/workspace/WorkspacePanel';

import { NotesTable, IndexTile } from './NotesIndexItems';
import { BatchTagDialog } from './BatchTagDialog';
import { SORT_LABELS, itemKey, type ViewMode, type TypeFilter, type SortMode } from './notesIndexPresentation';


export function NotesIndexView({
  onOpenNote
}: {
  path: PathSegment[];
  onOpenNote?(noteId: string): void;
}) {
  const serverData = useAppStore((state) => state.serverData);
  const notesIndex = useAppStore((state) => state.notesIndex);
  const navigation = useAppStore((state) => state.navigation);
  const setNotesQuery = useAppStore((state) => state.setNotesQuery);
  const selectFolderState = useAppStore((state) => state.selectNotesFolder);
  const selectScope = useAppStore((state) => state.selectNotesScope);
  const importMarkdownNotes = useAppStore((state) => state.importMarkdownNotes);
  const [importOpen, setImportOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const selectNote = useAppStore((state) => state.selectNote);
  const openNote = onOpenNote ?? selectNote;
  const restoreNote = useAppStore((state) => state.restoreNote);
  const permanentlyDeleteNote = useAppStore((state) => state.permanentlyDeleteNote);
  const deleteNotes = useAppStore((state) => state.deleteNotes);
  const updateTagsForNotes = useAppStore((state) => state.updateTagsForNotes);
  const canWrite = useAppStore((state) => state.canWriteWorkspace());
  const supportsPermanentDelete = useAppStore(state => workspaceCapabilities(state.persistenceMode).permanentDelete);
  const [view, setView] = useState<ViewMode>('grid');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [sort, setSort] = useState<SortMode>('updated-desc');
  const [tagFiltersOpen, setTagFiltersOpen] = useState(false);
  const [backgroundMenu, setBackgroundMenu] = useState<{ x: number; y: number } | null>(null);
  const [recyclePendingId, setRecyclePendingId] = useState<string | null>(null);
  const [permanentDeleteTarget, setPermanentDeleteTarget] = useState<Note | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set());
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const [batchTagOpen, setBatchTagOpen] = useState(false);
  const [batchPending, setBatchPending] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [remoteRevision, setRemoteRevision] = useState(0);
  const [batchError, setBatchError] = useState('');
  const treeOperations = useSidebarTreeOperations(() => {
    setRemotePage(null);
    setRemoteRevision((current) => current + 1);
  });
  const entryDragDrop = useEntryDragDrop();
  const location = useLocation();
  const navigate = useNavigate();
  const queryString = location.pathname.split('?')[1] ?? '';
  const urlTagIds = useMemo(() => (new URLSearchParams(queryString).get('tags') ?? '')
    .split(',').filter((id) => serverData.tags.some((tag) => tag.id === id)), [queryString, serverData.tags]);
  const tagMatch = new URLSearchParams(queryString).get('match') === 'any' ? 'any' : 'all';
  const isRecycleView = notesIndex.scope === 'trash';
  const backgroundDrop = useEntryDropTarget(!isRecycleView && !selectionMode
    ? navigation.selectedFolderId ?? (notesIndex.scope === 'root' ? null : undefined)
    : undefined);
  function openIndexRoute(to: string) {
    const params = new URLSearchParams(to.split('?')[1]);
    const folderId = params.get('folder');
    if (folderId) selectFolderState(folderId);
    else selectScope(params.get('scope') === 'root' ? 'root' : 'all');
    navigate(to);
  }
  function selectFolder(id: string) { openIndexRoute(indexRoute('all', id)); }
  const indexPath = buildIndexPath(notesIndex.scope, navigation.selectedFolderId, serverData.foldersById, openIndexRoute);

  useEffect(() => {
    function focusSearch(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener('keydown', focusSearch, true);
    return () => window.removeEventListener('keydown', focusSearch, true);
  }, []);

  useEffect(() => { contentRef.current?.scrollTo?.({ top: 0 }); }, [navigation.selectedFolderId, notesIndex.scope, page, view, typeFilter]);

  useEffect(() => {
    setPage(0);
    setSelectedNoteIds(new Set());
  }, [navigation.selectedFolderId, notesIndex.query, notesIndex.scope, notesIndex.selectedTagId, sort, queryString, typeFilter, pageSize]);

  useEffect(() => {
    if (urlTagIds.length > 0) setTagFiltersOpen(true);
  }, [urlTagIds.length]);

  const { items: allItems, counts, remotePage, remoteLoading, remoteError, loadMore, setRemotePage } = useNotesIndexData({ sort, typeFilter, queryString, urlTagIds, tagMatch, remoteRevision });

  const pageCount = Math.max(1, Math.ceil(allItems.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const items = allItems.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

  const selectableNoteIds = items.flatMap((item) => item.kind === 'note' && !item.note.deleted ? [item.note.id] : []);
  const allPageNotesSelected = selectableNoteIds.length > 0 && selectableNoteIds.every((id) => selectedNoteIds.has(id));

  function toggleNoteSelection(noteId: string, selected: boolean) {
    setSelectedNoteIds((current) => {
      const next = new Set(current);
      if (selected) next.add(noteId); else next.delete(noteId);
      return next;
    });
  }

  async function runBatch(action: () => Promise<void>): Promise<boolean> {
    setBatchPending(true);
    setBatchError('');
    try {
      await action();
      setSelectedNoteIds(new Set());
      setSelectionMode(false);
      setRemotePage(null);
      setRemoteRevision((current) => current + 1);
      return true;
    } catch (error) {
      setBatchError(error instanceof Error ? error.message : '批量操作失败，请重试');
      return false;
    } finally {
      setBatchPending(false);
    }
  }

  if (indexPath.length === 0) return null;

  async function handleRestore(note: Note) {
    setRecyclePendingId(note.id);
    try {
      await restoreNote(note.id);
    } finally {
      setRecyclePendingId(null);
    }
  }

  return (
    <WorkspacePanel aria-label="笔记索引">
      <NotesIndexHeader path={indexPath} canWrite={canWrite} isRecycleView={isRecycleView}
        onOpenSpaces={() => navigate('/materials/spaces')}
        selectionMode={selectionMode} onToggleSelection={() => { setSelectionMode(current => !current); setSelectedNoteIds(new Set()); }}
        onImport={() => setImportOpen(true)} onCreate={mode => treeOperations.openCreate(mode, navigation.selectedFolderId)} />
      {isRecycleView && !supportsPermanentDelete ? <p className={styles.capabilityNotice}>{LOCAL_PERMANENT_DELETE_REASON}</p> : null}
      <WorkspacePanelToolbar data-toolbar-surface="panel" role="toolbar" aria-label="笔记索引工具栏">
          <SearchBox label="搜索笔记索引" icon={<SearchIcon size={17} />} ref={searchRef}
            aria-keyshortcuts="Meta+K Control+K" name="notes-index-search" autoComplete="off"
            value={notesIndex.query} onChange={(event) => setNotesQuery(event.target.value)}
            placeholder="在当前索引中搜索…" shortcut={`${navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'} K`}
            surfaceProps={{ 'data-shadow-owner': 'search', 'data-shadow-token': '--shadow-search-rest' }} />
          <SegmentedControl data-control-group="segmented" data-shadow-owner="filter-group" data-shadow-token="--shadow-badge" aria-label="类型筛选">
            <FilterButton label="全部" count={counts.all} selected={typeFilter === 'all'} onSelect={() => setTypeFilter('all')} />
            <FilterButton label="文件夹" count={counts.folder} selected={typeFilter === 'folder'} onSelect={() => setTypeFilter('folder')} />
            <FilterButton label="文稿" count={counts.note} selected={typeFilter === 'note'} onSelect={() => setTypeFilter('note')} />
          </SegmentedControl>
          <MenuTrigger>
          <Button size="workspace" className={styles.sort} data-shadow-owner="sort" data-shadow-token="--shadow-badge" aria-label={`排序：${SORT_LABELS[sort]}`}>
              <SortArrowsIcon size={16} />{SORT_LABELS[sort]}<ChevronDownIcon size={12} />
            </Button>
            <MenuPopover><Menu ariaLabel="索引排序" selectionMode="single" selectedKeys={[sort]} onAction={key => setSort(key as SortMode)}>
              {Object.entries(SORT_LABELS).map(([key, label]) => <MenuItem id={key} key={key}>{label}</MenuItem>)}
            </Menu></MenuPopover>
          </MenuTrigger>
          <SegmentedControl data-shadow-owner="view-group" data-shadow-token="--shadow-badge" aria-label="视图切换">
            <SegmentedButton iconOnly aria-label="列表视图" aria-pressed={view === 'list'} onPress={() => setView('list')}><ListIcon size={16} /></SegmentedButton>
            <SegmentedButton iconOnly aria-label="图标视图" aria-pressed={view === 'grid'} onPress={() => setView('grid')}><ComponentLibraryIcon size={16} /></SegmentedButton>
          </SegmentedControl>
          <Button size="workspace"
            className={styles.tagToggle}
            aria-label={tagFiltersOpen ? '收起标签筛选' : '展开标签筛选'}
            aria-expanded={tagFiltersOpen}
            aria-controls="notes-index-tag-filters"
            onPress={() => setTagFiltersOpen((current) => !current)}
          >
            <TagIcon size={16} />标签
          </Button>
      </WorkspacePanelToolbar>

      {tagFiltersOpen ? <TagFilterBar tags={serverData.tags} groups={serverData.tagGroups} selectedIds={urlTagIds} match={tagMatch}
        onToggleTag={(id) => {
          const next = urlTagIds.includes(id) ? urlTagIds.filter((tagId) => tagId !== id) : [...urlTagIds, id];
          const params = new URLSearchParams(queryString);
          if (next.length) params.set('tags', next.join(',')); else params.delete('tags');
          params.set('match', tagMatch);
          navigate(`/materials?${params}`);
        }}
        onMatchChange={(match) => {
          const params = new URLSearchParams(queryString);
          params.set('match', match);
          navigate(`/materials?${params}`);
        }}
        onManage={() => navigate('/materials/tags')} /> : null}

      {selectionMode ? (
        <div className={styles.bulkBar} role="toolbar" aria-label="批量管理笔记">
          <Checkbox
            isSelected={allPageNotesSelected}
            isIndeterminate={selectedNoteIds.size > 0 && !allPageNotesSelected}
            onChange={(selected) => setSelectedNoteIds(selected ? new Set(selectableNoteIds) : new Set())}
          >选择本页</Checkbox>
          <strong role="status" aria-live="polite">已选 {selectedNoteIds.size} 篇</strong>
          <span className={styles.bulkSpacer} />
          <Button size="workspace" isDisabled={selectedNoteIds.size === 0} onPress={() => { setBatchError(''); setBatchTagOpen(true); }}>编辑标签</Button>
          <Button size="workspace" variant="danger" isDisabled={selectedNoteIds.size === 0} onPress={() => { setBatchError(''); setBatchDeleteOpen(true); }}>移入回收站</Button>
          <Button size="workspace" onPress={() => { setSelectionMode(false); setSelectedNoteIds(new Set()); }}>退出</Button>
        </div>
      ) : null}

      {remoteLoading ? <div className={styles.loadState} role="status">正在从服务端加载筛选结果…</div> : null}
      {remoteError ? <div className={styles.loadError} role="alert">
        <span>{remoteError}，已显示本地缓存结果。</span>
        <button type="button" onClick={() => setRemoteRevision((current) => current + 1)}>重新加载</button>
      </div> : null}

      <WorkspacePanelBody grid={view === 'grid'} ref={contentRef} className={styles.content} data-testid="notes-index-scroll" data-entry-scroll data-drop-active={backgroundDrop.isOver || undefined} aria-label="索引内容" tabIndex={0}
        onDragOver={event => {
          if ((event.target as Element).closest('[data-entry-item], table')) {
            backgroundDrop.clear();
            if (entryDragDrop?.isInternal(event)) scrollEntryContainer(event);
          }
          else {
            backgroundDrop.onDragOver(event);
            if (!event.defaultPrevented && entryDragDrop?.isInternal(event)) scrollEntryContainer(event);
          }
        }}
        onDragLeave={backgroundDrop.onDragLeave}
        onDrop={event => { if (!(event.target as Element).closest('[data-entry-item], table')) backgroundDrop.onDrop(event); }}
        onContextMenu={event => { if (event.defaultPrevented || isRecycleView) return; event.preventDefault(); setBackgroundMenu({ x: event.clientX, y: event.clientY }); }}
        onKeyDown={event => { if (event.target !== event.currentTarget || isRecycleView) return; if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) { event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); setBackgroundMenu({ x: rect.left + 16, y: rect.top + 16 }); } }}>
      {items.length === 0 ? (
        <div className={styles.empty} role="status">没有符合当前筛选条件的笔记或文件夹</div>
      ) : view === 'list' ? (
        <NotesTable
          items={items}
          selectedNoteId={navigation.selectedNoteId}
          onSelectFolder={selectFolder}
          onSelectNote={openNote}
          foldersById={serverData.foldersById}
          isRecycleView={isRecycleView}
          recyclePendingId={recyclePendingId}
          onRestore={(note) => void handleRestore(note)}
          onRequestPermanentDelete={setPermanentDeleteTarget}
          selectionMode={selectionMode}
          selectedNoteIds={selectedNoteIds}
          onToggleSelection={toggleNoteSelection}
          canWrite={canWrite}
          onItemAction={treeOperations.handleTreeAction}
        />
      ) : (
        <div className={itemStyles.grid} aria-label="笔记图标视图">
          {items.map((item) => (
            <IndexTile
              key={itemKey(item)}
              item={item}
              notes={serverData.notes}
              selectedNoteId={navigation.selectedNoteId}
              onSelectFolder={selectFolder}
              onSelectNote={openNote}
              isRecycleView={isRecycleView}
              recyclePendingId={recyclePendingId}
              onRestore={(note) => void handleRestore(note)}
              onRequestPermanentDelete={setPermanentDeleteTarget}
              selectionMode={selectionMode}
              selected={item.kind === 'note' && selectedNoteIds.has(item.note.id)}
              onToggleSelection={toggleNoteSelection}
              canWrite={canWrite}
              onItemAction={treeOperations.handleTreeAction}
            />
          ))}
        </div>
      )}

      </WorkspacePanelBody>
      <NotesIndexPagination page={currentPage} pageCount={pageCount} total={allItems.length} pageSize={pageSize}
        loading={remoteLoading} hasMore={typeFilter !== 'folder' && Boolean(remotePage?.hasNext)} onLoadMore={() => void loadMore()}
        onPageChange={setPage} onPageSizeChange={setPageSize} />
      <MarkdownImportDialog isOpen={importOpen} folderName={indexPath.map(segment => segment.label).join(' / ')}
        onOpenChange={setImportOpen} onImport={async sources => {
          await importMarkdownNotes(navigation.selectedFolderId, sources);
          setRemoteRevision(current => current + 1);
        }} />

      <PointMenu point={backgroundMenu} onOpenChange={open => { if (!open) setBackgroundMenu(null); }}>
        <CreateEntryChoices canWrite={canWrite && !isRecycleView} onCreate={mode => { setBackgroundMenu(null); treeOperations.openCreate(mode, navigation.selectedFolderId); }} />
      </PointMenu>
      {treeOperations.dialogs}
      <PermanentDeleteNoteDialog
        noteTitle={permanentDeleteTarget?.title ?? ''}
        isOpen={Boolean(permanentDeleteTarget)}
        onOpenChange={(open) => { if (!open) setPermanentDeleteTarget(null); }}
        onDelete={async () => {
          if (!permanentDeleteTarget) return;
          setRecyclePendingId(permanentDeleteTarget.id);
          try {
            await permanentlyDeleteNote(permanentDeleteTarget.id);
          } finally {
            setRecyclePendingId(null);
          }
        }}
      />
      <BatchTagDialog
        isOpen={batchTagOpen}
        tags={serverData.tags}
        groups={serverData.tagGroups}
        notes={serverData.notes.filter((note) => selectedNoteIds.has(note.id))}
        count={selectedNoteIds.size}
        pending={batchPending}
        error={batchError}
        onOpenChange={setBatchTagOpen}
        onSave={async (addTagIds, removeTagIds) => {
          if (await runBatch(() => updateTagsForNotes([...selectedNoteIds], addTagIds, removeTagIds))) setBatchTagOpen(false);
        }}
      />
      <Dialog
        title="将选中笔记移入回收站？"
        description={`将移动 ${selectedNoteIds.size} 篇笔记，后续可在回收站恢复。`}
        isOpen={batchDeleteOpen}
        onOpenChange={setBatchDeleteOpen}
        isPending={batchPending}
      >
        <DialogBody>
          <p className={styles.dialogHint}>文件夹和未选中的笔记不会受影响。</p>
          {batchError ? <p className={styles.batchError} role="alert">{batchError}</p> : null}
        </DialogBody>
        <DialogFooter>
          <DialogClose variant="ghost">取消</DialogClose>
          <Button variant="danger" isPending={batchPending} onPress={() => void runBatch(() => deleteNotes([...selectedNoteIds])).then((ok) => { if (ok) setBatchDeleteOpen(false); })}>移入回收站</Button>
        </DialogFooter>
      </Dialog>
    </WorkspacePanel>
  );
}

function FilterButton({ label, count, selected, onSelect }: { label: string; count: number; selected: boolean; onSelect(): void }) {
  return <SegmentedButton aria-label={label} aria-pressed={selected} count={count} onPress={onSelect}>{label}</SegmentedButton>;
}
