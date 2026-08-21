import type {
  WorkspaceDataMode,
  WorkspaceServerData,
  WorkspaceSnapshot,
  WorkspaceLoadState,
  WorkspaceApi,
  KeyValueStorage,
  CreateFolderInput,
  UpdateFolderInput,
  CreateNoteInput,
  UpdateNoteInput
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
  createFolder(input: CreateFolderInput): Promise<void>;
  updateFolder(folderId: string, input: UpdateFolderInput): Promise<void>;
  deleteFolder(folderId: string): Promise<void>;
  createNote(input: CreateNoteInput): Promise<void>;
  updateNote(noteId: string, input: UpdateNoteInput): Promise<void>;
  deleteNote(noteId: string): Promise<void>;
  restoreNote(noteId: string): Promise<void>;
  permanentlyDeleteNote(noteId: string): Promise<void>;
  setNoteFavorite(noteId: string, favorite: boolean): Promise<void>;
  setNoteTags(noteId: string, tagIds: string[]): Promise<void>;
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
  setActiveWorkDomain(domain: WorkDomain): void;
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

export type AppStore = WorkspaceSlice & NavigationSlice & StatusSlice;
