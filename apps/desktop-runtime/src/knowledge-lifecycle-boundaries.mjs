import { readMeta, writeMeta } from './sync-state.mjs';

const QUEUE = 'knowledgeLifecycleQueue';
const UPLOAD = 'knowledgeLifecycleUpload';
const key = entry => JSON.stringify([entry.operationId, entry.entityId]);
const invalid = () => Object.assign(new Error('知识生命周期待同步记录不完整，已停止同步；请保留本地资料并导出备份。'), { code: 'LOCAL_KNOWLEDGE_LIFECYCLE_INVALID' });
const actionFor = (before, value) => before && value
  ? !before.deletedAt && value.deletedAt ? 'trash' : before.deletedAt && !value.deletedAt ? 'restore' : null
  : null;
const isDescriptor = entry => entry && Object.keys(entry).sort().join(',') === 'entityId,operationId,sequence'
  && Number.isSafeInteger(entry.sequence) && entry.sequence > 0
  && typeof entry.operationId === 'string' && entry.operationId.length > 0
  && typeof entry.entityId === 'string' && entry.entityId.length > 0;

/** 私有描述符只引用本地用户事务，不重放来源不明的历史 outbox 或远端落库。 */
export function readKnowledgeLifecycleBoundaries(db) {
  let queue;
  try { queue = readMeta(db, QUEUE) ?? []; } catch { throw invalid(); }
  if (!Array.isArray(queue)) throw invalid();
  const seen = new Set();
  const boundaries = queue.map(entry => {
    if (!isDescriptor(entry) || seen.has(key(entry))) throw invalid();
    seen.add(key(entry));
    const row = db.prepare('SELECT operation_id, state, changes FROM sync_outbox WHERE sequence = ?').get(entry.sequence);
    if (!row || row.operation_id !== entry.operationId || row.state === 'acknowledged') throw invalid();
    let changes;
    try { changes = JSON.parse(row.changes); } catch { throw invalid(); }
    if (!Array.isArray(changes)) throw invalid();
    const change = changes.find(item => item.collection === 'knowledgeItems' && item.entityId === entry.entityId);
    const action = actionFor(change?.before, change?.value);
    if (!action) throw invalid();
    return { ...entry, action, value: change.value, changes };
  }).sort((a, b) => a.sequence - b.sequence);
  readKnowledgeLifecycleBinding(db, boundaries);
  return boundaries;
}

function readKnowledgeLifecycleBinding(db, boundaries) {
  let binding, frozen;
  try { binding = readMeta(db, UPLOAD); frozen = readMeta(db, 'entityUpload'); } catch { throw invalid(); }
  if (!binding) return null;
  if (Object.keys(binding).sort().join(',') !== 'boundaries,operationId' || typeof binding.operationId !== 'string' || !binding.operationId
    || (frozen && frozen.operationId !== binding.operationId) || !Array.isArray(binding.boundaries) || !binding.boundaries.length) throw invalid();
  const ids = new Set();
  for (const entry of binding.boundaries) {
    if (!isDescriptor(entry) || ids.has(key(entry)) || !boundaries.some(row => key(row) === key(entry) && row.sequence === entry.sequence)) throw invalid();
    ids.add(key(entry));
  }
  return binding;
}

const descriptors = entries => entries.map(({ operationId, sequence, entityId }) => ({ operationId, sequence, entityId }));
export function recordKnowledgeLifecycleBoundaries(db, changes, operationId, origin) {
  if (origin !== 'local-business') return;
  const lifecycle = changes.filter(change => change.collection === 'knowledgeItems' && actionFor(change.before, change.value));
  if (!lifecycle.length) return;
  const row = db.prepare('SELECT sequence FROM sync_outbox WHERE operation_id = ?').get(operationId);
  if (!row) throw invalid();
  const queue = readKnowledgeLifecycleBoundaries(db);
  writeMeta(db, QUEUE, [...descriptors(queue), ...lifecycle.map(change => ({ operationId, sequence: row.sequence, entityId: change.entityId }))]);
}

export function firstKnowledgeLifecycleBoundaries(boundaries) {
  const first = new Map();
  for (const boundary of boundaries) if (!first.has(boundary.entityId)) first.set(boundary.entityId, boundary);
  return first;
}

export function consumeKnowledgeLifecycleBoundaries(db, consumed) {
  const ids = new Set(consumed.map(key));
  writeMeta(db, QUEUE, descriptors(readKnowledgeLifecycleBoundaries(db).filter(entry => !ids.has(key(entry)))));
}

export function bindKnowledgeLifecycleUpload(db, operationId, boundaries) {
  writeMeta(db, UPLOAD, boundaries.length ? { operationId, boundaries: descriptors(boundaries) } : null);
}

export function acknowledgeKnowledgeLifecycleUpload(db, operationId, accepted) {
  const pending = readKnowledgeLifecycleBoundaries(db);
  const binding = readKnowledgeLifecycleBinding(db, pending);
  if (binding) {
    if (binding.operationId !== operationId) throw invalid();
    // 同事务解除冻结绑定后消费，避免已消费描述符成为悬空绑定。
    writeMeta(db, UPLOAD, null);
    if (accepted) consumeKnowledgeLifecycleBoundaries(db, binding.boundaries);
  }
  writeMeta(db, UPLOAD, null);
}

export function clearKnowledgeLifecycleUpload(db) { writeMeta(db, UPLOAD, null); }

export function discardKnowledgeLifecycleBoundaries(db, entityIds) {
  consumeKnowledgeLifecycleBoundaries(db, readKnowledgeLifecycleBoundaries(db).filter(entry => entityIds.has(entry.entityId)));
  clearKnowledgeLifecycleUpload(db);
}

/** 发送期间保留本地删除造成的降级；只读训练资产仍由云端接收生命周期后重算。 */
export function preserveKnowledgeLifecycleInvalidations(merged, local, boundaries) {
  for (const collection of ['learningObjectives', 'questions']) {
    const affected = new Set(boundaries.flatMap(boundary => boundary.changes.filter(change => change.collection === collection).map(change => change.entityId)));
    for (const record of merged[collection]) {
      const current = affected.has(record.id) && local[collection].find(item => item.id === record.id);
      if (record.reviewStatus === 'confirmed' && current?.reviewStatus === 'candidate') {
        record.reviewStatus = current.reviewStatus;
        record.updatedAt = current.updatedAt;
        if (collection === 'learningObjectives') record.reviewNote = current.reviewNote;
      }
    }
  }
}
