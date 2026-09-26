import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createAppError } from '../errors/app-error.js';
import { writeJsonFileAtomically } from './atomic-json-file.js';
import { appendChanges, createJournal, loadJournal, syncKey } from '../modules/sync/journal.js';
import { createJsonAiRepository, validateAiState } from '../modules/ai/record-state.js';
import { createJsonBudgetAuthority } from '../modules/ai/budget-ledger.js';
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
    assertNoInterruptedReplacement(filePath);
    writeJson(filePath, createPersistedLocalDocument(createEmptyLocalState()));
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = parsePersistedState(raw);
  const state = validatePersistedLocalState(parsed);
  let aiRuntime = validateAiState(parsed.aiRuntime);
  let committed = cloneLocalState(state);
  let journal = loadJournal(parsed.sync, state);
  let transaction = null;
  if (['knowledgeItems', 'knowledgeEvidence'].some(collection => JSON.stringify(parsed[collection] ?? []) !== JSON.stringify(state[collection]))) {
    const previous = Object.fromEntries(LOCAL_DATA_COLLECTIONS.map(collection => [collection, structuredClone(parsed[collection] ?? [])]));
    journal = appendChanges(journal, previous, state);
    writeJson(filePath, { ...createPersistedLocalDocument(state), sync: journal, aiRuntime });
  }

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
    const previousAiRuntime = structuredClone(aiRuntime);
    const previousJournal = structuredClone(journal);
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
      aiRuntime = previousAiRuntime;
      journal = previousJournal;
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
    for (const collection of LOCAL_DATA_COLLECTIONS) {
      for (const item of validated.data[collection]) {
        if (journal.tombstones?.[syncKey(collection, item.id)]) {
          throw createAppError('IMPORT_DELETED_ID', '旧备份包含已经永久删除的对象，请使用新的资产 ID 导入。', 409, { collection, id: item.id });
        }
      }
    }
    const previousJournal = journal;
    journal = createJournal(validated.data);
    journal.tombstones = structuredClone(previousJournal.tombstones ?? {});
    for (const [key, tombstone] of Object.entries(journal.tombstones)) {
      journal.revisions[key] = tombstone.revision;
    }
    const previousAiRuntime = aiRuntime;
    aiRuntime = { ...aiRuntime, datasetEpoch: randomUUID() };
    try { persistState(validated.data); } catch (error) { journal = previousJournal; aiRuntime = previousAiRuntime; throw error; }
    replaceState(state, validated.data);
    return exportSnapshot();
  }

  function importSnapshot(snapshot) {
    return commitImport(prepareImport(snapshot));
  }

  function persistState(nextState) {
    try {
      const nextJournal = appendChanges(structuredClone(journal), committed, nextState);
      writeJson(filePath, { ...createPersistedLocalDocument(nextState), sync: nextJournal, aiRuntime: validateAiState(aiRuntime) });
      journal = nextJournal;
      committed = cloneLocalState(nextState);
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
    aiRepository: createJsonAiRepository({ getState: () => aiRuntime, runTransaction, onChange: flush }),
    aiBudgetAuthority: createJsonBudgetAuthority({ getState: () => aiRuntime, runTransaction, onChange: flush }),
    getSyncJournal: () => journal,
    previewSyncJournal: () => appendChanges(structuredClone(journal), committed, state),
    runSyncTransaction: operation => runTransaction(() => { const result = operation(); flush(); return result; }),
    state,
    flush,
    runTransaction,
    exportSnapshot,
    prepareImport,
    commitImport,
    importSnapshot
  };
}

function assertNoInterruptedReplacement(filePath) {
  const prefix = `.${path.basename(filePath)}.`;
  const recoveryFiles = fs.readdirSync(path.dirname(filePath)).filter((name) => (
    name.startsWith(prefix) && /\.(bak|tmp)$/.test(name)
  ));
  if (recoveryFiles.length > 0) {
    throw createAppError(
      'STORAGE_RECOVERY_REQUIRED',
      `检测到未完成的数据文件替换，已停止创建空库。请保留整个数据目录，核验并恢复 ${path.basename(filePath)} 后重试。恢复候选：${recoveryFiles.sort().join('、')}`,
      500
    );
  }
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
