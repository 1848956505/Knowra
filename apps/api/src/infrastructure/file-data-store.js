import fs from 'node:fs';
import path from 'node:path';
import { createAppError } from '../errors/app-error.js';
import { writeJsonFileAtomically } from './atomic-json-file.js';
import {
  LOCAL_DATA_COLLECTIONS,
  LOCAL_DATA_SCHEMA_VERSION,
  LOCAL_SNAPSHOT_VERSION,
  cloneLocalState,
  createEmptyLocalState,
  createPersistedLocalDocument,
  validateLocalSnapshot,
  validatePersistedLocalState
} from './local-data-schema.js';

function ensureParentDirectory(filePath) {
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true });
}

function replaceCollection(target, source) {
  target.splice(0, target.length, ...source);
}

export function createFileDataStore(filePath, {
  writeJson = writeJsonFileAtomically
} = {}) {
  ensureParentDirectory(filePath);

  if (!fs.existsSync(filePath)) {
    writeJson(filePath, createPersistedLocalDocument(createEmptyLocalState()));
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = parsePersistedState(raw);
  const state = validatePersistedLocalState(parsed);
  let transaction = null;

  function flush() {
    if (transaction) {
      transaction.dirty = true;
      return;
    }
    persistState(state);
  }

  function runTransaction(operation) {
    if (typeof operation !== 'function') {
      throw new TypeError('Storage transaction operation must be a function');
    }

    if (transaction) {
      return operation();
    }

    const previousState = cloneLocalState(state);
    transaction = { dirty: false };

    try {
      const result = operation();
      if (result && typeof result.then === 'function') {
        throw new TypeError('Local storage transactions must be synchronous');
      }
      if (transaction.dirty) {
        persistState(state);
      }
      return result;
    } catch (error) {
      replaceState(state, previousState);
      throw error;
    } finally {
      transaction = null;
    }
  }

  function exportSnapshot() {
    return {
      exportedAt: new Date().toISOString(),
      version: LOCAL_SNAPSHOT_VERSION,
      schemaVersion: LOCAL_DATA_SCHEMA_VERSION,
      data: cloneLocalState(state)
    };
  }

  function prepareImport(snapshot) {
    return validateLocalSnapshot(snapshot);
  }

  function commitImport(preparedSnapshot) {
    const validated = validateLocalSnapshot(preparedSnapshot);
    persistState(validated.data);
    replaceState(state, validated.data);
    return exportSnapshot();
  }

  function importSnapshot(snapshot) {
    return commitImport(prepareImport(snapshot));
  }

  function persistState(nextState) {
    try {
      writeJson(filePath, createPersistedLocalDocument(nextState));
    } catch (error) {
      throw createAppError(
        'STORAGE_WRITE_FAILED',
        'Failed to persist local data safely',
        500,
        { cause: error }
      );
    }
  }

  return {
    state,
    flush,
    runTransaction,
    exportSnapshot,
    prepareImport,
    commitImport,
    importSnapshot
  };
}

function parsePersistedState(raw) {
  if (!raw.trim()) {
    return createEmptyLocalState();
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw createAppError(
      'STORAGE_DATA_INVALID',
      'Local data file contains invalid JSON',
      500,
      { cause: error }
    );
  }
}

function replaceState(target, source) {
  for (const collectionName of LOCAL_DATA_COLLECTIONS) {
    replaceCollection(target[collectionName], source[collectionName]);
  }
}
