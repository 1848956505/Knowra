import {
  assertKnowledgeItemBaseline,
  nextKnowledgeItemTimestamp,
  type KnowledgeItemTimestampView,
  type KnowledgeItemBaselineInput
} from '../src/modules/knowledge/application/knowledge-item-concurrency.js';
import {
  assertLearningObjectiveBaseline,
  nextLearningObjectiveTimestamp,
  withLearningObjectiveReviewErrors,
  type LearningObjectiveTimestampView,
  type LearningObjectiveReviewBaseline,
  type LearningObjectiveReviewInput,
  type LearningObjectiveReviewOptions
} from '../src/modules/knowledge/application/learning-objective-concurrency.js';
import {
  matchesKnowledgeCandidateRequest,
  type KnowledgeCandidateRequestView,
  type KnowledgeCandidateItemView,
  type KnowledgeCandidateEvidenceView
} from '../src/modules/knowledge/application/knowledge-candidate-retry.js';
import type { KnowledgeItem } from '../src/modules/knowledge/domain/knowledge-item.js';
import type { KnowledgeEvidence } from '../src/modules/knowledge/domain/knowledge-evidence.js';
import type { LearningObjective } from '../src/modules/knowledge/domain/learning-objective.js';
import type { KnowledgeItemRecord } from '../src/modules/knowledge/infrastructure/knowledge-item-repository.js';
import type { KnowledgeEvidenceRecord } from '../src/modules/knowledge/infrastructure/knowledge-evidence-repository.js';

type Assert<T extends true> = T;
type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;

// 只由 strict 门编译：历史字段与外部参数仍未验证，不假装是完整领域对象。
export type ConcurrencyBoundaryContracts = [
  Assert<Equal<KnowledgeItemTimestampView['updatedAt'], unknown>>,
  Assert<Equal<KnowledgeItemBaselineInput['expectedUpdatedAt'], unknown>>,
  Assert<Equal<LearningObjectiveTimestampView['updatedAt'], unknown>>,
  Assert<Equal<LearningObjectiveReviewBaseline['objectiveUpdatedAt'], unknown>>,
  Assert<Equal<LearningObjectiveReviewBaseline['knowledgeUpdatedAt'], unknown>>,
  Assert<Equal<LearningObjectiveReviewInput['reviewBaseline'], unknown>>,
  Assert<Equal<LearningObjectiveReviewOptions['hasObjective'], boolean | undefined>>,
  Assert<Equal<Parameters<typeof assertKnowledgeItemBaseline>[1], unknown>>,
  Assert<Equal<Parameters<typeof assertLearningObjectiveBaseline>[2], unknown>>,
  Assert<Equal<Parameters<typeof withLearningObjectiveReviewErrors>[0], unknown>>,
  Assert<Equal<ReturnType<typeof assertKnowledgeItemBaseline>, void>>,
  Assert<Equal<ReturnType<typeof assertLearningObjectiveBaseline>, void>>,
  Assert<Equal<ReturnType<typeof nextKnowledgeItemTimestamp>, string>>,
  Assert<Equal<ReturnType<typeof nextLearningObjectiveTimestamp>, string>>,
  Assert<KnowledgeItemRecord extends KnowledgeItemTimestampView ? true : false>,
  Assert<KnowledgeItemRecord extends LearningObjectiveTimestampView ? true : false>,
  Assert<LearningObjective extends LearningObjectiveTimestampView ? true : false>,
  Assert<null | undefined extends Parameters<typeof nextKnowledgeItemTimestamp>[0] ? true : false>,
  Assert<null | undefined extends Parameters<typeof nextLearningObjectiveTimestamp>[0] ? true : false>,
  Assert<null | undefined extends Parameters<typeof assertLearningObjectiveBaseline>[0] ? true : false>,
  Assert<KnowledgeItemTimestampView extends KnowledgeItem ? false : true>,
  Assert<LearningObjectiveTimestampView extends LearningObjective ? false : true>,
  Assert<LearningObjectiveReviewBaseline extends { knowledgeUpdatedAt: string } ? false : true>
];

declare const unknownInput: unknown;
declare const timestamp: KnowledgeItemTimestampView;
assertKnowledgeItemBaseline(timestamp, unknownInput);
assertLearningObjectiveBaseline(null, timestamp, unknownInput);
const _unvalidatedInput = unknownInput;
const _unvalidatedTimestamp = timestamp.updatedAt;

declare const thenable: PromiseLike<PromiseLike<{ readonly id: 'result' }>>;
declare const unknownResult: unknown;
declare const impossibleResult: never;
declare const mixedResult: 'sync' | PromiseLike<number>;
const _literal = withLearningObjectiveReviewErrors(unknownInput, () => 'ready' as const);
const _asynchronous = withLearningObjectiveReviewErrors({}, async () => 42);
const _nested = withLearningObjectiveReviewErrors({}, () => thenable);
const _unknown = withLearningObjectiveReviewErrors({}, () => unknownResult);
const _impossible = withLearningObjectiveReviewErrors({}, () => impossibleResult);
const _mixed = withLearningObjectiveReviewErrors({}, () => mixedResult);
const _nullable = withLearningObjectiveReviewErrors({}, () => null, { hasObjective: false });
const _undefined = withLearningObjectiveReviewErrors({}, () => undefined);
const _void = withLearningObjectiveReviewErrors({}, () => {});

