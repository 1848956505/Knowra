import type {
  WorkspaceDataMode,
  WorkspaceServerData,
  WorkspaceSnapshot,
  WorkspaceLoadState,
  WorkspaceApi,
  KeyValueStorage
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
