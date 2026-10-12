import { useSyncExternalStore } from 'react';

export interface NotesIndexAppearance {
  mode: 'light' | 'dark';
  theme: 'orange' | 'mono';
  shape: 'pill' | 'rounded';
  deco: 'full' | 'off';
}

export const NOTES_INDEX_APPEARANCE_KEY = 'knowra:notes-index-appearance:v1';
export const DEFAULT_NOTES_INDEX_APPEARANCE: Readonly<NotesIndexAppearance> = {
  mode: 'light', theme: 'orange', shape: 'pill', deco: 'full'
};
const listeners = new Set<() => void>();
let snapshot = readAppearance();
let hasUnsavedChanges = false;

export function parseNotesIndexAppearance(value: unknown): NotesIndexAppearance {
  const candidate = value && typeof value === 'object' ? value as Partial<NotesIndexAppearance> : {};
  return {
    mode: candidate.mode === 'dark' ? 'dark' : 'light',
    theme: candidate.theme === 'mono' ? 'mono' : 'orange',
    shape: candidate.shape === 'rounded' ? 'rounded' : 'pill',
    deco: candidate.deco === 'off' ? 'off' : 'full'
  };
}

function readAppearance(): NotesIndexAppearance {
  try {
    return parseNotesIndexAppearance(JSON.parse(localStorage.getItem(NOTES_INDEX_APPEARANCE_KEY) ?? 'null'));
  } catch {
    return { ...DEFAULT_NOTES_INDEX_APPEARANCE };
  }
}

function publish(next: NotesIndexAppearance) {
  if (Object.keys(next).every(key => next[key as keyof NotesIndexAppearance] === snapshot[key as keyof NotesIndexAppearance])) return;
  snapshot = next;
  listeners.forEach(listener => listener());
}

function onStorage(event: StorageEvent) {
  if (event.key === NOTES_INDEX_APPEARANCE_KEY || event.key === null) {
    hasUnsavedChanges = false;
    publish(readAppearance());
  }
}

function subscribe(listener: () => void) {
  if (listeners.size === 0 && typeof window !== 'undefined') {
    window.addEventListener('storage', onStorage);
    if (!hasUnsavedChanges) publish(readAppearance());
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
  };
}

export function setNotesIndexAppearance(patch: Partial<NotesIndexAppearance>) {
  const next = parseNotesIndexAppearance({ ...snapshot, ...patch });
  try {
    localStorage.setItem(NOTES_INDEX_APPEARANCE_KEY, JSON.stringify(next));
    hasUnsavedChanges = false;
  } catch {
    hasUnsavedChanges = true; // 无存储权限时保留本次会话的外观，包括组件重新挂载。
  }
  publish(next);
}

export function useNotesIndexAppearance() {
  return useSyncExternalStore(subscribe, () => snapshot, () => DEFAULT_NOTES_INDEX_APPEARANCE);
}