export type ReviewOperationContracts = [
  Assert<Equal<typeof _unvalidatedInput, unknown>>,
  Assert<Equal<typeof _unvalidatedTimestamp, unknown>>,
  Assert<Equal<typeof _literal, Promise<'ready'>>>,
  Assert<Equal<typeof _asynchronous, Promise<number>>>,
  Assert<Equal<typeof _nested, Promise<{ readonly id: 'result' }>>>,
  Assert<Equal<typeof _unknown, Promise<unknown>>>,
  Assert<Equal<typeof _impossible, Promise<never>>>,
  Assert<Equal<typeof _mixed, Promise<'sync' | number>>>,
  Assert<Equal<typeof _nullable, Promise<null>>>,
  Assert<Equal<typeof _undefined, Promise<undefined>>>,
  Assert<Equal<typeof _void, Promise<void>>>,
  Assert<
    Equal<Parameters<typeof withLearningObjectiveReviewErrors<PromiseLike<number>>>[1], () => PromiseLike<number>>
  >,
  Assert<Equal<ReturnType<typeof withLearningObjectiveReviewErrors<PromiseLike<PromiseLike<number>>>>, Promise<number>>>
];

// 证据列表只读，字段仅描述原比较/转换边界；匹配不构成完整 DTO 校验。
declare const candidate: KnowledgeCandidateItemView;
declare const request: KnowledgeCandidateRequestView;
declare const evidence: readonly KnowledgeCandidateEvidenceView[];
declare const inputs: readonly [{ readonly headingPath: readonly ['heading']; readonly id: 42 }];
const _matches = matchesKnowledgeCandidateRequest(candidate, request, evidence, inputs);
if (matchesKnowledgeCandidateRequest(candidate, request, evidence, inputs)) {
  const _unvalidatedTitle = candidate.title;
  const _unvalidatedSource = request.sourceMode;
  const _unvalidatedEvidenceId = evidence[0].id;
  const _unvalidatedHeadingPath = evidence[0].headingPath;
  const _notValidated: [
    Assert<Equal<typeof _unvalidatedTitle, unknown>>,
    Assert<Equal<typeof _unvalidatedSource, unknown>>,
    Assert<Equal<typeof _unvalidatedEvidenceId, unknown>>,
    Assert<Equal<typeof _unvalidatedHeadingPath, unknown>>
  ] = [true, true, true, true];
}

export type CandidateRetryContracts = [
  Assert<Equal<typeof _matches, boolean>>,
  Assert<Equal<KnowledgeCandidateRequestView['title'], unknown>>,
  Assert<Equal<KnowledgeCandidateRequestView['canonicalStatement'], unknown>>,
  Assert<Equal<KnowledgeCandidateRequestView['userExplanation'], unknown>>,
  Assert<Equal<KnowledgeCandidateRequestView['knowledgeType'], unknown>>,
  Assert<Equal<KnowledgeCandidateRequestView['importance'], unknown>>,
  Assert<Equal<KnowledgeCandidateRequestView['sourceMode'], unknown>>,
  Assert<Equal<KnowledgeCandidateItemView['deletedAt'], unknown>>,
  Assert<Equal<KnowledgeCandidateItemView['reviewStatus'], unknown>>,
  Assert<Equal<KnowledgeCandidateEvidenceView['sourceType'], unknown>>,
  Assert<Equal<KnowledgeCandidateEvidenceView['id'], unknown>>,
  Assert<Equal<KnowledgeCandidateEvidenceView['sourceId'], unknown>>,
  Assert<Equal<KnowledgeCandidateEvidenceView['noteId'], unknown>>,
  Assert<Equal<KnowledgeCandidateEvidenceView['noteVersionId'], unknown>>,
  Assert<Equal<KnowledgeCandidateEvidenceView['annotationId'], unknown>>,
  Assert<Equal<KnowledgeCandidateEvidenceView['quoteText'], unknown>>,
  Assert<Equal<KnowledgeCandidateEvidenceView['headingPath'], unknown>>,
  Assert<Equal<Parameters<typeof matchesKnowledgeCandidateRequest>[2], readonly KnowledgeCandidateEvidenceView[]>>,
  Assert<Equal<Parameters<typeof matchesKnowledgeCandidateRequest>[3], readonly KnowledgeCandidateEvidenceView[]>>,
  Assert<KnowledgeItem extends KnowledgeCandidateItemView ? true : false>,
  Assert<KnowledgeItemRecord extends KnowledgeCandidateItemView ? true : false>,
  Assert<KnowledgeEvidence extends KnowledgeCandidateEvidenceView ? true : false>,
  Assert<KnowledgeEvidenceRecord extends KnowledgeCandidateEvidenceView ? true : false>,
  Assert<Record<string, never> extends KnowledgeCandidateRequestView ? true : false>,
  Assert<Record<string, never> extends KnowledgeCandidateEvidenceView ? true : false>,
  Assert<KnowledgeCandidateItemView extends KnowledgeItem ? false : true>,
  Assert<KnowledgeCandidateEvidenceView extends KnowledgeEvidence ? false : true>
];
