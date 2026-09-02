import { useEffect, useMemo, useState } from 'react';
import type { Folder, Note, NoteQueryPage } from '@study-accelerator/web-core';
import {
  ArrowUpRightIcon,
  DeleteIcon,
  FolderIcon,
  MoreHorizontalIcon,
  NoteIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon
} from '../../shell/icons';
import {
  Button,
  Checkbox,
  Dialog,
  DialogBody,
  DialogClose,
  DialogFooter,
  GhostIconButton,
  Menu,
  MenuItem,
  MenuPopover,
  MenuTrigger
} from '../../components/ui';
import { PathTrail } from '../../shell/PathTrail';
import { pathForSurface, type PathSegment } from '../../shell/path';
import { useAppStore } from '../../store/AppStoreProvider';
import { CreateEntryDialog, type CreateMode } from './CreateEntryDialog';
import { PermanentDeleteNoteDialog } from './PermanentDeleteNoteDialog';
import { countFolderNotes, filterNotes, folderMatchesQuery, formatUpdatedAt } from './notesIndexModel';
import styles from './NotesIndexView.module.css';

type ViewMode = 'list' | 'grid';
type TypeFilter = 'all' | 'folder' | 'note';
type SortMode = 'updated-desc' | 'updated-asc' | 'name-asc';
type IndexItem = { kind: 'folder'; folder: Folder } | { kind: 'note'; note: Note };

const SORT_LABELS: Record<SortMode, string> = {
  'updated-desc': '最近更新',
  'updated-asc': '最早更新',
  'name-asc': '名称排序'
};
const NOTE_PAGE_SIZE = 30;

