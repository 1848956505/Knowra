import { isRecord } from '../api/response.js';
import type { Folder, Note } from './types.js';

export function normalizeFolderTree(nodes: unknown): Folder[] {
  if (!Array.isArray(nodes)) return [];
  return nodes
    .filter(isRecord)
    .map((node) => ({
      ...node,
      id: String(node.id ?? ''),
      name: String(node.name ?? '未命名目录'),
      parentId: typeof node.parentId === 'string' ? node.parentId : null,
      children: normalizeFolderTree(node.children ?? [])
    } as Folder))
    .filter((node) => Boolean(node.id));
}

export function normalizeNotes(notes: unknown): Note[] {
  if (!Array.isArray(notes)) return [];
  return notes
    .filter(isRecord)
    .map((note) => ({
      ...note,
      id: String(note.id ?? ''),
      title: String(note.title ?? '未命名笔记'),
      folderId: typeof note.folderId === 'string' ? note.folderId : null,
      tagIds: Array.isArray(note.tagIds) ? [...note.tagIds].map(String) : [],
      internalLinks: Array.isArray(note.internalLinks) ? [...note.internalLinks].map(String) : [],
      rawMarkdown: typeof note.rawMarkdown === 'string' ? note.rawMarkdown : '',
      contentLoaded: typeof note.contentLoaded === 'boolean'
        ? note.contentLoaded
        : typeof note.rawMarkdown === 'string',
      favorite: Boolean(note.favorite),
      deleted: Boolean(note.deleted)
    } as Note))
    .filter((note) => Boolean(note.id));
}

export function mergeNoteSummariesWithLoadedContent(summaries: unknown, currentNotes: Note[] = []): Note[] {
  const loadedById = new Map(currentNotes
    .filter((note) => note.contentLoaded && typeof note.rawMarkdown === 'string')
    .map((note) => [note.id, note]));
  return normalizeNotes(summaries).map((summary) => {
    const loaded = loadedById.get(summary.id);
    return loaded ? {
      ...summary,
      rawMarkdown: loaded.rawMarkdown,
      plainText: loaded.plainText,
      contentLoaded: true
    } : summary;
  });
}

export function replaceNoteInCollection(
  notes: Note[],
  updatedNote: unknown,
  fallbackFields: Record<string, unknown> = {}
): Note[] {
  const normalizedNote = normalizeNotes([{ ...fallbackFields, ...(isRecord(updatedNote) ? updatedNote : {}) }])[0];
  if (!normalizedNote) return notes;
  return notes.map((note) => note.id === normalizedNote.id ? { ...note, ...normalizedNote } : note);
}

export function flattenFolderTree(folderTree: Folder[]): Record<string, Folder> {
  const result: Record<string, Folder> = {};
  const visit = (folders: Folder[]) => folders.forEach((folder) => {
    result[folder.id] = folder;
    visit(folder.children);
  });
  visit(folderTree);
  return result;
}
