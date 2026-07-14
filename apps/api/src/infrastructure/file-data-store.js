import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_STATE = {
  spaces: [],
  folders: [],
  tags: [],
  notes: [],
  attachments: [],
  contentAnnotations: []
};

function ensureParentDirectory(filePath) {
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true });
}

function cloneDefaultState() {
  return {
    spaces: [],
    folders: [],
    tags: [],
    notes: [],
    attachments: [],
    contentAnnotations: []
  };
}

function normalizeState(input = {}) {
  return {
    spaces: Array.isArray(input.spaces) ? input.spaces : [],
    folders: Array.isArray(input.folders) ? input.folders : [],
    tags: Array.isArray(input.tags) ? input.tags : [],
    notes: Array.isArray(input.notes) ? input.notes : [],
    attachments: Array.isArray(input.attachments) ? input.attachments : [],
    contentAnnotations: Array.isArray(input.contentAnnotations) ? input.contentAnnotations : []
  };
}

function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

function replaceCollection(target, source) {
  target.splice(0, target.length, ...source);
}

export function createFileDataStore(filePath) {
  ensureParentDirectory(filePath);

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(DEFAULT_STATE, null, 2));
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = raw.trim() ? JSON.parse(raw) : cloneDefaultState();
  const normalized = normalizeState(parsed);
  const state = {
    spaces: normalized.spaces,
    folders: normalized.folders,
    tags: normalized.tags,
    notes: normalized.notes,
    attachments: normalized.attachments,
    contentAnnotations: normalized.contentAnnotations
  };

  function flush() {
    fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
  }

  function exportSnapshot() {
    return {
      exportedAt: new Date().toISOString(),
      version: 'v1-local-json',
      data: cloneState(state)
    };
  }

  function importSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') {
      throw new Error('Import payload must be an object');
    }

    const incomingData = snapshot.data ?? snapshot;
    const normalizedState = normalizeState(incomingData);

    replaceCollection(state.spaces, normalizedState.spaces);
    replaceCollection(state.folders, normalizedState.folders);
    replaceCollection(state.tags, normalizedState.tags);
    replaceCollection(state.notes, normalizedState.notes);
    replaceCollection(state.attachments, normalizedState.attachments);
    replaceCollection(state.contentAnnotations, normalizedState.contentAnnotations);
    flush();

    return exportSnapshot();
  }

  return {
    state,
    flush,
    exportSnapshot,
    importSnapshot
  };
}
