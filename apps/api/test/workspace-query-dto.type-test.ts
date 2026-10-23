import {
  toKnowledgeItemWorkspaceDto as item,
  toLearningObjectiveWorkspaceDto as objective,
  toQuestionWorkspaceDto as question,
  toExamProfileWorkspaceDto as profile,
  toExamFocusSummary as focus,
  type WorkspaceKnowledgeItemRecord,
  type WorkspaceLearningObjectiveRecord,
  type WorkspaceQuestionRecord,
  type WorkspaceExamProfileRecord,
  type WorkspaceExamFocusRecord,
  type KnowledgeItemWorkspaceDto,
  type LearningObjectiveWorkspaceDto,
  type QuestionWorkspaceDto,
  type ExamProfileWorkspaceDto,
  type ExamFocusSummary,
  type KnowledgeItemWorkspaceOptions,
  type LearningObjectiveWorkspaceOptions,
  type QuestionWorkspaceOptions,
  type ExamProfileWorkspaceOptions,
  type WorkspaceProjectionMap,
  type WorkspaceProjectionLookup,
  type WorkspaceObjectiveLinks
} from '../src/modules/knowledge/application/workspace-query-dto.ts';
import { KnowledgeItem } from '../src/modules/knowledge/domain/knowledge-item.ts';
import { LearningObjective } from '../src/modules/knowledge/domain/learning-objective.ts';
import { Question } from '../src/modules/knowledge/domain/question.ts';
import { ExamProfile } from '../src/modules/knowledge/domain/exam-profile.ts';
import { ExamFocus } from '../src/modules/knowledge/domain/exam-focus.ts';
import {
  createInMemoryLearningObjectiveRepository,
  createInMemoryQuestionRepository,
  createInMemoryExamProfileRepository,
  createInMemoryExamFocusRepository
} from '../src/modules/knowledge/infrastructure/assessment-repository.ts';

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2 ? true : false;
type Assert<Value extends true> = Value;
type IsAny<Value> = 0 extends 1 & Value ? true : false;

const _item = item(new KnowledgeItem({ id: 'i' }));
const _objective = objective(new LearningObjective({ id: 'o', knowledgeItemId: 'i' }));
const _question = question(new Question({ id: 'q' }));
const _profile = profile(new ExamProfile({ id: 'p', name: 'profile' }));
const _focus = focus(new ExamFocus({ id: 'f', examProfileId: 'p', learningObjectiveId: 'o' }));
const _literal = item({ id: 'literal', title: 1n, importance: Symbol() } as const);
const _rawObjective = objective({ id: false, order: { legacy: true }, reviewNote: Symbol() });
const _rawQuestion = question({ referenceAnswer: new Map(), options: false, rubric: 1n });
const _rawProfile = profile({ scope: Symbol(), language: false, difficultyProfile: 1n });
const _rawFocus = focus({ priority: 'not-normalized', questionTypeSuggestions: false }, Symbol());
const _empty = item({}, undefined);
const _undefinedObjective = objective({}, undefined);
const _undefinedQuestion = question({}, undefined);
const _undefinedProfile = profile({}, undefined);
const _undefinedFocus = focus({}, undefined);
const _customItem = item(
  {},
  {
    evidence: { map: () => false, length: Symbol() },
    objectives: { filter: () => ({ length: { arbitrary: true } }), length: null },
    questions: { length: 1n },
    noteById: { get: (key: string) => key }
  }
);
const _customObjective = objective(
  {},
  {
    knowledgeItem: { id: 1n, title: Symbol(), evidenceStatus: false },
    questions: { map: () => Promise.resolve('not-an-array'), length: false }
  }
);
const _customLinks: WorkspaceObjectiveLinks = {
  find: callback => ({ returned: callback({ isPrimary: 1n }) }),
  0: Symbol(),
  *[Symbol.iterator]() {
    yield { order: { valueOf: () => 1 }, learningObjectiveId: 1n };
  }
};
const _customQuestion = question(
  {},
  {
    objectives: _customLinks,
    sources: { map: () => ({ arbitrary: true }) },
    sourceLabels: new Map<string, unknown>([['note:n', false]])
  }
);
const _customProfile = profile(
  {},
  {
    focuses: { map: () => Symbol(), filter: () => ({ length: false }), length: 1n },
    objectiveById: new Map<string, LearningObjective>()
  }
);
const _lookup: WorkspaceProjectionLookup = { get: (key: number) => key };
const _map: WorkspaceProjectionMap<{ id?: unknown }> = [{ id: 'q' }];
const _readonly = objective({}, { questions: [{ id: 'readonly' }] as const });
const _mapDefault: WorkspaceProjectionMap<WorkspaceKnowledgeItemRecord> = { map: () => false };
const _itemContract: (
  record: WorkspaceKnowledgeItemRecord,
  options?: KnowledgeItemWorkspaceOptions
) => KnowledgeItemWorkspaceDto = item;
const _objectiveContract: (
  record: WorkspaceLearningObjectiveRecord,
  options?: LearningObjectiveWorkspaceOptions
) => LearningObjectiveWorkspaceDto = objective;
const _questionContract: (record: WorkspaceQuestionRecord, options?: QuestionWorkspaceOptions) => QuestionWorkspaceDto =
  question;
