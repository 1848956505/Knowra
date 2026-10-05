import { createHash } from 'node:crypto';
import { createAppError } from '../errors/app-error.js';

const identityKeys = ['ownerId', 'datasetId', 'datasetEpoch', 'actorId', 'spaceId', 'requestId', 'operationId'];
const kinds = ['notes_create', 'notes_append', 'notes_propose_patch', 'notes_propose_organize', 'notes_undo', 'knowledge_propose'];
const id = value => typeof value === 'string' && value.length > 0 && value.length <= 200
  && value.trim() === value && !/[\u0000-\u001f]/.test(value);
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value, keys) => record(value) && Object.keys(value).length === keys.length
  && keys.every(key => Object.hasOwn(value, key));
const invalid = () => { throw createAppError('CORE_OPERATION_INVALID', '核心操作回执结构无效，已停止该操作。', 422); };

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (record(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export const hashCoreOperation = value => createHash('sha256').update(canonical(value)).digest('hex');
export const coreOperationKey = value => JSON.stringify([value.ownerId, value.datasetId, value.operationId]);

export function validateCoreOperationInput(input) {
  if (!exact(input, [...identityKeys, 'kind', 'planHash']) || identityKeys.some(key => !id(input[key]))
    || !kinds.includes(input.kind) || !hash(input.planHash)) invalid();
  return structuredClone(input);
}

export function validateCoreOperationLookup(input) {
  if (!exact(input, ['ownerId', 'datasetId', 'operationId']) || Object.values(input).some(value => !id(value))) invalid();
  return structuredClone(input);
}

function validateChange(change) {
  const keys = ['noteId', 'beforeVersionId', 'afterVersionId', 'contentHash', 'metadataBefore'];
  if (!exact(change, keys) || !id(change.noteId) || !id(change.afterVersionId) || !hash(change.contentHash)
    || change.beforeVersionId !== null && !id(change.beforeVersionId)) invalid();
  const metadata = change.metadataBefore;
  if (metadata !== null && (!exact(metadata, ['title', 'folderId', 'tagIds'])
    || typeof metadata.title !== 'string' || !metadata.title.trim() || metadata.title.length > 200
    || metadata.folderId !== null && !id(metadata.folderId)
    || !Array.isArray(metadata.tagIds) || metadata.tagIds.length > 20 || metadata.tagIds.some(tag => !id(tag))
    || new Set(metadata.tagIds).size !== metadata.tagIds.length)) invalid();
}

// 知识候选提议：回执只记录保存的候选与来源摘要 ID，内容仍由知识核心仓库保存。
function validateKnowledgeProposalResult(result) {
  if (!exact(result, ['candidates', 'saveState']) || result.saveState !== 'localCommitted'
    || !Array.isArray(result.candidates) || result.candidates.length < 1 || result.candidates.length > 20) invalid();
  for (const candidate of result.candidates) {
    if (!exact(candidate, ['candidateId', 'provenanceId']) || !id(candidate.candidateId) || !id(candidate.provenanceId)) invalid();
  }
  if (new Set(result.candidates.map(candidate => candidate.candidateId)).size !== result.candidates.length) invalid();
  return structuredClone(result);
}

export function validateCoreOperationResult(result, kind = 'notes_create') {
  if (kind === 'knowledge_propose') return validateKnowledgeProposalResult(result);
  if (!exact(result, ['changes', 'saveState']) || result.saveState !== 'localCommitted'
    || !Array.isArray(result.changes) || result.changes.length < 1 || result.changes.length > 20) invalid();
  result.changes.forEach(validateChange);
  if (new Set(result.changes.map(change => change.noteId)).size !== result.changes.length) invalid();
  return structuredClone(result);
}

export function createCoreOperationReceipt(input, result, now = new Date()) {
  const request = validateCoreOperationInput(input);
  const receipt = { schemaVersion: 1, ...request, status: 'applied',
    appliedAt: now.toISOString(), result: validateCoreOperationResult(result, request.kind) };
  return { ...receipt, receiptHash: hashCoreOperation(receipt) };
}

export function validateCoreOperationReceipt(value) {
  if (!exact(value, ['schemaVersion', ...identityKeys, 'kind', 'planHash', 'status', 'appliedAt', 'result', 'receiptHash'])
    || value.schemaVersion !== 1 || value.status !== 'applied' || !hash(value.receiptHash)
    || typeof value.appliedAt !== 'string' || !Number.isFinite(Date.parse(value.appliedAt))) invalid();
  validateCoreOperationInput(Object.fromEntries([...identityKeys, 'kind', 'planHash'].map(key => [key, value[key]])));
  validateCoreOperationResult(value.result, value.kind);
  const { receiptHash, ...content } = value;
  if (hashCoreOperation(content) !== receiptHash) invalid();
  return structuredClone(value);
}

export function reuseCoreOperationReceipt(existing, input) {
  if (!existing) return null;
  const receipt = validateCoreOperationReceipt(existing);
  if ([...identityKeys, 'kind', 'planHash'].some(key => receipt[key] !== input[key])) {
    throw createAppError('CORE_OPERATION_CONFLICT', '同一操作 ID 已绑定另一份计划或请求身份。', 409);
  }
  return receipt;
}

export function validateCoreOperationState(value = { version: 1, receipts: [] }) {
  if (!exact(value, ['version', 'receipts']) || value.version !== 1 || !Array.isArray(value.receipts)) invalid();
  const receipts = value.receipts.map(validateCoreOperationReceipt);
  if (new Set(receipts.map(coreOperationKey)).size !== receipts.length) invalid();
  return { version: 1, receipts };
}