export function NotesIndexView({
  path,
  onOpenNote
}: {
  path: PathSegment[];
  onOpenNote?(noteId: string): void;
}) {
  const serverData = useAppStore((state) => state.serverData);
  const notesIndex = useAppStore((state) => state.notesIndex);
  const navigation = useAppStore((state) => state.navigation);
  const setNotesQuery = useAppStore((state) => state.setNotesQuery);
  const selectFolder = useAppStore((state) => state.selectNotesFolder);
  const selectNote = useAppStore((state) => state.selectNote);
  const openNote = onOpenNote ?? selectNote;
  const createNote = useAppStore((state) => state.createNote);
  const createFolder = useAppStore((state) => state.createFolder);
  const restoreNote = useAppStore((state) => state.restoreNote);
  const permanentlyDeleteNote = useAppStore((state) => state.permanentlyDeleteNote);
  const deleteNotes = useAppStore((state) => state.deleteNotes);
  const assignTagToNotes = useAppStore((state) => state.assignTagToNotes);
  const queryNotes = useAppStore((state) => state.queryNotes);
  const dataMode = useAppStore((state) => state.dataMode);
  const canWrite = useAppStore((state) => state.canWriteWorkspace());
  const [view, setView] = useState<ViewMode>('list');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [sort, setSort] = useState<SortMode>('updated-desc');
  const [createMode, setCreateMode] = useState<CreateMode>(null);
  const [recyclePendingId, setRecyclePendingId] = useState<string | null>(null);
  const [permanentDeleteTarget, setPermanentDeleteTarget] = useState<Note | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set());
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const [batchTagOpen, setBatchTagOpen] = useState(false);
  const [batchPending, setBatchPending] = useState(false);
  const [page, setPage] = useState(0);
  const [remotePage, setRemotePage] = useState<NoteQueryPage | null>(null);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteError, setRemoteError] = useState('');
  const [remoteRevision, setRemoteRevision] = useState(0);
  const [batchError, setBatchError] = useState('');
  const isRecycleView = notesIndex.scope === 'trash';
  const useServerQuery = dataMode === 'api' && !['root', 'unfiled'].includes(notesIndex.scope);
  const currentSegment = path.find((segment) => segment.current) ?? path.at(-1);
  const parentPath = currentSegment
    ? pathForSurface(path, 'notes-index').filter((segment) => segment.id !== currentSegment.id)
    : [];

  useEffect(() => {
    setPage(0);
    setSelectedNoteIds(new Set());
  }, [navigation.selectedFolderId, notesIndex.query, notesIndex.scope, notesIndex.selectedTagId, sort]);

  useEffect(() => {
    let active = true;
    if (!useServerQuery) {
      setRemotePage(null);
      setRemoteLoading(false);
      setRemoteError('');
      return () => { active = false; };
    }
    setRemoteLoading(true);
    setRemoteError('');
    const limit = notesIndex.scope === 'recent' ? 6 : NOTE_PAGE_SIZE;
    void queryNotes({
      query: notesIndex.query,
      folderId: navigation.selectedFolderId ?? undefined,
      tagId: notesIndex.selectedTagId ?? undefined,
      favoriteOnly: notesIndex.scope === 'favorites',
      deletedOnly: notesIndex.scope === 'trash',
      includeDeleted: notesIndex.scope === 'trash',
      sortBy: sort === 'name-asc' ? 'title' : 'updatedAt',
      order: sort === 'updated-asc' || sort === 'name-asc' ? 'asc' : 'desc',
      offset: page * limit,
      limit
    }).then((result) => {
      if (active) setRemotePage(result);
    }).catch((error) => {
      if (active) {
        setRemotePage(null);
        setRemoteError(error instanceof Error ? error.message : '服务端筛选失败');
      }
    }).finally(() => {
      if (active) setRemoteLoading(false);
    });
    return () => { active = false; };
  }, [navigation.selectedFolderId, notesIndex.query, notesIndex.scope, notesIndex.selectedTagId, page, queryNotes, remoteRevision, sort, useServerQuery]);

  const items = useMemo(() => {
    const noteSource = useServerQuery && remotePage ? remotePage.items : serverData.notes;
    const filterState = useServerQuery && remotePage
      ? { ...notesIndex, query: '', matchingNoteIds: null }
      : notesIndex;
    const visibleNotes = filterNotes(noteSource, serverData.tags, {
      notesIndex: filterState,
      selectedFolderId: navigation.selectedFolderId
    });
    const selectedFolder = navigation.selectedFolderId
      ? serverData.foldersById[navigation.selectedFolderId]
      : null;
    const visibleFolders = page === 0 && (notesIndex.scope === 'all' || notesIndex.scope === 'root') && !notesIndex.selectedTagId
      ? (selectedFolder?.children ?? serverData.folderTree)
        .filter((folder) => folderMatchesQuery(folder, serverData.notes, notesIndex.query))
      : [];
    const folderItems: IndexItem[] = typeFilter === 'note'
      ? []
      : visibleFolders.map((folder) => ({ kind: 'folder', folder }));
    const noteItems: IndexItem[] = typeFilter === 'folder'
      ? []
      : sortNotes(visibleNotes, sort).map((note) => ({ kind: 'note', note }));
    return [...folderItems.sort(compareFolderItems), ...noteItems];
  }, [navigation.selectedFolderId, notesIndex, page, remotePage, serverData, sort, typeFilter, useServerQuery]);

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

  if (!currentSegment) return null;

  async function handleRestore(note: Note) {
    setRecyclePendingId(note.id);
    try {
      await restoreNote(note.id);
    } finally {
      setRecyclePendingId(null);
    }
  }

  return (
    <article className={styles.page} aria-labelledby="notes-index-title">
      <header className={styles.header} data-header-density="compact">
        <nav className={styles.breadcrumb} aria-label="当前位置">
          <span className={styles.marker} data-testid="notes-index-marker" data-shadow-owner="marker" data-shadow-token="--shadow-badge" aria-hidden="true" />
          <PathTrail path={parentPath} variant="top" currentId={null} />
          <span className={styles.breadcrumbSeparator} aria-hidden="true"> / </span>
          <h1 id="notes-index-title" data-title-density="compact" aria-current="page">{currentSegment.label}</h1>
          <span className={styles.summary}>
            <strong>{items.length}</strong> 项
            <span aria-hidden="true">·</span>
            <span>{view === 'list' ? '列表视图' : '图标视图'} · {SORT_LABELS[sort]}</span>
          </span>
        </nav>
        <div className={styles.actions} aria-label="笔记操作">
          <button
            type="button"
            className={styles.button}
            disabled={!canWrite || isRecycleView}
            aria-pressed={selectionMode}
            onClick={() => {
              setSelectionMode((current) => !current);
              setSelectedNoteIds(new Set());
            }}
          >批量管理</button>
          <button type="button" className={styles.button}>
            <ArrowUpRightIcon size={16} />
            <span>导入</span>
          </button>
          <button
            type="button"
            className={`${styles.button} ${styles.primary}`}
            disabled={!canWrite}
            onClick={() => setCreateMode('note')}
          >
            <PlusIcon size={17} />
            <span>新建笔记</span>
          </button>
        </div>
      </header>

      <div className={styles.toolbar} data-toolbar-surface="layout-only" data-toolbar-list-gap="12px" role="toolbar" aria-label="笔记索引工具栏">
        <label className={styles.search} data-shadow-owner="search" data-shadow-token="--shadow-input-rest">
          <SearchIcon size={17} />
          <input
            data-input-control="true"
            type="search"
            name="notes-index-search"
            autoComplete="off"
            value={notesIndex.query}
            onChange={(event) => setNotesQuery(event.target.value)}
            placeholder="搜索标题、正文或标签…"
            aria-label="搜索笔记索引"
          />
        </label>
        <div className={styles.filterGroup} data-control-group="segmented" data-shadow-owner="filter-group" data-shadow-token="--shadow-badge" role="group" aria-label="类型筛选">
          <FilterButton label="全部" selected={typeFilter === 'all'} onSelect={() => setTypeFilter('all')} />
          <FilterButton label="文件夹" selected={typeFilter === 'folder'} onSelect={() => setTypeFilter('folder')} />
          <FilterButton label="文稿" selected={typeFilter === 'note'} onSelect={() => setTypeFilter('note')} />
        </div>
        <button type="button" className={styles.sort} data-shadow-owner="sort" data-shadow-token="--shadow-badge" onClick={() => setSort(nextSort(sort))}>↕ {SORT_LABELS[sort]}</button>
        <div className={styles.viewToggle} data-shadow-owner="view-group" data-shadow-token="--shadow-badge" role="group" aria-label="视图切换">
          <button type="button" className={view === 'list' ? styles.viewActive : ''} aria-label="列表视图" aria-pressed={view === 'list'} onClick={() => setView('list')}><NoteIcon size={16} /></button>
          <button type="button" className={view === 'grid' ? styles.viewActive : ''} aria-label="图标视图" aria-pressed={view === 'grid'} onClick={() => setView('grid')}><FolderIcon size={16} /></button>
        </div>
      </div>

      {selectionMode ? (
        <div className={styles.bulkBar} role="toolbar" aria-label="批量管理笔记">
          <Checkbox
            isSelected={allPageNotesSelected}
            isIndeterminate={selectedNoteIds.size > 0 && !allPageNotesSelected}
            onChange={(selected) => setSelectedNoteIds(selected ? new Set(selectableNoteIds) : new Set())}
          >选择本页</Checkbox>
          <strong role="status" aria-live="polite">已选 {selectedNoteIds.size} 篇</strong>
          <span className={styles.bulkSpacer} />
          <button type="button" disabled={selectedNoteIds.size === 0} onClick={() => { setBatchError(''); setBatchTagOpen(true); }}>添加标签</button>
          <button type="button" className={styles.bulkDanger} disabled={selectedNoteIds.size === 0} onClick={() => { setBatchError(''); setBatchDeleteOpen(true); }}>移入回收站</button>
          <button type="button" onClick={() => { setSelectionMode(false); setSelectedNoteIds(new Set()); }}>退出</button>
        </div>
      ) : null}

      {remoteLoading ? <div className={styles.loadState} role="status">正在从服务端加载筛选结果…</div> : null}
      {remoteError ? <div className={styles.loadError} role="alert">
        <span>{remoteError}，已显示本地缓存结果。</span>
        <button type="button" onClick={() => setRemoteRevision((current) => current + 1)}>重新加载</button>
      </div> : null}

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
        />
      ) : (
        <div className={styles.grid} aria-label="笔记图标视图">
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
            />
          ))}
        </div>
      )}

      {useServerQuery && (page > 0 || remotePage?.hasNext) ? (
        <nav className={styles.pagination} aria-label="笔记分页">
          <button type="button" disabled={page === 0 || remoteLoading} onClick={() => setPage((current) => Math.max(0, current - 1))}>上一页</button>
          <span>第 {page + 1} 页</span>
          <button type="button" disabled={!remotePage?.hasNext || remoteLoading} onClick={() => setPage((current) => current + 1)}>下一页</button>
        </nav>
      ) : null}

      <CreateEntryDialog
        mode={createMode}
        parentFolderId={navigation.selectedFolderId}
        onOpenChange={(open) => { if (!open) setCreateMode(null); }}
        onCreateNote={createNote}
        onCreateFolder={createFolder}
      />
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
        count={selectedNoteIds.size}
        pending={batchPending}
        error={batchError}
        onOpenChange={setBatchTagOpen}
        onSave={async (tagId) => {
          if (await runBatch(() => assignTagToNotes([...selectedNoteIds], tagId))) setBatchTagOpen(false);
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
    </article>
  );
}

