import { createJsonActionStore } from '../modules/ai/action-state.js';
import { knowledgeExtractionCommitKey, validateKnowledgeExtractionCommit, validateKnowledgeExtractionCommitState } from '../modules/ai/knowledge-extraction-commit-contract.js';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createAppError } from '../errors/app-error.js';
import { writeJsonFileAtomically } from './atomic-json-file.js';
import { coreOperationKey, validateCoreOperationState } from './core-operation-contract.js';
import { createSyncCoreOperationStore } from './core-operation-store.js';
import { appendChanges, createJournal, loadJournal, syncKey } from '../modules/sync/journal.js';
import { createJsonAiAccessStore, createJsonAiConversationStore, createJsonAiRepository, validateAiState } from '../modules/ai/record-state.js';
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
  let coreOperations = parsed.coreOperations;
  let coreOperationStoreError = null;
  try { coreOperations = validateCoreOperationState(coreOperations); }
  catch (error) { coreOperationStoreError = error; }
  let knowledgeExtractionCommits = parsed.knowledgeExtractionCommits;
  let knowledgeExtractionCommitStoreError = null;
  try { knowledgeExtractionCommits = validateKnowledgeExtractionCommitState(knowledgeExtractionCommits); }
  catch (error) { knowledgeExtractionCommitStoreError = error; }
  let aiRuntime;
  let aiRuntimeError = null;
  try { aiRuntime = validateAiState(parsed.aiRuntime); }
  catch (error) {
    // 保留损坏的 AI 原文，核心事务继续原子写入；不能把坏记录当成空白 AI 数据覆盖。
    aiRuntime = parsed.aiRuntime;
    aiRuntimeError = error;
  }
  let committed = cloneLocalState(state);
  let journal = loadJournal(parsed.sync, state);
  let transaction = null;
  if (['knowledgeItems', 'knowledgeEvidence'].some(collection => JSON.stringify(parsed[collection] ?? []) !== JSON.stringify(state[collection]))) {
    const previous = Object.fromEntries(LOCAL_DATA_COLLECTIONS.map(collection => [collection, structuredClone(parsed[collection] ?? [])]));
    journal = appendChanges(journal, previous, state);
    writeJson(filePath, { ...createPersistedLocalDocument(state), sync: journal, aiRuntime, coreOperations, knowledgeExtractionCommits });
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
    const previousCoreOperations = structuredClone(coreOperations);
    const previousExtractionCommits = structuredClone(knowledgeExtractionCommits);
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
      coreOperations = previousCoreOperations;
      knowledgeExtractionCommits = previousExtractionCommits;
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
      writeJson(filePath, { ...createPersistedLocalDocument(nextState), sync: nextJournal,
        aiRuntime: aiRuntimeError ? aiRuntime : validateAiState(aiRuntime),
        coreOperations: coreOperationStoreError ? coreOperations : validateCoreOperationState(coreOperations),
        knowledgeExtractionCommits: knowledgeExtractionCommitStoreError ? knowledgeExtractionCommits
          : validateKnowledgeExtractionCommitState(knowledgeExtractionCommits) });
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
    knowledgeExtractionCommitStore: knowledgeExtractionCommitStoreError ? null : {
      supportsAsync: false,
      runTransaction(operation) {
        if (transaction) throw new TypeError('提炼接纳必须拥有最外层事务，不能嵌套提交。');
        return runTransaction(operation);
      },
      get: input => structuredClone(knowledgeExtractionCommits.receipts.find(receipt => knowledgeExtractionCommitKey(receipt) === knowledgeExtractionCommitKey(input)) ?? null),
      insert: receipt => { knowledgeExtractionCommits.receipts.push(validateKnowledgeExtractionCommit(receipt)); flush(); }
    },
    knowledgeExtractionCommitStoreError,
    coreOperationStore: coreOperationStoreError ? null : createSyncCoreOperationStore({
      transaction: operation => {
        if (transaction) throw new TypeError('核心操作必须拥有最外层事务，不能嵌套提交。');
        return runTransaction(operation);
      },
      get: input => coreOperations.receipts.find(receipt => coreOperationKey(receipt) === coreOperationKey(input)) ?? null,
      insert: receipt => { coreOperations.receipts.push(receipt); flush(); }
    }),
    coreOperationStoreError,
    aiRepository: aiRuntimeError ? null : createJsonAiRepository({ getState: () => aiRuntime, runTransaction, onChange: flush }),
    aiAccessStore: aiRuntimeError ? null : createJsonAiAccessStore({ getState: () => aiRuntime, runTransaction, onChange: flush }),
    aiActionStore: aiRuntimeError ? null : createJsonActionStore({ getState: () => aiRuntime, runTransaction, onChange: flush }),
    aiConversationStore: aiRuntimeError ? null : createJsonAiConversationStore({ getState: () => aiRuntime, runTransaction, onChange: flush }),
    aiBudgetAuthority: aiRuntimeError ? null : createJsonBudgetAuthority({ getState: () => aiRuntime, runTransaction, onChange: flush }),
    aiRuntimeError,
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
