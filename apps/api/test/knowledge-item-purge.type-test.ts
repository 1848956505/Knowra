import {
  assertKnowledgeItemPurgeAllowed,
  inspectKnowledgeItemPurge,
  type KnowledgePurgeAssertionInput,
  type KnowledgePurgeExclusiveRecord,
  type KnowledgePurgeInputs,
  type KnowledgePurgeItem,
  type KnowledgePurgeObjectiveReference,
  type KnowledgePurgePreview,
  type KnowledgePurgeQuestionReference,
  type KnowledgePurgeReference,
  type KnowledgePurgeScopeReference
} from '../src/modules/knowledge/application/knowledge-item-purge.ts';
import {
  assertKnowledgeItemPurgeAllowed as bridgeAssert,
  inspectKnowledgeItemPurge as bridgeInspect
} from '../src/modules/knowledge/application/knowledge-item-purge.js';
import type {
  KnowledgeItemRecord,
  KnowledgeItemRepository
} from '../src/modules/knowledge/infrastructure/knowledge-item-repository.ts';
import type {
  KnowledgeEvidenceRecord,
  KnowledgeEvidenceRepository
} from '../src/modules/knowledge/infrastructure/knowledge-evidence-repository.ts';
import type { KnowledgeArtifactProvenanceRepository } from '../src/modules/knowledge/infrastructure/knowledge-artifact-provenance-repository.ts';
import type {
  AssessmentCollectionRepository,
  LearningObjectiveRecord,
  QuestionSourceRecord,
  QuestionSourceRepository
} from '../src/modules/knowledge/infrastructure/assessment-repository.ts';
import type {
  AnalysisScopeRecord,
  AnalysisScopeRepository
} from '../src/modules/knowledge/infrastructure/annotation-support-repositories.ts';

declare const items: KnowledgeItemRepository;
declare const evidence: KnowledgeEvidenceRepository;
declare const provenance: KnowledgeArtifactProvenanceRepository;
declare const objectives: AssessmentCollectionRepository<LearningObjectiveRecord>;
declare const questions: QuestionSourceRepository;
declare const scopes: AnalysisScopeRepository<AnalysisScopeRecord>;
declare const unknownValue: unknown;

