import { createAppError } from '../../../errors/app-error.js';

function includesExactId(value, id, seen = new Set()) {
  if (value === id) return true;
  if (!value || typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  return Object.values(value).some(child => includesExactId(child, id, seen));
}

export function inspectKnowledgeItemPurge({ item, evidence = [], learningObjectives = [], questionSources = [], analysisScopes = [] }) {
  if (!item) throw createAppError('KNOWLEDGE_ITEM_NOT_FOUND', '知识点不存在。', 404);
  const evidenceIds = new Set(evidence.map(record => record.id));
  const references = [
    ...learningObjectives.filter(record => record.knowledgeItemId === item.id).map(record => ({ collection: 'learningObjectives', id: record.id, reasonCode: 'TARGET_REBIND_REQUIRED', action: 'rebind-or-delete-target' })),
    ...questionSources.filter(record => (
      (record.sourceType === 'knowledgeItem' && record.sourceId === item.id)
      || (record.sourceType === 'knowledgeEvidence' && evidenceIds.has(record.sourceId))
    )).map(record => ({ collection: 'questionSources', id: record.id, reasonCode: 'QUESTION_SOURCE_REVIEW_REQUIRED', action: 'review-question-source' })),
    ...analysisScopes.filter(record => includesExactId(record, item.id) || evidence.some(source => includesExactId(record, source.id)))
      .map(record => ({ collection: 'analysisScopeSnapshots', id: record.id, reasonCode: 'SCOPE_HISTORY_RETAINED', action: 'review-saved-scope' }))
  ];
  return {
    asset: { type: 'knowledgeItem', id: item.id },
    operation: 'permanent-delete',
    decision: !item.deletedAt ? 'move-to-recycle-bin-first' : references.length ? 'requires-dependency-action' : 'can-purge-no-history',
    expectedUpdatedAt: item.updatedAt,
    exclusiveRecords: { knowledgeEvidenceIds: evidence.map(record => record.id) },
    references,
    coverage: { persistedCurrentAndHistory: true, runningTasks: 'unverified', offlineDevices: 'pending-sync', backups: 'retention-managed' }
  };
}

export function assertKnowledgeItemPurgeAllowed(preflight, expectedUpdatedAt) {
  if (!expectedUpdatedAt || preflight.expectedUpdatedAt !== expectedUpdatedAt) {
    throw createAppError('KNOWLEDGE_ITEM_UPDATE_CONFLICT', '知识点已变化，请重新预览。', 409, { preflight });
  }
  if (preflight.decision !== 'can-purge-no-history') {
    throw createAppError('KNOWLEDGE_ITEM_PURGE_BLOCKED', '请先处理知识点的关联引用。', 409, { preflight });
  }
}
