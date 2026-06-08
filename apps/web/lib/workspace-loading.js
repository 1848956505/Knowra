export function createBackendSnapshot(state) {
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

export function selectLoadRecovery({ backendAvailable, cachedSnapshot }) {
  if (backendAvailable) {
    return 'backend';
  }

  if (cachedSnapshot) {
    return 'cache';
  }

  return 'mock';
}

export function selectInitialWorkspaceSource({ cachedSnapshot }) {
  return cachedSnapshot ? 'cache' : 'loading';
}

export function mergeWorkspaceSnapshots(initialSnapshot, cachedSnapshot) {
  if (!initialSnapshot) {
    return cachedSnapshot ?? null;
  }

  if (!cachedSnapshot) {
    return initialSnapshot;
  }

  return {
    ...initialSnapshot,
    openFolders: cachedSnapshot.openFolders ?? initialSnapshot.openFolders ?? {},
    openNoteTabs: cachedSnapshot.openNoteTabs ?? initialSnapshot.openNoteTabs ?? [],
    selectedFolderId: cachedSnapshot.selectedFolderId ?? initialSnapshot.selectedFolderId ?? null,
    selectedNoteId: cachedSnapshot.selectedNoteId ?? initialSnapshot.selectedNoteId ?? null
  };
}

export function createInitialWorkspaceScript(snapshot) {
  if (!snapshot) {
    return '';
  }

  const serializedSnapshot = JSON.stringify(snapshot).replace(/</g, '\\u003c');

  return `<script>window.__STUDY_INITIAL_WORKSPACE__=${serializedSnapshot};</script>`;
}