function FilterButton({ label, selected, onSelect }: { label: string; selected: boolean; onSelect(): void }) {
  return <button type="button" className={`${styles.filter} ${selected ? styles.selected : ''}`} aria-pressed={selected} onClick={onSelect}>{label}</button>;
}

function NotesTable({ items, selectedNoteId, onSelectFolder, onSelectNote, foldersById, isRecycleView, recyclePendingId, onRestore, onRequestPermanentDelete, selectionMode, selectedNoteIds, onToggleSelection }: {
  items: IndexItem[];
  selectedNoteId: string | null;
  onSelectFolder(id: string): void;
  onSelectNote(id: string): void;
  foldersById: Record<string, Folder>;
  isRecycleView: boolean;
  recyclePendingId: string | null;
  onRestore(note: Note): void;
  onRequestPermanentDelete(note: Note): void;
  selectionMode: boolean;
  selectedNoteIds: Set<string>;
  onToggleSelection(noteId: string, selected: boolean): void;
}) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table} data-selection-mode={selectionMode || undefined}>
        <thead><tr>{selectionMode ? <th scope="col" className={styles.selectionColumn}><span className={styles.srOnly}>选择</span></th> : null}<th scope="col" className={styles.nameColumn}>名称</th><th scope="col" className={styles.statusColumn}>状态</th><th scope="col" className={styles.locationColumn}>位置</th><th scope="col" className={styles.updatedColumn}>最近更新</th><th scope="col" className={styles.actionColumn}><span className={styles.srOnly}>操作</span></th></tr></thead>
        <tbody>{items.map((item) => {
          const isFolder = item.kind === 'folder';
          const id = isFolder ? item.folder.id : item.note.id;
          const name = isFolder ? item.folder.name : item.note.title;
          const updatedAt = isFolder ? item.folder.updatedAt : item.note.updatedAt;
          const location = isFolder ? '笔记库' : (item.note.folderId ? foldersById[item.note.folderId]?.name ?? '未整理' : '未整理');
          const status = isFolder ? '文件夹' : (item.note.deleted ? '回收站' : item.note.status || '文稿');
          return (
            <tr key={itemKey(item)} data-selected={!isFolder && (selectedNoteId === id || selectedNoteIds.has(id)) ? true : undefined}>
              {selectionMode ? <td className={styles.selectionCell}>{!isFolder ? (
                <Checkbox
                  aria-label={`选择${name || '未命名笔记'}`}
                  isSelected={selectedNoteIds.has(id)}
                  onChange={(selected) => onToggleSelection(id, selected)}
                />
              ) : null}</td> : null}
              <td className={styles.nameData}>
                <button type="button" className={styles.nameCell} disabled={isRecycleView && !isFolder} onClick={() => {
                  if (!isFolder && selectionMode) onToggleSelection(id, !selectedNoteIds.has(id));
                  else if (isFolder) onSelectFolder(id);
                  else onSelectNote(id);
                }}>
                  <span className={`${styles.miniFile} ${isFolder ? styles.miniFolder : ''}`} data-art-kind={isFolder ? 'folder' : 'document'} aria-hidden="true" />
                  <strong title={name || '未命名笔记'}>{name || '未命名笔记'}</strong>
                </button>
              </td>
              <td className={styles.statusData}><span className={`${styles.status} ${statusClassName(status)}`}><span className={styles.statusDot} />{status}</span></td>
              <td className={styles.locationData}>{location}</td>
              <td className={styles.updatedData}>{formatUpdatedAt(updatedAt)}</td>
              <td className={`${styles.more} ${styles.actionData}`}>{!isFolder && isRecycleView ? (
                <RecycleNoteActions
                  note={item.note}
                  pending={recyclePendingId === item.note.id}
                  onRestore={onRestore}
                  onRequestPermanentDelete={onRequestPermanentDelete}
                />
              ) : <MoreHorizontalIcon size={16} aria-hidden="true" />}</td>
            </tr>
          );
        })}</tbody>
      </table>
    </div>
  );
}

