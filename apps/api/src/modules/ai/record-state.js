import { randomUUID } from 'node:crypto';
import { AI_RECORD_KINDS, validateAiEvent, validateAiRecord } from './record-contract.js';
import { createAiRecordRepository } from './record-repository.js';
import { validateBudgetState } from './budget-ledger.js';

export const AI_PRIVATE_STATE_VERSION = 1;
const collections = Object.values(AI_RECORD_KINDS).map(value => value.collection);

export function createEmptyAiState({ datasetId = randomUUID(), datasetEpoch = randomUUID() } = {}) {
  return {
    version: AI_PRIVATE_STATE_VERSION,
    datasetId,
    datasetEpoch,
    ...Object.fromEntries(collections.map(name => [name, []])),
    events: [], budgetDays: [], budgetReservations: []
  };
}

export function validateAiState(input) {
  if (input === undefined) return createEmptyAiState();
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || input.version !== AI_PRIVATE_STATE_VERSION
    || typeof input.datasetId !== 'string' || !input.datasetId
    || typeof input.datasetEpoch !== 'string' || !input.datasetEpoch
    || Object.keys(input).some(key => !['version', 'datasetId', 'datasetEpoch', 'events', 'budgetDays', 'budgetReservations', ...collections].includes(key))) {
    throw new Error('AI 私有存储版本或结构无效，已停止加载。');
  }
  const state = structuredClone(input);
  for (const [kind, { collection, id }] of Object.entries(AI_RECORD_KINDS)) {
    if (!Array.isArray(state[collection])) throw new Error(`AI 私有集合 ${collection} 无效。`);
    const ids = new Set();
    for (const record of state[collection]) {
      validateAiRecord(kind, record);
      if (ids.has(record[id])) throw new Error(`AI 私有集合 ${collection} 存在重复 ID。`);
      ids.add(record[id]);
    }
  }
  if (!Array.isArray(state.events)) throw new Error('AI 事件集合无效。');
  state.events.forEach(validateAiEvent);
  return validateBudgetState(state);
}

export function createJsonAiRepository({ getState, runTransaction, onChange }) {
  const adapter = {
    identity() {
      const { datasetId, datasetEpoch } = getState();
      return { datasetId, datasetEpoch };
    },
    get(kind, id) {
      const { collection, id: idField } = AI_RECORD_KINDS[kind];
      return getState()[collection].find(record => record[idField] === id) ?? null;
    },
    list(kind) { return getState()[AI_RECORD_KINDS[kind].collection]; },
    insert(kind, record) { getState()[AI_RECORD_KINDS[kind].collection].push(record); onChange(); },
    replace(kind, record) {
      const { collection, id } = AI_RECORD_KINDS[kind];
      const rows = getState()[collection];
      rows[rows.findIndex(item => item[id] === record[id])] = record;
      onChange();
    },
    listEvents(jobId) { return getState().events.filter(event => event.jobId === jobId); },
    insertEvent(event) { getState().events.push(event); onChange(); },
    transaction: runTransaction,
    rotateEpoch() {
      return runTransaction(() => {
        getState().datasetEpoch = randomUUID();
        onChange();
        return getState().datasetEpoch;
      });
    }
  };
  return createAiRecordRepository(adapter);
}
