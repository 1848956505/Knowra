import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { Note } from '@study-accelerator/web-core';
import { useAppStore } from '../../store/AppStoreProvider';
import { useLocation, useNavigate } from '../../app/router';
import { workspaceCapabilities } from '../../store/workspaceCapabilities';
import { buildIndexPath, indexRoute } from './notesIndexNavigation';
import { useNotesIndexData } from './useNotesIndexData';
import { useSidebarTreeOperations } from './useSidebarTreeOperations';
import { useEntryDragDrop, useEntryDropTarget } from './EntryDragDrop';
import { DEFAULT_DISPLAY_PROPERTIES, itemKey, type ViewMode, type TypeFilter, type SortMode, type GroupMode, type IndexItem } from './notesIndexPresentation';
import { filterIndexItems, type FilterLevel, type IndexFilters } from './notesIndexFilters';
import { groupIndexItems, paginateIndexGroups } from './notesIndexGroups';

/** 数据、路由与异步操作保持原有 store 所有权；这里仅编排索引局部状态。 */
export function useNotesIndexController(onOpenNote?: (id: string) => void) {
  const store = useAppStore(state => state);
  const { serverData, notesIndex, navigation } = store;
  const canWrite = store.canWriteWorkspace();
  const supportsPermanentDelete = workspaceCapabilities(store.persistenceMode).permanentDelete;
  const navigate = useNavigate();
  const location = useLocation();
  const queryString = location.pathname.split('?')[1] ?? '';
  const urlTagIds = useMemo(() => (new URLSearchParams(queryString).get('tags') ?? '').split(',')
    .filter(id => serverData.tags.some(tag => tag.id === id)), [queryString, serverData.tags]);
  const tagMatch: 'all' | 'any' = new URLSearchParams(queryString).get('match') === 'any' ? 'any' : 'all';
  const isRecycleView = notesIndex.scope === 'trash';
  const [view, setView] = useState<ViewMode>('grid');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [sort, setSort] = useState<SortMode>('updated-desc');
  const [group, setGroup] = useState<GroupMode>('updated');
  const [properties, setProperties] = useState({ ...DEFAULT_DISPLAY_PROPERTIES });
  const [iconSize, setIconSize] = useState<'s' | 'm' | 'l'>('m');
  const [filters, setFilters] = useState<IndexFilters>({ statuses: [], updatedWithin: null });
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [peekOpen, setPeekOpen] = useState(false);
  const [peekKey, setPeekKey] = useState<string | null>(null);
  const [filterMenu, setFilterMenu] = useState<{ level: FilterLevel } | null>(null);
  const filterAnchorRef = useRef<Element | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set());
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const [batchTagOpen, setBatchTagOpen] = useState(false);
  const [batchPending, setBatchPending] = useState(false);
  const [batchError, setBatchError] = useState('');
  const [recyclePendingId, setRecyclePendingId] = useState<string | null>(null);
  const [permanentDeleteTarget, setPermanentDeleteTarget] = useState<Note | null>(null);
  const [backgroundMenu, setBackgroundMenu] = useState<{ x: number; y: number } | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [remoteRevision, setRemoteRevision] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const data = useNotesIndexData({ sort, typeFilter, queryString, urlTagIds, tagMatch, remoteRevision });
  const refresh = () => { data.setRemotePage(null); setRemoteRevision(value => value + 1); };
  const treeOperations = useSidebarTreeOperations(refresh);
  const entryDragDrop = useEntryDragDrop();
  const backgroundDrop = useEntryDropTarget(!isRecycleView && !selectionMode
    ? navigation.selectedFolderId ?? (notesIndex.scope === 'root' ? null : undefined) : undefined);
  const openNote = onOpenNote ?? store.selectNote;
  function openIndexRoute(to: string) {
    const params = new URLSearchParams(to.split('?')[1]);
    const folder = params.get('folder');
    if (folder) store.selectNotesFolder(folder);
    else store.selectNotesScope(params.get('scope') === 'root' ? 'root' : 'all');
    navigate(to);
  }
  const indexPath = buildIndexPath(notesIndex.scope, navigation.selectedFolderId, serverData.foldersById, openIndexRoute);
  const allItems = useMemo(() => filterIndexItems(data.items, filters, Date.now()), [data.items, filters]);
  const groupedItems = groupIndexItems(allItems, { group, foldersById: serverData.foldersById, now: Date.now() });
  const { pageCount, currentPage, items, groups } = paginateIndexGroups(groupedItems, { page, pageSize, collapsed });
  const peekItem = allItems.find(item => `${item.kind}:${item.kind === 'note' ? item.note.id : item.folder.id}` === peekKey) ?? null;
  const selectableNoteIds = items.flatMap(item => item.kind === 'note' && !item.note.deleted ? [item.note.id] : []);
  const allPageNotesSelected = selectableNoteIds.length > 0 && selectableNoteIds.every(id => selectedNoteIds.has(id));

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const editing = target?.closest('input, textarea, [contenteditable="true"], [role="dialog"]');
      if (!editing && event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault(); searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', focusSearch);
    return () => window.removeEventListener('keydown', focusSearch);
  }, []);
  // 焦点不在列表条目上时（刚进入页面、点了空白处），J/K 先把焦点送进列表：已预览的条目优先，否则第一项。
  const peekKeyRef = useRef(peekKey);
  peekKeyRef.current = peekKey;
  useEffect(() => {
    const enterList = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || (key !== 'j' && key !== 'k')) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target || target.closest('input, textarea, select, [contenteditable="true"], [role="menu"], [role="dialog"], [data-entry-item]')) return;
      if (target !== document.body && !target.closest('[aria-label="笔记索引"]')) return;
      const entries = Array.from(contentRef.current?.querySelectorAll<HTMLElement>('[data-entry-item]') ?? []);
      const entry = entries.find(value => value.dataset.entryKey === peekKeyRef.current) ?? entries[0];
      const button = entry?.querySelector<HTMLElement>('button:not([disabled])');
      if (!button) return;
      event.preventDefault(); button.focus();
    };
    window.addEventListener('keydown', enterList);
    return () => window.removeEventListener('keydown', enterList);
  }, []);
  useEffect(() => { if (page !== currentPage) setPage(currentPage); }, [page, currentPage]);
  useEffect(() => { contentRef.current?.scrollTo?.({ top: 0 }); }, [navigation.selectedFolderId, notesIndex.scope, page, view, typeFilter]);
  useEffect(() => {
    setPage(0); setSelectedNoteIds(new Set()); setPeekKey(null); setCollapsed(new Set());
  }, [navigation.selectedFolderId, serverData.currentSpaceId, notesIndex.query, notesIndex.scope, notesIndex.selectedTagId, sort, queryString, typeFilter, pageSize, filters]);
  useEffect(() => {
    if (!canWrite || isRecycleView) { setSelectionMode(false); setSelectedNoteIds(new Set()); }
  }, [canWrite, isRecycleView]);

  function selectFolder(id: string) { openIndexRoute(indexRoute('all', id)); }
  function selectItem(item: IndexItem) {
    if (peekOpen) setPeekKey(`${item.kind}:${item.kind === 'note' ? item.note.id : item.folder.id}`);
    else if (item.kind === 'folder') selectFolder(item.folder.id);
    else openNote(item.note.id);
  }
  function toggleNoteSelection(id: string, selected: boolean) {
    if (!canWrite || isRecycleView) return;
    setSelectionMode(true);
    setSelectedNoteIds(current => { const next = new Set(current); if (selected) next.add(id); else next.delete(id); return next; });
  }
  /** 列表快捷键：J/K 移动、X 选择、Space 预览；Enter 沿用按钮自身的“打开”。 */
  function handleEntryKeys(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    const target = event.target as Element;
    if (target.closest('input, textarea, select, [contenteditable="true"], [role="menu"], [role="dialog"]')) return;
    const entry = target.closest<HTMLElement>('[data-entry-item]');
    if (!entry) return;
    const key = event.key.toLowerCase();
    if (key === 'j' || key === 'k') {
      const entries = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[data-entry-item]'));
      const next = entries[entries.indexOf(entry) + (key === 'j' ? 1 : -1)];
      event.preventDefault();
      next?.querySelector<HTMLElement>('button:not([disabled])')?.focus();
      return;
    }
    const item = allItems.find(value => itemKey(value) === entry.dataset.entryKey);
    if (event.key === 'Enter' && peekOpen && item && target === entry.querySelector('button')) {
      // 预览栏开着时点击只切换预览；Enter 始终是“打开”。
      event.preventDefault(); event.stopPropagation();
      if (item.kind === 'folder') selectFolder(item.folder.id); else openNote(item.note.id);
      return;
    }
    if (key === 'x') {
      event.preventDefault();
      if (item?.kind === 'note' && canWrite && !isRecycleView) toggleNoteSelection(item.note.id, !selectedNoteIds.has(item.note.id));
    } else if (event.key === ' ') {
      // 阻止按钮把空格当作“按下”，改为预览。
      event.preventDefault(); event.stopPropagation();
      if (!item) return;
      const itemId = itemKey(item);
      if (peekOpen && peekKey === itemId) setPeekOpen(false);
      else { setPeekOpen(true); setPeekKey(itemId); }
    }
  }
  function swallowEntrySpace(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key !== ' ' || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    const target = event.target as Element;
    if (target.closest('input, textarea, select, [role="menu"], [role="dialog"]') || !target.closest('[data-entry-item]')) return;
    event.preventDefault(); event.stopPropagation();
  }
  async function runBatch(action: () => Promise<void>) {
    if (!canWrite || batchPending) return false;
    setBatchPending(true); setBatchError('');
    try { await action(); setSelectedNoteIds(new Set()); setSelectionMode(false); refresh(); return true; }
    catch (error) { setBatchError(error instanceof Error ? error.message : '批量操作失败，请重试'); return false; }
    finally { setBatchPending(false); }
  }
  async function handleRestore(note: Note) {
    if (!canWrite || recyclePendingId) return;
    setRecyclePendingId(note.id); setBatchError('');
    try { await store.restoreNote(note.id); refresh(); }
    catch (error) { setBatchError(error instanceof Error ? error.message : '恢复失败，请重试'); }
    finally { setRecyclePendingId(null); }
  }
  function changeTags(ids: string[], match = tagMatch) {
    const params = new URLSearchParams(queryString);
    if (ids.length) params.set('tags', ids.join(',')); else params.delete('tags');
    params.set('match', match); navigate(`/materials?${params}`);
  }
  function openFilterMenu(anchor: Element | null, level: FilterLevel = 'root') {
    filterAnchorRef.current = anchor; setFilterMenu({ level });
  }
  function clearFilters() { setFilters({ statuses: [], updatedWithin: null }); if (urlTagIds.length) changeTags([]); }
  return { store, serverData, notesIndex, navigation, canWrite, supportsPermanentDelete, navigate,
    queryString, urlTagIds, tagMatch, isRecycleView, view, setView, typeFilter, setTypeFilter, sort, setSort,
    group, setGroup, properties, setProperties, iconSize, setIconSize, filters, setFilters, collapsed, setCollapsed,
    peekOpen, setPeekOpen, peekItem, setPeekKey, filterMenu, setFilterMenu, filterAnchorRef, openFilterMenu, clearFilters, importOpen, setImportOpen,
    selectionMode, setSelectionMode, selectedNoteIds, setSelectedNoteIds, batchDeleteOpen, setBatchDeleteOpen,
    batchTagOpen, setBatchTagOpen, batchPending, batchError, setBatchError, recyclePendingId, setRecyclePendingId,
    permanentDeleteTarget, setPermanentDeleteTarget, backgroundMenu, setBackgroundMenu, pageSize, setPageSize,
    setPage, searchRef, contentRef, data, refresh, treeOperations, entryDragDrop, backgroundDrop, openNote,
    indexPath, allItems, items, groups, pageCount, currentPage, selectableNoteIds, allPageNotesSelected,
    selectFolder, selectItem, toggleNoteSelection, handleEntryKeys, swallowEntrySpace, runBatch, handleRestore, changeTags };
}
export type NotesIndexController = ReturnType<typeof useNotesIndexController>;
