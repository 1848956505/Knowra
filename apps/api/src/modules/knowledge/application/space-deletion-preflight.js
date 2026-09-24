import { createAppError } from '../../../errors/app-error.js';

export function inspectSpaceDeletion({ space, folders = [], notes = [], tags = [], tagGroups = [], annotations = [], analysisScopes = [] }) {
  if (!space) throw createAppError('KNOWLEDGE_SPACE_NOT_FOUND', '知识空间不存在。', 404);
  const references = [
    ...folders.map(item => ({ collection: 'folders', id: item.id })),
    ...notes.map(item => ({ collection: 'notes', id: item.id, retention: item.deleted ? 'recycle-bin' : 'current' })),
    ...tags.map(item => ({ collection: 'tags', id: item.id })),
    ...tagGroups.filter(item => !item.isSystem).map(item => ({ collection: 'tagGroups', id: item.id })),
    ...annotations.map(item => ({ collection: 'contentAnnotations', id: item.id })),
    ...analysisScopes.map(item => ({ collection: 'analysisScopeSnapshots', id: item.id, retention: item.deletedAt ? 'recycle-bin' : 'current' }))
  ];
  return {
    asset: { type: 'knowledgeSpace', id: space.id },
    operation: 'delete-empty-container',
    decision: space.defaultFlag ? 'system-shell-protected' : references.length ? 'requires-content-action' : 'can-delete-empty-container',
    expectedUpdatedAt: space.updatedAt,
    references,
    systemGroupIds: tagGroups.filter(item => item.isSystem).map(item => item.id),
    coverage: { scopedAssets: true, globalKnowledgeAndTraining: 'not-owned-by-space', offlineDevices: 'pending-sync', backups: 'retention-managed' }
  };
}

export function assertSpaceDeletionAllowed(preflight, expectedUpdatedAt) {
  if (!expectedUpdatedAt || preflight.expectedUpdatedAt !== expectedUpdatedAt) throw createAppError('KNOWLEDGE_SPACE_UPDATE_CONFLICT', '空间已变化，请重新预检。', 409, { preflight });
  if (preflight.decision !== 'can-delete-empty-container') throw createAppError('KNOWLEDGE_SPACE_DELETE_BLOCKED', '请先处理空间中的资产；默认空间外壳受保护。', 409, { preflight });
}
