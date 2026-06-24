function isWorkspaceSnapshot(snapshot) {
  return Boolean(
    snapshot
    && Array.isArray(snapshot.folderTree)
    && Array.isArray(snapshot.allNotes)
    && snapshot.folderTree.every(isFolderNode)
    && snapshot.allNotes.every(isNoteNode)
  );
}

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isFolderNode(node) {
  if (!isRecord(node)) {
    return false;
  }

  if (node.children === undefined) {
    return true;
  }

  return Array.isArray(node.children) && node.children.every(isFolderNode);
}

function isNoteNode(note) {
  if (!isRecord(note)) {
    return false;
  }

  if (note.tagIds !== undefined && !Array.isArray(note.tagIds)) {
    return false;
  }

  if (note.internalLinks !== undefined && !Array.isArray(note.internalLinks)) {
    return false;
  }

  return true;
}

export function readWorkspaceCache(storage, key) {
  try {
    const raw = storage?.getItem(key);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    return isWorkspaceSnapshot(parsed) ? parsed : null;
  } catch (error) {
    return null;
  }
}

export function writeWorkspaceCache(storage, key, snapshot) {
  try {
    storage?.setItem(key, JSON.stringify(snapshot));
  } catch (error) {
    // Ignore cache failures in restricted browser contexts.
  }
}

export function clearWorkspaceCache(storage, key) {
  try {
    storage?.removeItem(key);
  } catch (error) {
    // Ignore cache cleanup failures in restricted browser contexts.
  }
}

export function readInitialWorkspaceSnapshot(source) {
  const snapshot = source?.__STUDY_INITIAL_WORKSPACE__;
  return isWorkspaceSnapshot(snapshot) ? snapshot : null;
}
