import type { WorkspaceSnapshot } from './types.js';

export function createBackendSnapshot(state: Partial<WorkspaceSnapshot>): WorkspaceSnapshot {
  return {
    spaces: Array.isArray(state.spaces) ? state.spaces : [],
    currentSpaceId: state.currentSpaceId ?? null,
    folderTree: Array.isArray(state.folderTree) ? state.folderTree : [],
    tags: Array.isArray(state.tags) ? state.tags : [],
    allNotes: Array.isArray(state.allNotes) ? state.allNotes : [],
    openFolders: state.openFolders ?? {},
    openNoteTabs: Array.isArray(state.openNoteTabs) ? state.openNoteTabs : [],
    selectedFolderId: state.selectedFolderId ?? null,
    selectedNoteId: state.selectedNoteId ?? null
  };
}

export function selectLoadRecovery(input: {
  backendAvailable: boolean;
  cachedSnapshot: WorkspaceSnapshot | null;
}): 'backend' | 'cache' | 'mock' {
  if (input.backendAvailable) return 'backend';
  return input.cachedSnapshot ? 'cache' : 'mock';
}

export function selectInitialWorkspaceSource(input: {
  cachedSnapshot: WorkspaceSnapshot | null;
}): 'cache' | 'loading' {
  return input.cachedSnapshot ? 'cache' : 'loading';
}

export function mergeWorkspaceSnapshots(
  initialSnapshot: WorkspaceSnapshot | null,
  cachedSnapshot: WorkspaceSnapshot | null
): WorkspaceSnapshot | null {
  if (!initialSnapshot) return cachedSnapshot ?? null;
  if (!cachedSnapshot) return initialSnapshot;
  return {
    ...initialSnapshot,
    openFolders: cachedSnapshot.openFolders ?? initialSnapshot.openFolders ?? {},
    openNoteTabs: cachedSnapshot.openNoteTabs ?? initialSnapshot.openNoteTabs ?? [],
    selectedFolderId: cachedSnapshot.selectedFolderId ?? initialSnapshot.selectedFolderId ?? null,
    selectedNoteId: cachedSnapshot.selectedNoteId ?? initialSnapshot.selectedNoteId ?? null
  };
}

export function createInitialWorkspaceScript(snapshot: WorkspaceSnapshot | null): string {
  if (!snapshot) return '';
  return `<script>window.__STUDY_INITIAL_WORKSPACE__=${JSON.stringify(snapshot).replace(/</g, '\\u003c')};</script>`;
}

export function createEmptyWorkspaceSnapshot(): WorkspaceSnapshot {
  return createBackendSnapshot({});
}