function IndexTile({ item, notes, selectedNoteId, onSelectFolder, onSelectNote, isRecycleView, recyclePendingId, onRestore, onRequestPermanentDelete, selectionMode, selected, onToggleSelection }: {
  item: IndexItem; notes: Note[]; selectedNoteId: string | null;
  onSelectFolder(id: string): void; onSelectNote(id: string): void;
  isRecycleView: boolean;
  recyclePendingId: string | null;
  onRestore(note: Note): void;
  onRequestPermanentDelete(note: Note): void;
  selectionMode: boolean;
  selected: boolean;
  onToggleSelection(noteId: string, selected: boolean): void;
}) {
  const isFolder = item.kind === 'folder';
  const entity = isFolder ? item.folder : item.note;
  const count = isFolder ? countFolderNotes(item.folder, notes) : 0;
  const status = isFolder ? '文件夹' : item.note.status || '文稿';
  return (
    <div className={styles.tileShell}>
      {!isFolder && selectionMode ? <span className={styles.tileSelection}>
        <Checkbox aria-label={`选择${item.note.title || '未命名笔记'}`} isSelected={selected} onChange={(next) => onToggleSelection(item.note.id, next)} />
      </span> : null}
      <button
        type="button"
        className={styles.tile}
        disabled={isRecycleView && !isFolder}
        data-selected={!isFolder && (selectedNoteId === entity.id || selected) ? true : undefined}
        onClick={() => {
          if (!isFolder && selectionMode) onToggleSelection(entity.id, !selected);
          else if (isFolder) onSelectFolder(entity.id);
          else onSelectNote(entity.id);
        }}
      >
      <span className={styles.tileArt}>
        {isFolder ? (
          <span className={styles.folderArt} data-art-kind="folder" data-count={String(count).padStart(2, '0')} aria-hidden="true" />
        ) : (
          <span className={`${styles.documentArt} ${documentToneClass(status)}`} data-art-kind="document" aria-hidden="true" />
        )}
      </span>
      <span className={styles.tileCopy}>
        <strong title={isFolder ? item.folder.name : item.note.title || '未命名笔记'}>{isFolder ? item.folder.name : item.note.title || '未命名笔记'}</strong>
        <small>{isFolder ? `${count} 项` : formatUpdatedAt(entity.updatedAt)}</small>
      </span>
      </button>
      {!isFolder && isRecycleView ? (
        <span className={styles.tileActions}>
          <RecycleNoteActions
            note={item.note}
            pending={recyclePendingId === item.note.id}
            onRestore={onRestore}
            onRequestPermanentDelete={onRequestPermanentDelete}
          />
        </span>
      ) : null}
    </div>
  );
}

