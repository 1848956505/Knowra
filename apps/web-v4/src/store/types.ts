import type {
  WorkspaceDataMode,
  WorkspaceServerData,
  WorkspaceSnapshot,
  WorkspaceLoadState,
  WorkspaceApi,
  KeyValueStorage,
  Note
} from '@study-accelerator/web-core';

export interface WorkspaceDependencies {
  api: WorkspaceApi;
  storage?: KeyValueStorage | null;
  cacheKey: string;
  mockSnapshot: WorkspaceSnapshot;
}

export interface WorkspaceSlice {
  serverData: WorkspaceServerData;
  dataMode: WorkspaceDataMode;
  workspaceLoadState: WorkspaceLoadState;
  workspaceError: string | null;
  loadWorkspace(): Promise<void>;
  retryWorkspace(): Promise<void>;
  canWriteWorkspace(): boolean;
  createNote(folderId: string | null, title: string): Promise<string>;
  importMarkdownNotes(
    folderId: string | null,
    sources: Array<{ fileName: string; rawMarkdown: string }>
  ): Promise<{ firstNoteId: string; count: number }>;
  duplicateNote(noteId: string): Promise<string>;
  createFolder(parentId: string | null, name: string): Promise<string>;
  renameNote(noteId: string, title: string): Promise<void>;
  loadNoteContent(noteId: string): Promise<void>;
  saveNoteContent(noteId: string, rawMarkdown: string, expectedUpdatedAt?: string): Promise<Note>;
  deleteNote(noteId: string): Promise<void>;
  setNoteFavorite(noteId: string, favorite: boolean): Promise<void>;
  renameFolder(folderId: string, name: string): Promise<void>;
  deleteFolder(folderId: string): Promise<void>;
  emptyRecycleBin(): Promise<number>;
}

export type WorkDomain = 'materials' | 'knowledge' | 'training' | 'learning' | 'profile';

export const WORK_DOMAINS: readonly WorkDomain[] = [
  'materials',
  'knowledge',
  'training',
  'learning',
  'profile'
] as const;

export interface NavigationState {
  activeWorkDomain: WorkDomain;
  activeDomainView: string;
  selectedFolderId: string | null;
  selectedNoteId: string | null;
  openFolders: Record<string, boolean>;
  openNoteTabs: string[];
}

export interface NavigationSlice {
  navigation: NavigationState;
  selectFolder(folderId: string | null): void;
  selectNote(noteId: string | null): void;
  closeNoteTab(noteId: string): string | null;
  closeOtherNoteTabs(noteId: string): void;
  reorderNoteTabs(sourceNoteId: string, targetNoteId: string): void;
  toggleFolder(folderId: string): void;
  setActiveWorkDomain(domain: WorkDomain): void;
}

export type NotesIndexScope = 'all' | 'recent' | 'favorites' | 'unfiled' | 'trash';

export interface NotesIndexState {
  scope: NotesIndexScope;
  selectedTagId: string | null;
  query: string;
  matchingNoteIds: string[] | null;
  searchState: 'idle' | 'loading' | 'ready' | 'error';
}

export interface NotesIndexSlice {
  notesIndex: NotesIndexState;
  selectNotesScope(scope: NotesIndexScope): void;
  selectNotesFolder(folderId: string | null): void;
  selectNotesTag(tagId: string | null): void;
  setNotesQuery(query: string): void;
  searchNotes(query: string): Promise<void>;
}

export interface StatusSlice {
  statusMessage: string;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  saveError: string | null;
  setStatusMessage(message: string): void;
  beginSave(message?: string): void;
  finishSave(message?: string): void;
  failSave(error: unknown): void;
}

export type AppStore = WorkspaceSlice & NavigationSlice & NotesIndexSlice & StatusSlice;
