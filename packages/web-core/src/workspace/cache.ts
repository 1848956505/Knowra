import { isRecord } from '../api/response.js';
import type { WorkspaceSnapshot } from './types.js';

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export const BACKEND_WORKSPACE_CACHE_KEY = 'study-accelerator.backend-workspace-cache';

export function isWorkspaceSnapshot(snapshot: unknown): snapshot is WorkspaceSnapshot {
  return Boolean(isRecord(snapshot)
    && Array.isArray(snapshot.folderTree)
    && Array.isArray(snapshot.allNotes)
    && snapshot.folderTree.every(isFolderNode)
    && snapshot.allNotes.every(isNoteNode));
}

export function readWorkspaceCache(storage: KeyValueStorage | null | undefined, key: string): WorkspaceSnapshot | null {
  try {
    const raw = storage?.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isWorkspaceSnapshot(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeWorkspaceCache(
  storage: KeyValueStorage | null | undefined,
  key: string,
  snapshot: WorkspaceSnapshot
): void {
  try { storage?.setItem(key, JSON.stringify(snapshot)); } catch { /* cache is best effort */ }
}

export function clearWorkspaceCache(storage: KeyValueStorage | null | undefined, key: string): void {
  try { storage?.removeItem?.(key); } catch { /* cache is best effort */ }
}

export function readInitialWorkspaceSnapshot(source: unknown): WorkspaceSnapshot | null {
  const snapshot = isRecord(source) ? source.__STUDY_INITIAL_WORKSPACE__ : null;
  return isWorkspaceSnapshot(snapshot) ? snapshot : null;
}

function isFolderNode(node: unknown): boolean {
  if (!isRecord(node)) return false;
  return node.children === undefined || (Array.isArray(node.children) && node.children.every(isFolderNode));
}

function isNoteNode(note: unknown): boolean {
  return Boolean(isRecord(note)
    && (note.tagIds === undefined || Array.isArray(note.tagIds))
    && (note.internalLinks === undefined || Array.isArray(note.internalLinks)));
}