function BatchTagDialog({ isOpen, tags, count, pending, error, onOpenChange, onSave }: {
  isOpen: boolean;
  tags: Array<{ id: string; name?: string }>;
  count: number;
  pending: boolean;
  error: string;
  onOpenChange(open: boolean): void;
  onSave(tagId: string): Promise<void>;
}) {
  const [tagId, setTagId] = useState('');

  useEffect(() => {
    if (isOpen) setTagId(tags[0]?.id ?? '');
  }, [isOpen, tags]);

  return (
    <Dialog title="批量添加标签" description={`为选中的 ${count} 篇笔记添加同一个标签。`} isOpen={isOpen} onOpenChange={onOpenChange} isPending={pending}>
      <DialogBody>
        {tags.length > 0 ? <label className={styles.tagSelect}>
          <span>选择标签</span>
          <select name="batch-note-tag" aria-label="选择要批量添加的标签" value={tagId} disabled={pending} onChange={(event) => setTagId(event.target.value)}>
            {tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name || '未命名标签'}</option>)}
          </select>
        </label> : <p className={styles.dialogHint}>当前笔记库还没有可用标签。</p>}
        {error ? <p className={styles.batchError} role="alert">{error}</p> : null}
      </DialogBody>
      <DialogFooter>
        <DialogClose variant="ghost">取消</DialogClose>
        <Button variant="primary" isPending={pending} isDisabled={!tagId} onPress={() => void onSave(tagId)}>添加标签</Button>
      </DialogFooter>
    </Dialog>
  );
}

