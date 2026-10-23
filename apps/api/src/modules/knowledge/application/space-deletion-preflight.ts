import { createAppError } from '../../../errors/app-error.ts';

export interface IdentifiedRecord {
  id: string;
}
export interface UnvalidatedRecord {
  id?: unknown;
}
export interface SpaceDeletionInput {
  space: (IdentifiedRecord & { defaultFlag?: unknown; updatedAt?: unknown }) | null | undefined;
  folders?: readonly IdentifiedRecord[] | undefined;
  notes?: readonly (IdentifiedRecord & { deleted?: unknown })[] | undefined;
  tags?: readonly IdentifiedRecord[] | undefined;
  tagGroups?: readonly (IdentifiedRecord & { isSystem?: unknown })[] | undefined;
  annotations?: readonly UnvalidatedRecord[] | undefined;
  analysisScopes?: readonly (UnvalidatedRecord & { deletedAt?: unknown })[] | undefined;
}
export interface SpaceDeletionPreview {
  asset: { type: 'knowledgeSpace'; id: string };
  operation: 'delete-empty-container';
  decision: 'system-shell-protected' | 'requires-content-action' | 'can-delete-empty-container';
  expectedUpdatedAt: unknown;
  references: SpaceDeletionReference[];
  systemGroupIds: string[];
  coverage: {
    scopedAssets: true;
    globalKnowledgeAndTraining: 'not-owned-by-space';
    offlineDevices: 'pending-sync';
    backups: 'retention-managed';
  };
}
export interface SpaceDeletionReference {
  collection: 'folders' | 'notes' | 'tags' | 'tagGroups' | 'contentAnnotations' | 'analysisScopeSnapshots';
  id: unknown;
  retention?: 'recycle-bin' | 'current' | undefined;
}

export function inspectSpaceDeletion({
  space,
  folders = [],
  notes = [],
  tags = [],
  tagGroups = [],
  annotations = [],
  analysisScopes = []
}: SpaceDeletionInput): SpaceDeletionPreview {
  if (!space) throw createAppError('KNOWLEDGE_SPACE_NOT_FOUND', '知识空间不存在。', 404);
  const references: SpaceDeletionReference[] = [
    ...folders.map((item): SpaceDeletionReference => ({ collection: 'folders', id: item.id })),
    ...notes.map((item): SpaceDeletionReference => ({
      collection: 'notes',
      id: item.id,
      retention: item.deleted ? 'recycle-bin' : 'current'
    })),
    ...tags.map((item): SpaceDeletionReference => ({ collection: 'tags', id: item.id })),
    ...tagGroups
      .filter(item => !item.isSystem)
      .map((item): SpaceDeletionReference => ({ collection: 'tagGroups', id: item.id })),
    ...annotations.map((item): SpaceDeletionReference => ({ collection: 'contentAnnotations', id: item.id })),
    ...analysisScopes.map((item): SpaceDeletionReference => ({
      collection: 'analysisScopeSnapshots',
      id: item.id,
      retention: item.deletedAt ? 'recycle-bin' : 'current'
    }))
  ];
  return {
    asset: { type: 'knowledgeSpace', id: space.id },
    operation: 'delete-empty-container',
    decision: space.defaultFlag
      ? 'system-shell-protected'
      : references.length
        ? 'requires-content-action'
        : 'can-delete-empty-container',
    expectedUpdatedAt: space.updatedAt,
    references,
    systemGroupIds: tagGroups.filter(item => item.isSystem).map(item => item.id),
    coverage: {
      scopedAssets: true,
      globalKnowledgeAndTraining: 'not-owned-by-space',
      offlineDevices: 'pending-sync',
      backups: 'retention-managed'
    }
  };
}

export function assertSpaceDeletionAllowed(
  preflight: { expectedUpdatedAt?: unknown; decision?: unknown },
  expectedUpdatedAt: unknown
): void {
  if (!expectedUpdatedAt || preflight.expectedUpdatedAt !== expectedUpdatedAt)
    throw createAppError('KNOWLEDGE_SPACE_UPDATE_CONFLICT', '空间已变化，请重新预检。', 409, { preflight });
  if (preflight.decision !== 'can-delete-empty-container')
    throw createAppError('KNOWLEDGE_SPACE_DELETE_BLOCKED', '请先处理空间中的资产；默认空间外壳受保护。', 409, {
      preflight
    });
}
