import type { Folder, Note, Tag } from '@study-accelerator/web-core';
import {
  LIBRARY_PAGE_SIZES,
  SPECIAL_TREE_IDS,
  type LibraryCounts,
  type LibraryFilters,
  type LibraryFolderTreeItem,
  type LibraryModelInput,
  type LibraryPage,
  type LibraryResource,
  type LibraryScope,
  type LibraryTab
} from './libraryTypes';

const RECENT_LIMIT = 5;

export function getLibraryCounts(notes: Note[]): LibraryCounts {
  const active = notes.filter((note) => !note.deleted);
  return {
    all: active.length,
    recent: Math.min(RECENT_LIMIT, active.length),
    favorites: active.filter((note) => note.favorite).length,
    recycle: notes.filter((note) => note.deleted).length
  };
}
export function buildLibraryTreeItems(
  folders: Folder[],
  notes: Note[]
): LibraryFolderTreeItem[] {
  const counts = getLibraryCounts(notes);
  const active = notes.filter((note) => !note.deleted);
  const folderCounts = new Map<string, number>();
  active.forEach((note) => {
    if (note.folderId) folderCounts.set(note.folderId, (folderCounts.get(note.folderId) ?? 0) + 1);
  });

  const folderNodes = (nodes: Folder[]): LibraryFolderTreeItem[] => nodes.map((folder) => ({
    id: `folder:${folder.id}`,
    label: folder.name,
    count: folderCounts.get(folder.id) ?? 0,
    kind: 'folder',
    folderId: folder.id,
    isDraggable: true,
    children: folder.children.length > 0 ? folderNodes(folder.children) : undefined
  }));

  return [
    { id: SPECIAL_TREE_IDS.all, label: '全部笔记', count: counts.all, kind: 'scope' },
    { id: SPECIAL_TREE_IDS.recent, label: '最近编辑', count: counts.recent, kind: 'scope' },
    { id: SPECIAL_TREE_IDS.favorites, label: '收藏', count: counts.favorites, kind: 'scope' },
    {
      id: SPECIAL_TREE_IDS.unfiled,
      label: '未整理',
      count: active.filter((note) => !note.folderId).length,
      kind: 'scope'
    },
    ...folderNodes(folders),
    { id: SPECIAL_TREE_IDS.recycle, label: '回收站', count: counts.recycle, kind: 'recycle' }
  ];
}

export function selectLibraryResources(input: LibraryModelInput): LibraryResource[] {
  const { folders, notes, tags, scope, selectedFolderId, tab, filters, keyword, sort } = input;
  const resolvedTab = resolveTab(scope, tab);
  const activeNotes = notes.filter((note) => !note.deleted);
  const scopedNotes = selectTabNotes(activeNotes, notes, resolvedTab)
    .filter((note) => scope !== 'unfiled' || !note.folderId)
    .filter((note) => !selectedFolderId || note.folderId === selectedFolderId)
    .filter((note) => matchesNoteFilters(note, tags, filters, keyword));

  const folderResources = resolvedTab === 'all'
    ? folders
      .filter((folder) => (folder.parentId ?? null) === selectedFolderId)
      .filter((folder) => filters.type !== 'document')
      .filter((folder) => matchesKeyword(`${folder.name} 文件夹 ${folder.pathCache ?? ''}`, keyword))
      .map((folder): LibraryResource => ({ kind: 'folder', id: `folder:${folder.id}`, folder }))
    : [];
  const noteResources = filters.type === 'folder'
    ? []
    : scopedNotes
      .filter((note) => matchesKeyword(getNoteSearchText(note, tags), keyword))
      .filter((note) => filters.status === 'all' || String(note.status ?? 'draft') === filters.status)
      .map((note): LibraryResource => ({ kind: 'note', id: `note:${note.id}`, note }));

  return [...folderResources, ...noteResources].sort((left, right) => compareResources(left, right, sort));
}

export function paginateResources(
  resources: LibraryResource[],
  page: number,
  pageSize: number
): LibraryPage<LibraryResource> {
  const safePageSize = LIBRARY_PAGE_SIZES.includes(pageSize as (typeof LIBRARY_PAGE_SIZES)[number])
    ? pageSize
    : 10;
  const totalPages = Math.max(1, Math.ceil(resources.length / safePageSize));
  const safePage = Math.min(totalPages, Math.max(1, Number.isInteger(page) ? page : 1));
  const start = (safePage - 1) * safePageSize;
  return {
    items: resources.slice(start, start + safePageSize),
    page: safePage,
    pageSize: safePageSize,
    totalItems: resources.length,
    totalPages
  };
}

