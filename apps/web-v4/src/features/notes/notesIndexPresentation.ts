import type { Folder, Note } from '@study-accelerator/web-core';
import styles from './NotesIndexItems.module.css';
export type ViewMode = 'list' | 'grid';
export type TypeFilter = 'all' | 'folder' | 'note';
export type SortMode = 'updated-desc' | 'updated-asc' | 'name-asc';
export type IndexItem = { kind: 'folder'; folder: Folder } | { kind: 'note'; note: Note };
export const SORT_LABELS: Record<SortMode, string> = { 'updated-desc': '最近更新', 'updated-asc': '最早更新', 'name-asc': '名称排序' };

export function statusClassName(status: string): string {
  if (status === '文件夹') return styles.statusFolder;
  if (status === '回收站') return styles.statusMuted;
  if (/完成|已完成/.test(status)) return styles.statusDone;
  return /草稿|待整理|文稿/.test(status) ? styles.statusDraft : styles.statusActive;
}

export function documentToneClass(status: string): string {
  if (/完成|已完成/.test(status)) return styles.documentGreen;
  if (/草稿|待整理|文稿/.test(status)) return styles.documentOrange;
  return /进行|活跃/.test(status) ? styles.documentBlue : styles.documentPurple;
}

export function sortNotes(notes: Note[], sort: SortMode): Note[] {
  if (sort === 'name-asc') return [...notes].sort((left, right) => left.title.localeCompare(right.title, 'zh-CN'));
  const direction = sort === 'updated-desc' ? -1 : 1;
  return [...notes].sort((left, right) => direction * (Date.parse(left.updatedAt ?? '') - Date.parse(right.updatedAt ?? '')));
}

export function compareFolderItems(left: IndexItem, right: IndexItem): number {
  if (left.kind !== 'folder' || right.kind !== 'folder') return 0;
  return left.folder.name.localeCompare(right.folder.name, 'zh-CN');
}

export function nextSort(sort: SortMode): SortMode {
  if (sort === 'updated-desc') return 'updated-asc';
  if (sort === 'updated-asc') return 'name-asc';
  return 'updated-desc';
}

export function itemKey(item: IndexItem): string {
  return `${item.kind}:${item.kind === 'folder' ? item.folder.id : item.note.id}`;
}
