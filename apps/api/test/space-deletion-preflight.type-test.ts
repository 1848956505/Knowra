import {
  inspectSpaceDeletion,
  assertSpaceDeletionAllowed,
  type SpaceDeletionInput,
  type SpaceDeletionPreview,
  type SpaceDeletionReference
} from '../src/modules/knowledge/application/space-deletion-preflight.ts';
import type { KnowledgeSpaceRepository } from '../src/modules/knowledge/infrastructure/knowledge-space-repository.ts';
import type { FolderRepository } from '../src/modules/knowledge/infrastructure/folder-repository.ts';
import type { NoteRepository } from '../src/modules/knowledge/infrastructure/note-repository.ts';
import type { TagRepository } from '../src/modules/knowledge/infrastructure/tag-repository.ts';
import type { TagGroupRepository } from '../src/modules/knowledge/infrastructure/tag-group-repository.ts';
import type { ContentAnnotationRepository } from '../src/modules/knowledge/infrastructure/content-annotation-repository.ts';
import type {
  AnalysisScopeRepository,
  AnalysisScopeRecord
} from '../src/modules/knowledge/infrastructure/annotation-support-repositories.ts';
declare const spaces: KnowledgeSpaceRepository;
declare const folders: FolderRepository;
declare const notes: NoteRepository;
declare const tags: TagRepository;
declare const groups: TagGroupRepository;
declare const annotations: ContentAnnotationRepository;
declare const scopes: AnalysisScopeRepository<AnalysisScopeRecord>;
const preview = inspectSpaceDeletion({
  space: spaces.findById('s'),
  folders: folders.list(),
  notes: notes.list(),
  tags: tags.list(),
  tagGroups: groups.list(),
  annotations: annotations.list(),
  analysisScopes: scopes.list()
});
const spaceId: string = preview.asset.id;
const groupIds: string[] = preview.systemGroupIds;
const copiedId: unknown = preview.references[0]?.id;
const copiedTimestamp: unknown = preview.expectedUpdatedAt;
const decision: 'system-shell-protected' | 'requires-content-action' | 'can-delete-empty-container' = preview.decision;
const result: void = assertSpaceDeletionAllowed(preview, copiedTimestamp);
inspectSpaceDeletion({
  space: null,
  folders: undefined,
  notes: undefined,
  tags: undefined,
  tagGroups: undefined,
  annotations: undefined,
  analysisScopes: undefined
});
inspectSpaceDeletion({
  space: { id: 's', defaultFlag: {}, updatedAt: Symbol() },
  notes: [{ id: 'n', deleted: [] }],
  annotations: [{}],
  analysisScopes: [{ id: 42, deletedAt: new Date() }]
});
const readonlyInput: SpaceDeletionInput = { space: { id: 's' }, folders: Object.freeze([{ id: 'f' }]) };
inspectSpaceDeletion(readonlyInput);
void [spaceId, groupIds, copiedId, copiedTimestamp, decision, result];

import {
  inspectSpaceDeletion as bridgeInspect,
  assertSpaceDeletionAllowed as bridgeAssert
} from '../src/modules/knowledge/application/space-deletion-preflight.js';
import { createSpaceAssetLifecycle } from '../src/modules/knowledge/application/space-asset-lifecycle.js';
import { createAsyncSpaceAssetLifecycle } from '../src/modules/knowledge/application/postgres-async/space-asset-lifecycle.js';
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
export type Input = Assert<Equal<Parameters<typeof inspectSpaceDeletion>, [SpaceDeletionInput]>>;
export type Output = Assert<Equal<ReturnType<typeof inspectSpaceDeletion>, SpaceDeletionPreview>>;
export type ReferenceId = Assert<Equal<SpaceDeletionReference['id'], unknown>>;
export type Timestamp = Assert<Equal<SpaceDeletionPreview['expectedUpdatedAt'], unknown>>;
export type AssetId = Assert<Equal<SpaceDeletionPreview['asset']['id'], string>>;
export type GroupIds = Assert<Equal<SpaceDeletionPreview['systemGroupIds'], string[]>>;
export type Assertion = Assert<Equal<ReturnType<typeof assertSpaceDeletionAllowed>, void>>;
export type MinimalPreflight = Assert<
  Equal<Parameters<typeof assertSpaceDeletionAllowed>[0], { expectedUpdatedAt?: unknown; decision?: unknown }>
>;
export type ExpectedTimestamp = Assert<Equal<Parameters<typeof assertSpaceDeletionAllowed>[1], unknown>>;
export type InspectBridge = Assert<Equal<typeof bridgeInspect, typeof inspectSpaceDeletion>>;
export type AssertBridge = Assert<Equal<typeof bridgeAssert, typeof assertSpaceDeletionAllowed>>;
export type ActualSyncReturn = Assert<
  Equal<ReturnType<ReturnType<typeof createSpaceAssetLifecycle>['inspectEmptySpaceDeletion']>, SpaceDeletionPreview>
>;
export type ActualAsyncReturn = Assert<
  Equal<
    ReturnType<ReturnType<typeof createAsyncSpaceAssetLifecycle>['inspectEmptySpaceDeletion']>,
    Promise<SpaceDeletionPreview>
  >
>;
assertSpaceDeletionAllowed({}, undefined);
assertSpaceDeletionAllowed({ expectedUpdatedAt: {}, decision: Symbol() }, 42);
inspectSpaceDeletion({ space: undefined });
inspectSpaceDeletion({
  space: { id: 's' },
  folders: Object.freeze([{ id: 'f' }]),
  notes: Object.freeze([{ id: 'n', deleted: Symbol() }]),
  tags: Object.freeze([{ id: 't' }]),
  tagGroups: Object.freeze([{ id: 'g', isSystem: [] }]),
  annotations: Object.freeze([{}]),
  analysisScopes: Object.freeze([{ deletedAt: false }])
});
preview.references.push({ collection: 'contentAnnotations', id: {} });
preview.systemGroupIds.push('mutable');
preview.asset.id = 'mutable';
preview.coverage.scopedAssets = true;
