import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_STATE = {
  spaces: [],
  folders: [],
  tags: [],
  notes: [],
  attachments: [],
  knowledgePoints: [],
  knowledgePointSources: [],
  tagGroups: [],
  knowledgePointTags: [],
  noteKnowledgePoints: []
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
    knowledgePoints: [],
    knowledgePointSources: [],
    tagGroups: [],
    knowledgePointTags: [],
    noteKnowledgePoints: []
  };
}

function normalizeState(input = {}) {
  return {
    spaces: Array.isArray(input.spaces) ? input.spaces : [],
    folders: Array.isArray(input.folders) ? input.folders : [],
    tags: Array.isArray(input.tags) ? input.tags : [],
    notes: Array.isArray(input.notes) ? input.notes : [],
    attachments: Array.isArray(input.attachments) ? input.attachments : [],
    knowledgePoints: Array.isArray(input.knowledgePoints) ? input.knowledgePoints : [],
    knowledgePointSources: Array.isArray(input.knowledgePointSources) ? input.knowledgePointSources : [],
    tagGroups: Array.isArray(input.tagGroups) ? input.tagGroups : [],
    knowledgePointTags: Array.isArray(input.knowledgePointTags) ? input.knowledgePointTags : [],
    noteKnowledgePoints: Array.isArray(input.noteKnowledgePoints) ? input.noteKnowledgePoints : []
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
    knowledgePoints: normalized.knowledgePoints,
    knowledgePointSources: normalized.knowledgePointSources,
    tagGroups: normalized.tagGroups,
    knowledgePointTags: normalized.knowledgePointTags,
    noteKnowledgePoints: normalized.noteKnowledgePoints
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
    replaceCollection(state.knowledgePoints, normalizedState.knowledgePoints);
    replaceCollection(state.knowledgePointSources, normalizedState.knowledgePointSources);
    replaceCollection(state.tagGroups, normalizedState.tagGroups);
    replaceCollection(state.knowledgePointTags, normalizedState.knowledgePointTags);
    replaceCollection(state.noteKnowledgePoints, normalizedState.noteKnowledgePoints);
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