function RecycleNoteActions({ note, pending, onRestore, onRequestPermanentDelete }: {
  note: Note;
  pending: boolean;
  onRestore(note: Note): void;
  onRequestPermanentDelete(note: Note): void;
}) {
  const title = note.title || '无标题笔记';
  return (
    <MenuTrigger>
      <GhostIconButton size={30} aria-label={`${title}的回收站操作`} disabled={pending}>
        <MoreHorizontalIcon size={16} />
      </GhostIconButton>
      <MenuPopover placement="bottom end">
        <Menu ariaLabel={`${title}的回收站操作`}>
          <MenuItem id="restore" icon={<RefreshIcon size={14} />} onAction={() => onRestore(note)}>恢复笔记</MenuItem>
          <MenuItem id="permanent-delete" icon={<DeleteIcon size={14} />} isDanger onAction={() => onRequestPermanentDelete(note)}>彻底删除</MenuItem>
        </Menu>
      </MenuPopover>
    </MenuTrigger>
  );
}

function statusClassName(status: string): string {
  if (status === '文件夹') return styles.statusFolder;
  if (status === '回收站') return styles.statusMuted;
  if (/完成|已完成/.test(status)) return styles.statusDone;
  return /草稿|待整理|文稿/.test(status) ? styles.statusDraft : styles.statusActive;
}

function documentToneClass(status: string): string {
  if (/完成|已完成/.test(status)) return styles.documentGreen;
  if (/草稿|待整理|文稿/.test(status)) return styles.documentOrange;
  return /进行|活跃/.test(status) ? styles.documentBlue : styles.documentPurple;
}

function sortNotes(notes: Note[], sort: SortMode): Note[] {
  if (sort === 'name-asc') return [...notes].sort((left, right) => left.title.localeCompare(right.title, 'zh-CN'));
  const direction = sort === 'updated-desc' ? -1 : 1;
  return [...notes].sort((left, right) => direction * (Date.parse(left.updatedAt ?? '') - Date.parse(right.updatedAt ?? '')));
}

function compareFolderItems(left: IndexItem, right: IndexItem): number {
  if (left.kind !== 'folder' || right.kind !== 'folder') return 0;
  return left.folder.name.localeCompare(right.folder.name, 'zh-CN');
}

function nextSort(sort: SortMode): SortMode {
  if (sort === 'updated-desc') return 'updated-asc';
  if (sort === 'updated-asc') return 'name-asc';
  return 'updated-desc';
}

function itemKey(item: IndexItem): string {
  return `${item.kind}:${item.kind === 'folder' ? item.folder.id : item.note.id}`;
}
