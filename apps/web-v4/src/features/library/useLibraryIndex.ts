import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../../store/AppStoreProvider';
import {
  buildLibraryTreeItems,
  getLibraryCounts,
  getScopeTitle,
  paginateResources,
  selectLibraryResources
} from './libraryModel';
import {
  LIBRARY_PAGE_SIZES,
  SPECIAL_TREE_IDS,
  type LibraryFilters,
  type LibraryNameSort,
  type LibraryResource,
  type LibraryScope,
  type LibraryTab,
  type LibraryTimeSort,
  type LibraryViewMode
} from './libraryTypes';

const DEFAULT_FILTERS: LibraryFilters = { type: 'all', status: 'all', time: 'updated-desc' };

export function useLibraryIndex() {
  const serverData = useAppStore((state) => state.serverData);
  const navigation = useAppStore((state) => state.navigation);
  const selectFolder = useAppStore((state) => state.selectFolder);
  const selectNote = useAppStore((state) => state.selectNote);
  const [scope, setScope] = useState<LibraryScope>(() => navigation.selectedFolderId ? 'folder' : 'all');
  const [tab, setTab] = useState<LibraryTab>('all');
  const [keyword, setKeyword] = useState('');
  const [effectiveKeyword, setEffectiveKeyword] = useState('');
  const [filters, setFilters] = useState<LibraryFilters>(DEFAULT_FILTERS);
  const [sort, setSort] = useState<LibraryTimeSort | LibraryNameSort>('updated-desc');
  const [viewMode, setViewMode] = useState<LibraryViewMode>('list');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(() => (
    navigation.selectedNoteId ? `note:${navigation.selectedNoteId}` : null
  ));

  useEffect(() => {
    const timer = globalThis.setTimeout(() => setEffectiveKeyword(keyword), 200);
    return () => globalThis.clearTimeout(timer);
  }, [keyword]);

  const treeItems = useMemo(
    () => buildLibraryTreeItems(serverData.folderTree, serverData.notes),
    [serverData.folderTree, serverData.notes]
  );
  const counts = useMemo(() => getLibraryCounts(serverData.notes), [serverData.notes]);
  const resources = useMemo(() => selectLibraryResources({
    folders: Object.values(serverData.foldersById),
    notes: serverData.notes,
    tags: serverData.tags,
    scope,
    selectedFolderId: navigation.selectedFolderId,
    tab,
    filters,
    keyword: effectiveKeyword,
    sort
  }), [
    effectiveKeyword,
    filters,
    navigation.selectedFolderId,
    scope,
    serverData.foldersById,
    serverData.notes,
    serverData.tags,
    sort,
    tab
  ]);
  const pageData = useMemo(
    () => paginateResources(resources, page, pageSize),
    [page, pageSize, resources]
  );
  const selectedResource = resources.find((resource) => resource.id === selectedResourceId) ?? null;
  const title = getScopeTitle(scope, serverData.foldersById, navigation.selectedFolderId);
  const selectedTreeKey = scope === 'folder' && navigation.selectedFolderId
    ? `folder:${navigation.selectedFolderId}`
    : scope === 'unfiled'
      ? SPECIAL_TREE_IDS.unfiled
      : scope === 'recent'
        ? SPECIAL_TREE_IDS.recent
        : scope === 'favorites'
          ? SPECIAL_TREE_IDS.favorites
          : scope === 'recycle'
            ? SPECIAL_TREE_IDS.recycle
            : SPECIAL_TREE_IDS.all;

  useEffect(() => {
    if (selectedResourceId && resources.some((resource) => resource.id === selectedResourceId)) return;
    setSelectedResourceId(pageData.items[0]?.id ?? null);
  }, [pageData.items, resources, selectedResourceId]);

  useEffect(() => {
    setPage(1);
  }, [effectiveKeyword, filters, navigation.selectedFolderId, scope, sort, tab]);

  useEffect(() => {
    if (navigation.selectedNoteId) setSelectedResourceId(`note:${navigation.selectedNoteId}`);
  }, [navigation.selectedNoteId]);

  function selectTreeItem(key: string) {
    if (key.startsWith('folder:')) {
      const folderId = key.slice('folder:'.length);
      setScope('folder');
      setTab('all');
      selectFolder(folderId);
    } else if (key === SPECIAL_TREE_IDS.unfiled) {
      setScope('unfiled');
      setTab('all');
      selectFolder(null);
    } else if (key === SPECIAL_TREE_IDS.all) {
      setScope('all');
      setTab('all');
      selectFolder(null);
    } else if (key === SPECIAL_TREE_IDS.recent || key === SPECIAL_TREE_IDS.favorites || key === SPECIAL_TREE_IDS.recycle) {
      const nextScope = key.slice('scope:'.length) as Exclude<LibraryScope, 'folder' | 'unfiled' | 'all'>;
      setScope(nextScope);
      setTab(nextScope);
      selectFolder(null);
    }
    setSelectedResourceId(null);
  }

  function selectTab(nextTab: LibraryTab) {
    setTab(nextTab);
    setScope(nextTab);
    setSelectedResourceId(null);
    selectFolder(null);
  }

  function selectResource(resource: LibraryResource) {
    setSelectedResourceId(resource.id);
    if (resource.kind === 'note') selectNote(resource.note.id);
  }

  function resetFilters() {
    setKeyword('');
    setFilters(DEFAULT_FILTERS);
    setSort('updated-desc');
    setPage(1);
  }

  function setPageSizeAndReset(nextSize: number) {
    if (!LIBRARY_PAGE_SIZES.includes(nextSize as (typeof LIBRARY_PAGE_SIZES)[number])) return;
    setPageSize(nextSize);
    setPage(1);
  }

  return {
    counts,
    effectiveKeyword,
    filters,
    keyword,
    navigation,
    pageData,
    pageSize,
    resources,
    scope,
    selectResource,
    selectTab,
    selectTreeItem,
    selectedResource,
    selectedResourceId,
    selectedTreeKey,
    serverData,
    setFilters: (next: Partial<LibraryFilters>) => {
      setFilters((current) => ({ ...current, ...next }));
      setPage(1);
    },
    setKeyword: (next: string) => {
      setKeyword(next);
      setPage(1);
    },
    setPage,
    setPageSize: setPageSizeAndReset,
    setSort: (next: LibraryTimeSort | LibraryNameSort) => {
      setSort(next);
      setPage(1);
    },
    setViewMode,
    sort,
    tab,
    title,
    treeItems,
    viewMode,
    resetFilters
  };
}