// 六个真实仓库的读取结果直接进入预检，不伪造完整领域对象或验证历史字段。
const preview = inspectKnowledgeItemPurge({
  item: items.findById('k'),
  evidence: evidence.list({ knowledgeItemId: 'k' }),
  provenance: provenance.list({ artifactId: 'k' }),
  learningObjectives: objectives.list({ includeArchived: true, includeDeleted: true }),
  questionSources: questions.list(),
  analysisScopes: scopes.list({ includeDeleted: true })
});
const item: KnowledgeItemRecord = { id: 'k', updatedAt: unknownValue, deletedAt: unknownValue };
const evidenceRecord: KnowledgeEvidenceRecord = { id: 'e', knowledgeItemId: 'k' };
const readonlyEvidence: readonly KnowledgePurgeExclusiveRecord[] = Object.freeze([evidenceRecord]);
const readonlyProvenance: readonly KnowledgePurgeExclusiveRecord[] = Object.freeze(provenance.list());
const readonlyObjectives: readonly LearningObjectiveRecord[] = Object.freeze([
  { id: unknownValue, knowledgeItemId: unknownValue }
]);
const readonlyQuestions: readonly QuestionSourceRecord[] = Object.freeze([
  { id: unknownValue, sourceType: unknownValue, sourceId: unknownValue }
]);
const readonlyScopes: readonly AnalysisScopeRecord[] = Object.freeze([{}, { id: unknownValue }]);
inspectKnowledgeItemPurge({
  item,
  evidence: readonlyEvidence,
  provenance: readonlyProvenance,
  learningObjectives: readonlyObjectives,
  questionSources: readonlyQuestions,
  analysisScopes: readonlyScopes
});
inspectKnowledgeItemPurge({ item: null });
inspectKnowledgeItemPurge({ item: undefined });
inspectKnowledgeItemPurge({
  item: { id: 'k', updatedAt: undefined, deletedAt: undefined },
  evidence: undefined,
  provenance: undefined,
  learningObjectives: undefined,
  questionSources: undefined,
  analysisScopes: undefined
});
inspectKnowledgeItemPurge({
  item: { id: 'k', updatedAt: {}, deletedAt: 'false' },
  learningObjectives: [{ id: 42, knowledgeItemId: {} }],
  questionSources: [{ id: null, sourceType: false, sourceId: Symbol() }],
  analysisScopes: [{}, { id: undefined }]
});
const assertionInput: KnowledgePurgeAssertionInput = {
  expectedUpdatedAt: unknownValue,
  decision: unknownValue,
  references: Object.freeze([
    {},
    { reasonCode: unknownValue, message: undefined },
    { reasonCode: 'TASK_REFERENCE_COVERAGE_UNAVAILABLE', message: null },
    { reasonCode: 'TASK_REFERENCE_COVERAGE_UNAVAILABLE', message: '' }
  ])
};
const assertion: void = assertKnowledgeItemPurgeAllowed(preview, unknownValue);
assertKnowledgeItemPurgeAllowed(assertionInput, undefined);
assertKnowledgeItemPurgeAllowed({ references: [] }, null);
assertKnowledgeItemPurgeAllowed({ expectedUpdatedAt: undefined, decision: undefined, references: [] }, false);
const assetId: string = preview.asset.id;
const evidenceIds: string[] = preview.exclusiveRecords.knowledgeEvidenceIds;
const provenanceIds: string[] = preview.exclusiveRecords.knowledgeArtifactProvenanceIds;
const referenceId: unknown = preview.references[0].id;
const timestamp: unknown = preview.expectedUpdatedAt;
// 输入可只读，但新生成的对象、专属 ID 数组和引用数组都保持可变。
preview.asset.id = 'mutable';
preview.asset = { type: 'knowledgeItem', id: 'replacement' };
preview.operation = 'permanent-delete';
preview.decision = 'requires-dependency-action';
preview.expectedUpdatedAt = Symbol();
preview.exclusiveRecords.knowledgeEvidenceIds.push('mutable');
preview.exclusiveRecords.knowledgeArtifactProvenanceIds.push('mutable');
preview.exclusiveRecords = { knowledgeEvidenceIds: [], knowledgeArtifactProvenanceIds: [] };
preview.references.push({
  collection: 'questionSources',
  id: unknownValue,
  reasonCode: 'QUESTION_SOURCE_REVIEW_REQUIRED',
  action: 'review-question-source'
});
preview.references[0].id = {};
preview.references[0].collection = 'analysisScopeSnapshots';
preview.references[0].reasonCode = 'SCOPE_HISTORY_RETAINED';
preview.references[0].action = 'review-saved-scope';
preview.references = [];
preview.coverage.persistedCurrentAndHistory = true;
preview.coverage.runningTasks = 'unverified';
preview.coverage.offlineDevices = 'pending-sync';
preview.coverage.backups = 'retention-managed';
preview.coverage = {
  persistedCurrentAndHistory: true,
  runningTasks: 'unverified',
  offlineDevices: 'pending-sync',
  backups: 'retention-managed'
};
void [assertion, assetId, evidenceIds, provenanceIds, referenceId, timestamp];

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
export type Input = Assert<Equal<Parameters<typeof inspectKnowledgeItemPurge>, [input: KnowledgePurgeInputs]>>;
export type Output = Assert<Equal<ReturnType<typeof inspectKnowledgeItemPurge>, KnowledgePurgePreview>>;
export type AssertionInput = Assert<
  Equal<
    Parameters<typeof assertKnowledgeItemPurgeAllowed>,
    [preflight: KnowledgePurgeAssertionInput, expectedUpdatedAt: unknown]
  >