const _profileContract: (
  record: WorkspaceExamProfileRecord,
  options?: ExamProfileWorkspaceOptions
) => ExamProfileWorkspaceDto = profile;
const _focusContract: (record: WorkspaceExamFocusRecord, objective?: unknown) => ExamFocusSummary = focus;
const _repositoryObjectives = createInMemoryLearningObjectiveRepository()
  .list()
  .map(record => objective(record));
const _repositoryQuestions = createInMemoryQuestionRepository()
  .list()
  .map(record => question(record));
const _repositoryProfiles = createInMemoryExamProfileRepository()
  .list()
  .map(record => profile(record));
const _repositoryFocuses = createInMemoryExamFocusRepository()
  .list()
  .map(record => focus(record));

export type WorkspaceDtoAssertions = [
  Assert<Equal<typeof _item.id, string>>,
  Assert<Equal<typeof _item.title, string>>,
  Assert<Equal<typeof _item.importance, number | null>>,
  Assert<Equal<typeof _objective.order, number>>,
  Assert<Equal<typeof _objective.objective, string>>,
  Assert<Equal<typeof _question.version, number>>,
  Assert<Equal<typeof _question.options, unknown[] | null>>,
  Assert<Equal<typeof _question.referenceAnswer, unknown>>,
  Assert<Equal<typeof _profile.scope, unknown[]>>,
  Assert<Equal<typeof _profile.archivedAt, string | null>>,
  Assert<Equal<typeof _focus.priority, number>>,
  Assert<Equal<typeof _literal.id, 'literal'>>,
  Assert<Equal<typeof _literal.title, 1n>>,
  Assert<Equal<typeof _literal.importance, symbol>>,
  Assert<Equal<typeof _rawObjective.id, boolean>>,
  Assert<Equal<typeof _rawObjective.order, { legacy: boolean }>>,
  Assert<Equal<typeof _rawObjective.reviewNote, symbol>>,
  Assert<Equal<typeof _rawQuestion.options, boolean>>,
  Assert<Equal<typeof _rawQuestion.rubric, bigint>>,
  Assert<Equal<typeof _rawProfile.scope, symbol>>,
  Assert<Equal<typeof _rawProfile.language, boolean>>,
  Assert<Equal<typeof _rawProfile.difficultyProfile, bigint>>,
  Assert<Equal<typeof _rawFocus.priority, string>>,
  Assert<Equal<typeof _rawFocus.questionTypeSuggestions, boolean>>,
  Assert<Equal<typeof _empty.id, unknown>>,
  Assert<Equal<typeof _empty.evidenceCount, unknown>>,
  Assert<Equal<typeof _empty.evidenceSummary, unknown>>,
  Assert<Equal<typeof _empty.objectiveCount, unknown>>,
  Assert<Equal<typeof _empty.confirmedObjectiveCount, unknown>>,
  Assert<Equal<typeof _empty.questionCount, unknown>>,
  Assert<Equal<typeof _empty.noteIds, unknown[]>>,
  Assert<Equal<typeof _empty.evidenceStatus, 'invalid' | 'stale' | 'insufficient' | 'valid'>>,
  Assert<Equal<typeof _empty.sourceHealth, typeof _empty.evidenceStatus>>,
  Assert<Equal<typeof _undefinedObjective.questionIds, unknown>>,
  Assert<Equal<typeof _undefinedObjective.questionCount, unknown>>,
  Assert<Equal<typeof _undefinedQuestion.objectives, unknown>>,
  Assert<Equal<typeof _undefinedQuestion.learningObjectiveIds, unknown>>,
  Assert<Equal<typeof _undefinedQuestion.sources, unknown>>,
  Assert<Equal<typeof _undefinedQuestion.sourceStatus, 'stale' | 'valid' | 'insufficient'>>,
  Assert<Equal<typeof _undefinedProfile.focuses, unknown>>,
  Assert<Equal<typeof _undefinedProfile.focusCount, unknown>>,
  Assert<Equal<typeof _undefinedProfile.confirmedFocusCount, unknown>>,
  Assert<Equal<NonNullable<typeof _undefinedFocus.learningObjective>['id'], unknown>>,
  Assert<Equal<NonNullable<typeof _undefinedObjective.knowledgeItem>['evidenceStatus'], unknown>>,
  Assert<Equal<NonNullable<typeof _undefinedQuestion.primaryObjective>['objective'], unknown>>,
  Assert<Equal<typeof _customItem.evidenceSummary, unknown>>,
  Assert<Equal<typeof _customObjective.questionIds, unknown>>,
  Assert<Equal<typeof _customQuestion.sources, unknown>>,
  Assert<Equal<typeof _customProfile.focuses, unknown>>,
  Assert<Equal<ReturnType<typeof item>, KnowledgeItemWorkspaceDto>>,
  Assert<Equal<ReturnType<typeof objective>, LearningObjectiveWorkspaceDto>>,
  Assert<Equal<ReturnType<typeof question>, QuestionWorkspaceDto>>,
  Assert<Equal<ReturnType<typeof profile>, ExamProfileWorkspaceDto>>,
  Assert<Equal<ReturnType<typeof focus>, ExamFocusSummary>>,
  Assert<Equal<Parameters<typeof item>, [WorkspaceKnowledgeItemRecord, KnowledgeItemWorkspaceOptions?]>>,
  Assert<Equal<Parameters<typeof objective>, [WorkspaceLearningObjectiveRecord, LearningObjectiveWorkspaceOptions?]>>,
  Assert<Equal<Parameters<typeof question>, [WorkspaceQuestionRecord, QuestionWorkspaceOptions?]>>,
  Assert<Equal<Parameters<typeof profile>, [WorkspaceExamProfileRecord, ExamProfileWorkspaceOptions?]>>,
  Assert<Equal<Parameters<typeof focus>, [WorkspaceExamFocusRecord, unknown?]>>,
  Assert<Equal<IsAny<ReturnType<typeof item>['id']>, false>>,
  Assert<Equal<IsAny<ReturnType<typeof question>['sources']>, false>>,
  Assert<Equal<IsAny<Parameters<typeof focus>[1]>, false>>,
  Assert<Equal<(typeof _repositoryObjectives)[number]['order'], unknown>>,
  Assert<Equal<(typeof _repositoryQuestions)[number]['version'], unknown>>,
  Assert<Equal<(typeof _repositoryProfiles)[number]['scope'], unknown>>,
  Assert<Equal<(typeof _repositoryFocuses)[number]['priority'], unknown>>
];
