import type { Folder, Note, Tag } from '@study-accelerator/web-core';

export type LibraryTab = 'all' | 'recent' | 'favorites' | 'recycle';
export type LibraryViewMode = 'list' | 'grid';
export type LibraryScope = 'all' | 'recent' | 'favorites' | 'unfiled' | 'recycle' | 'folder';
export type LibraryResourceKind = 'folder' | 'note';
export type LibraryTypeFilter = 'all' | 'folder' | 'document';
export type LibraryStatusFilter = 'all' | 'draft' | 'active' | 'published' | 'archived';
export type LibraryTimeSort = 'updated-desc' | 'updated-asc' | 'created-desc' | 'created-asc';
export type LibraryNameSort = 'name-asc' | 'name-desc';

export interface LibraryFilters {
  type: LibraryTypeFilter;
  status: LibraryStatusFilter;
  time: LibraryTimeSort;
}

export interface LibraryFolderTreeItem {
  id: string;
  label: string;
  count?: number;
  children?: LibraryFolderTreeItem[];
  isDisabled?: boolean;
  isDraggable?: boolean;
  kind: 'scope' | 'folder' | 'recycle';
  folderId?: string;
}

export interface LibraryFolderResource {
  kind: 'folder';
  id: string;
  folder: Folder;
}

export interface LibraryNoteResource {
  kind: 'note';
  id: string;
  note: Note;
}

export type LibraryResource = LibraryFolderResource | LibraryNoteResource;

export interface LibraryCounts {
  all: number;
  recent: number;
  favorites: number;
  recycle: number;
}

export interface LibraryModelInput {
  folders: Folder[];
  notes: Note[];
  tags: Tag[];
  scope: LibraryScope;
  selectedFolderId: string | null;
  tab: LibraryTab;
  filters: LibraryFilters;
  keyword: string;
  sort: LibraryTimeSort | LibraryNameSort;
}

export interface LibraryPage<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export const LIBRARY_PAGE_SIZES = [5, 10, 20, 50] as const;

export const LIBRARY_TABS: ReadonlyArray<{ id: LibraryTab; label: string }> = [
  { id: 'all', label: '全部笔记' },
  { id: 'recent', label: '最近编辑' },
  { id: 'favorites', label: '收藏' },
  { id: 'recycle', label: '回收站' }
];

export const LIBRARY_FILTER_OPTIONS = {
  type: [
    { id: 'all', label: '全部类型' },
    { id: 'folder', label: '文件夹' },
    { id: 'document', label: '文稿' }
  ],
  status: [
    { id: 'all', label: '全部状态' },
    { id: 'draft', label: '待整理' },
    { id: 'active', label: '进行中' },
    { id: 'published', label: '已完成' },
    { id: 'archived', label: '已归档' }
  ],
  time: [
    { id: 'updated-desc', label: '最近更新' },
    { id: 'updated-asc', label: '最早更新' },
    { id: 'created-desc', label: '最近创建' },
    { id: 'created-asc', label: '最早创建' }
  ]
} as const;
export const LIBRARY_SORT_OPTIONS = [
  { id: 'updated-desc', label: '最近更新' },
  { id: 'created-desc', label: '最近创建' },
  { id: 'name-asc', label: '名称 A-Z' },
  { id: 'name-desc', label: '名称 Z-A' }
] as const;

export const SPECIAL_TREE_IDS = {
  all: 'scope:all',
  recent: 'scope:recent',
  favorites: 'scope:favorites',
  unfiled: 'scope:unfiled',
  recycle: 'scope:recycle'
} as const;