>;
export type Assertion = Assert<Equal<ReturnType<typeof assertKnowledgeItemPurgeAllowed>, void>>;
export type ItemId = Assert<Equal<KnowledgePurgeItem['id'], string>>;
export type ItemTimestamp = Assert<Equal<KnowledgePurgeItem['updatedAt'], unknown>>;
export type ItemDeletion = Assert<Equal<KnowledgePurgeItem['deletedAt'], unknown>>;
export type ExclusiveId = Assert<Equal<KnowledgePurgeExclusiveRecord['id'], string>>;
export type ObjectiveId = Assert<Equal<KnowledgePurgeObjectiveReference['id'], unknown>>;
export type ObjectiveForeignId = Assert<Equal<KnowledgePurgeObjectiveReference['knowledgeItemId'], unknown>>;
export type QuestionId = Assert<Equal<KnowledgePurgeQuestionReference['id'], unknown>>;
export type QuestionSourceId = Assert<Equal<KnowledgePurgeQuestionReference['sourceId'], unknown>>;
export type QuestionSourceType = Assert<Equal<KnowledgePurgeQuestionReference['sourceType'], unknown>>;
export type ScopeId = Assert<Equal<KnowledgePurgeScopeReference['id'], unknown>>;
export type ReferenceId = Assert<Equal<KnowledgePurgeReference['id'], unknown>>;
export type PreviewTimestamp = Assert<Equal<KnowledgePurgePreview['expectedUpdatedAt'], unknown>>;
export type EvidenceIds = Assert<Equal<KnowledgePurgePreview['exclusiveRecords']['knowledgeEvidenceIds'], string[]>>;
export type ProvenanceIds = Assert<
  Equal<KnowledgePurgePreview['exclusiveRecords']['knowledgeArtifactProvenanceIds'], string[]>
>;
export type References = Assert<Equal<KnowledgePurgePreview['references'], KnowledgePurgeReference[]>>;
export type Decision = Assert<
  Equal<
    KnowledgePurgePreview['decision'],
    'move-to-recycle-bin-first' | 'requires-dependency-action' | 'can-purge-no-history'
  >
>;
export type ReferenceCollection = Assert<
  Equal<KnowledgePurgeReference['collection'], 'learningObjectives' | 'questionSources' | 'analysisScopeSnapshots'>
>;
export type ReferenceReason = Assert<
  Equal<
    KnowledgePurgeReference['reasonCode'],
    'TARGET_REBIND_REQUIRED' | 'QUESTION_SOURCE_REVIEW_REQUIRED' | 'SCOPE_HISTORY_RETAINED'
  >
>;
export type ReferenceAction = Assert<
  Equal<KnowledgePurgeReference['action'], 'rebind-or-delete-target' | 'review-question-source' | 'review-saved-scope'>
>;
export type AssertionTimestamp = Assert<Equal<KnowledgePurgeAssertionInput['expectedUpdatedAt'], unknown>>;
export type AssertionDecision = Assert<Equal<KnowledgePurgeAssertionInput['decision'], unknown>>;
export type AssertionReason = Assert<Equal<KnowledgePurgeAssertionInput['references'][number]['reasonCode'], unknown>>;
export type AssertionMessage = Assert<
  Equal<KnowledgePurgeAssertionInput['references'][number]['message'], string | null | undefined>
>;
export type PreviewKeys = Assert<
  Equal<
    keyof KnowledgePurgePreview,
    'asset' | 'operation' | 'decision' | 'expectedUpdatedAt' | 'exclusiveRecords' | 'references' | 'coverage'
  >
>;
export type ReferenceKeys = Assert<Equal<keyof KnowledgePurgeReference, 'collection' | 'id' | 'reasonCode' | 'action'>>;
export type InspectBridge = Assert<Equal<typeof inspectKnowledgeItemPurge, typeof bridgeInspect>>;
export type AssertBridge = Assert<Equal<typeof assertKnowledgeItemPurgeAllowed, typeof bridgeAssert>>;
