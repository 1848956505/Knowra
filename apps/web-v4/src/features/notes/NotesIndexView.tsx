import { useMemo, useState } from 'react';
import type { Folder, Note } from '@study-accelerator/web-core';
import {
  ArrowUpRightIcon,
  FolderIcon,
  NoteIcon,
  PlusIcon,
  SearchIcon
} from '../../shell/icons';
import { PathTrail } from '../../shell/PathTrail';
import { pathForSurface, type PathSegment } from '../../shell/path';
import { useAppStore } from '../../store/AppStoreProvider';
import { CreateEntryDialog, type CreateMode } from './CreateEntryDialog';
import { filterNotes, folderMatchesQuery, formatUpdatedAt } from './notesIndexModel';
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

export function NotesIndexView({ path }: { path: PathSegment[] }) {
  const serverData = useAppStore((state) => state.serverData);
  const notesIndex = useAppStore((state) => state.notesIndex);
  const navigation = useAppStore((state) => state.navigation);
  const setNotesQuery = useAppStore((state) => state.setNotesQuery);
  const selectFolder = useAppStore((state) => state.selectNotesFolder);
  const selectNote = useAppStore((state) => state.selectNote);
  const createNote = useAppStore((state) => state.createNote);
  const createFolder = useAppStore((state) => state.createFolder);
  const canWrite = useAppStore((state) => state.canWriteWorkspace());
  const [view, setView] = useState<ViewMode>('list');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [sort, setSort] = useState<SortMode>('updated-desc');
  const [createMode, setCreateMode] = useState<CreateMode>(null);
  const currentSegment = path.find((segment) => segment.current) ?? path.at(-1);
  const parentPath = currentSegment
    ? pathForSurface(path, 'notes-index').filter((segment) => segment.id !== currentSegment.id)
    : [];

  const items = useMemo(() => {
    const visibleNotes = filterNotes(serverData.notes, serverData.tags, {
      notesIndex,
      selectedFolderId: navigation.selectedFolderId
    });
    const selectedFolder = navigation.selectedFolderId
      ? serverData.foldersById[navigation.selectedFolderId]
      : null;
    const visibleFolders = notesIndex.scope === 'all' && !notesIndex.selectedTagId
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
  }, [navigation.selectedFolderId, notesIndex, serverData, sort, typeFilter]);

  if (!currentSegment) return null;

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
            <span>{view === 'list' ? '列表视图' : '网格视图'} · {SORT_LABELS[sort]}</span>
          </span>
        </nav>
        <div className={styles.actions} aria-label="笔记操作">
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
          <button type="button" className={view === 'grid' ? styles.viewActive : ''} aria-label="网格视图" aria-pressed={view === 'grid'} onClick={() => setView('grid')}><FolderIcon size={16} /></button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className={styles.empty} role="status">没有符合当前筛选条件的笔记或文件夹</div>
      ) : view === 'list' ? (
        <NotesTable items={items} selectedNoteId={navigation.selectedNoteId} onSelectFolder={selectFolder} onSelectNote={selectNote} foldersById={serverData.foldersById} />
      ) : (
        <div className={styles.grid} aria-label="笔记网格视图">
          {items.map((item) => <IndexTile key={itemKey(item)} item={item} onSelectFolder={selectFolder} onSelectNote={selectNote} />)}
        </div>
      )}

      <CreateEntryDialog
        mode={createMode}
        parentFolderId={navigation.selectedFolderId}
        onOpenChange={(open) => { if (!open) setCreateMode(null); }}
        onCreateNote={createNote}
        onCreateFolder={createFolder}
      />
    </article>
  );
}

function FilterButton({ label, selected, onSelect }: { label: string; selected: boolean; onSelect(): void }) {
  return <button type="button" className={`${styles.filter} ${selected ? styles.selected : ''}`} aria-pressed={selected} onClick={onSelect}>{label}</button>;
}

function NotesTable({ items, selectedNoteId, onSelectFolder, onSelectNote, foldersById }: { items: IndexItem[]; selectedNoteId: string | null; onSelectFolder(id: string): void; onSelectNote(id: string): void; foldersById: Record<string, Folder> }) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead><tr><th scope="col">名称</th><th scope="col">状态</th><th scope="col">位置</th><th scope="col">最近更新</th><th scope="col"><span className={styles.srOnly}>操作</span></th></tr></thead>
        <tbody>{items.map((item) => {
          const isFolder = item.kind === 'folder';
          const id = isFolder ? item.folder.id : item.note.id;
          const name = isFolder ? item.folder.name : item.note.title;
          const updatedAt = isFolder ? item.folder.updatedAt : item.note.updatedAt;
          const location = isFolder ? '笔记库' : (item.note.folderId ? foldersById[item.note.folderId]?.name ?? '未整理' : '未整理');
          const status = isFolder ? '文件夹' : (item.note.deleted ? '回收站' : item.note.status || '文稿');
          return (
            <tr key={itemKey(item)} data-selected={!isFolder && selectedNoteId === id ? true : undefined}>
              <td><button type="button" className={styles.nameCell} onClick={() => isFolder ? onSelectFolder(id) : onSelectNote(id)}>{isFolder ? <FolderIcon size={20} /> : <NoteIcon size={20} />}<strong>{name || '未命名笔记'}</strong></button></td>
              <td><span className={styles.status}><span className={styles.statusDot} />{status}</span></td>
              <td>{location}</td><td>{formatUpdatedAt(updatedAt)}</td><td className={styles.more}>···</td>
            </tr>
          );
        })}</tbody>
      </table>
    </div>
  );
}

function IndexTile({ item, onSelectFolder, onSelectNote }: { item: IndexItem; onSelectFolder(id: string): void; onSelectNote(id: string): void }) {
  const isFolder = item.kind === 'folder';
  const entity = isFolder ? item.folder : item.note;
  return <button type="button" className={styles.tile} onClick={() => isFolder ? onSelectFolder(entity.id) : onSelectNote(entity.id)}><span className={styles.tileIcon}>{isFolder ? <FolderIcon size={24} /> : <NoteIcon size={22} />}</span><strong>{isFolder ? item.folder.name : item.note.title}</strong><small>{isFolder ? '文件夹' : item.note.status || '文稿'} · {formatUpdatedAt(entity.updatedAt)}</small></button>;
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