export function getScopeTitle(scope: LibraryScope, foldersById: Record<string, Folder>, folderId: string | null): string {
  if (scope === 'recent') return '最近编辑';
  if (scope === 'favorites') return '收藏';
  if (scope === 'unfiled') return '未整理';
  if (scope === 'recycle') return '回收站';
  return folderId ? foldersById[folderId]?.name ?? '资料目录' : '全部笔记';
}

export function getLocationLabel(note: Note, foldersById: Record<string, Folder>): string {
  if (!note.folderId) return '未整理';
  return foldersById[note.folderId]?.name ?? '已移除目录';
}

export function getStatusLabel(status: unknown): string {
  const labels: Record<string, string> = {
    draft: '待整理',
    active: '进行中',
    published: '已完成',
    archived: '已归档'
  };
  return labels[String(status ?? 'draft')] ?? '待整理';
}

export function getSourceTypeLabel(sourceType: unknown): string {
  const labels: Record<string, string> = {
    manual: '手动笔记',
    'markdown-import': 'Markdown 导入',
    'pdf-import': 'PDF 导入',
    'imported-file': '文件资料'
  };
  return labels[String(sourceType ?? 'manual')] ?? '文稿';
}

export function getTimeLabel(value: string | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const elapsed = Math.floor(Math.max(0, Date.now() - date.getTime()) / 60000);
  if (elapsed < 60) return `${Math.max(1, elapsed)} 分钟前`;
  if (elapsed < 1440) return `${Math.floor(elapsed / 60)} 小时前`;
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' })
    .format(date)
    .replaceAll('/', '月') + '日';
}

function resolveTab(scope: LibraryScope, tab: LibraryTab): LibraryTab {
  if (scope === 'recent' || scope === 'favorites' || scope === 'recycle') return scope;
  return tab;
}

function selectTabNotes(activeNotes: Note[], allNotes: Note[], tab: LibraryTab): Note[] {
  if (tab === 'recycle') return allNotes.filter((note) => note.deleted);
  if (tab === 'favorites') return activeNotes.filter((note) => note.favorite);
  if (tab === 'recent') return [...activeNotes].sort(compareUpdated).slice(0, RECENT_LIMIT);
  return activeNotes;
}

function matchesNoteFilters(note: Note, tags: Tag[], filters: LibraryFilters, keyword: string): boolean {
  if (filters.type === 'folder') return false;
  if (filters.status !== 'all' && String(note.status ?? 'draft') !== filters.status) return false;
  return matchesKeyword(getNoteSearchText(note, tags), keyword);
}

function getNoteSearchText(note: Note, tags: Tag[]): string {
  const tagText = note.tagIds.map((id) => tags.find((tag) => tag.id === id)?.name ?? id).join(' ');
  return `${note.title} ${note.status ?? ''} ${getSourceTypeLabel(note.sourceType)} ${tagText}`;
}

function matchesKeyword(value: string, keyword: string): boolean {
  return !keyword.trim() || value.toLocaleLowerCase().includes(keyword.trim().toLocaleLowerCase());
}

function compareResources(left: LibraryResource, right: LibraryResource, sort: LibraryModelInput['sort']): number {
  if (sort === 'name-asc' || sort === 'name-desc') {
    const leftName = left.kind === 'folder' ? left.folder.name : left.note.title;
    const rightName = right.kind === 'folder' ? right.folder.name : right.note.title;
    const result = leftName.localeCompare(rightName, 'zh-CN');
    return sort === 'name-desc' ? -result : result;
  }
  const leftDate = left.kind === 'folder' ? left.folder[sort.startsWith('created') ? 'createdAt' : 'updatedAt'] : left.note[sort.startsWith('created') ? 'createdAt' : 'updatedAt'];
  const rightDate = right.kind === 'folder' ? right.folder[sort.startsWith('created') ? 'createdAt' : 'updatedAt'] : right.note[sort.startsWith('created') ? 'createdAt' : 'updatedAt'];
  const result = timestamp(leftDate) - timestamp(rightDate);
  return sort.endsWith('asc') ? result : -result;
}

function compareUpdated(left: Note, right: Note): number {
  return timestamp(right.updatedAt) - timestamp(left.updatedAt);
}

function timestamp(value: string | undefined): number {
  const result = new Date(value ?? 0).getTime();
  return Number.isNaN(result) ? 0 : result;
}
