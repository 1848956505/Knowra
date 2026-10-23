import type { AppError } from '../src/errors/app-error.js';
import type { KnowledgeItemRecord } from '../src/modules/knowledge/infrastructure/knowledge-item-repository.js';
import type { KnowledgeEvidenceRecord } from '../src/modules/knowledge/infrastructure/knowledge-evidence-repository.js';
import type { LearningObjective } from '../src/modules/knowledge/domain/learning-objective.js';
import type { Question } from '../src/modules/knowledge/domain/question.js';
import type { QuestionSource } from '../src/modules/knowledge/domain/question-source.js';
import type {
  validationError,
  notFoundError,
  conflictError
} from '../src/modules/knowledge/application/knowledge-errors.js';
import type {
  QuestionStructureInput,
  validateQuestionStructure,
  isQuestionStructureComplete
} from '../src/modules/knowledge/application/question-validation.js';
import type {
  KnowledgeItemConfirmationInput,
  ConfirmedAssetReference,
  LearningObjectiveConfirmationInput,
  QuestionSourceInput,
  QuestionSourceReference,
  QuestionConfirmationContext,
  DerivedQuestionSourceStatus,
  assertKnowledgeItemConfirmable,
  assertLearningObjectiveConfirmable,
  deriveQuestionSourceStatus,
  assertQuestionConfirmable
} from '../src/modules/knowledge/application/formal-asset-validation.js';

type Assert<T extends true> = T;
type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;

// 校验入口消费最小记录，不假装历史数据已经构造成完整领域对象。
export type ValidatorInputs = [
  Assert<KnowledgeItemRecord extends KnowledgeItemConfirmationInput ? true : false>,
  Assert<KnowledgeItemRecord extends ConfirmedAssetReference ? true : false>,
  Assert<KnowledgeEvidenceRecord extends QuestionSourceReference ? true : false>,
  Assert<LearningObjective extends LearningObjectiveConfirmationInput ? true : false>,
  Assert<Question extends QuestionStructureInput ? true : false>,
  Assert<QuestionSource extends QuestionSourceInput ? true : false>,
  Assert<Record<string, never> extends QuestionStructureInput ? true : false>,
  Assert<Record<string, never> extends KnowledgeItemConfirmationInput ? true : false>,
  Assert<Equal<QuestionStructureInput['options'], unknown>>,
  Assert<Equal<QuestionStructureInput['referenceAnswer'], unknown>>,
  Assert<Equal<QuestionStructureInput['rubric'], unknown>>,
  Assert<Equal<QuestionStructureInput['questionType'], unknown>>,
  Assert<Equal<ConfirmedAssetReference['deletedAt'], unknown>>,
  Assert<Equal<QuestionSourceInput['locator'], unknown>>,
  Assert<Equal<QuestionSourceInput['contentHash'], unknown>>,
  Assert<Equal<QuestionSourceReference['isCurrent'], unknown>>,
  Assert<Equal<LearningObjectiveConfirmationInput['cognitiveLevel'], unknown>>,
  Assert<Equal<LearningObjectiveConfirmationInput['actionVerb'], string | null | undefined>>,
  Assert<QuestionStructureInput extends Question ? false : true>,
  Assert<QuestionSourceInput extends QuestionSource ? false : true>,
  Assert<
    {
      objectives: readonly [null, undefined, Record<string, never>];
      sources: readonly [null, undefined, { status: false }];
    } extends QuestionConfirmationContext
      ? true
      : false
  >
];

export type ValidatorResults = [
  Assert<Equal<ReturnType<typeof validationError>, AppError>>,
  Assert<Equal<ReturnType<typeof notFoundError>, AppError>>,
  Assert<Equal<ReturnType<typeof conflictError>, AppError>>,
  Assert<Equal<ReturnType<typeof validateQuestionStructure>, true>>,
  Assert<Equal<ReturnType<typeof isQuestionStructureComplete>, boolean>>,
  Assert<Equal<ReturnType<typeof assertKnowledgeItemConfirmable>, true>>,
  Assert<Equal<ReturnType<typeof assertLearningObjectiveConfirmable>, true>>,
  Assert<Equal<ReturnType<typeof assertQuestionConfirmable>, true>>,
  Assert<Equal<ReturnType<typeof deriveQuestionSourceStatus>, DerivedQuestionSourceStatus>>,
  Assert<Equal<DerivedQuestionSourceStatus, 'active' | 'stale'>>
];
