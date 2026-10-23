import {
  createWorkspaceSnapshotReader as create,
  type WorkspaceSnapshotRepositories,
  type WorkspaceSnapshotMap,
  type WorkspaceSnapshotGroups,
  type WorkspaceSnapshotLinks,
  type WorkspaceSnapshotIdRecord,
  type WorkspaceSnapshotItemRecord,
  type WorkspaceSnapshotFocusRecord,
  type WorkspaceSnapshotLinkRecord,
  type WorkspaceSnapshotSourceRecord
} from '../src/modules/knowledge/application/workspace-query-snapshot.ts';
import { createWorkspaceSnapshotReader as bridge } from '../src/modules/knowledge/application/workspace-query-snapshot.js';
import { createInMemoryNoteRepository } from '../src/modules/knowledge/infrastructure/note-repository.ts';
import { createInMemoryNoteVersionRepository } from '../src/modules/knowledge/infrastructure/note-version-repository.ts';
import { createInMemoryKnowledgeItemRepository } from '../src/modules/knowledge/infrastructure/knowledge-item-repository.ts';
import { createInMemoryKnowledgeEvidenceRepository } from '../src/modules/knowledge/infrastructure/knowledge-evidence-repository.ts';
import {
  createInMemoryLearningObjectiveRepository,
  createInMemoryExamProfileRepository,
  createInMemoryExamFocusRepository,
  createInMemoryQuestionRepository,
  createInMemoryQuestionObjectiveRepository,
  createInMemoryQuestionSourceRepository
} from '../src/modules/knowledge/infrastructure/assessment-repository.ts';
import { createPostgresNoteRepository } from '../src/modules/knowledge/infrastructure/postgres/note-repository.js';
import { createPostgresNoteVersionRepository } from '../src/modules/knowledge/infrastructure/postgres/note-version-repository.js';
import { createPostgresKnowledgeItemRepository } from '../src/modules/knowledge/infrastructure/postgres/knowledge-item-repository.js';
import { createPostgresKnowledgeEvidenceRepository } from '../src/modules/knowledge/infrastructure/postgres/knowledge-evidence-repository.js';
import { createPostgresLearningObjectiveRepository } from '../src/modules/knowledge/infrastructure/postgres/learning-objective-repository.js';
import { createPostgresExamProfileRepository } from '../src/modules/knowledge/infrastructure/postgres/exam-profile-repository.js';
import { createPostgresExamFocusRepository } from '../src/modules/knowledge/infrastructure/postgres/exam-focus-repository.js';
import { createPostgresQuestionRepository } from '../src/modules/knowledge/infrastructure/postgres/question-repository.js';
import { createPostgresQuestionObjectiveRepository } from '../src/modules/knowledge/infrastructure/postgres/question-objective-repository.js';
import { createPostgresQuestionSourceRepository } from '../src/modules/knowledge/infrastructure/postgres/question-source-repository.js';

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2 ? true : false;
type Assert<Value extends true> = Value;
type IsAny<Value> = 0 extends 1 & Value ? true : false;
type Result<Reader extends { load: () => unknown }> = Awaited<ReturnType<Reader['load']>>;

const _localRepositories = {
  noteRepository: createInMemoryNoteRepository(),
  noteVersionRepository: createInMemoryNoteVersionRepository(),
  knowledgeItemRepository: createInMemoryKnowledgeItemRepository(),
  knowledgeEvidenceRepository: createInMemoryKnowledgeEvidenceRepository(),
  learningObjectiveRepository: createInMemoryLearningObjectiveRepository(),
  examProfileRepository: createInMemoryExamProfileRepository(),
  examFocusRepository: createInMemoryExamFocusRepository(),
  questionRepository: createInMemoryQuestionRepository(),
  questionObjectiveRepository: createInMemoryQuestionObjectiveRepository(),
  questionSourceRepository: createInMemoryQuestionSourceRepository()
};
const _local = create({ repositories: _localRepositories });
// PostgreSQL 的实有工厂（只做类型检查，不连接数据库）。
declare const _postgres: {
  noteRepository: ReturnType<typeof createPostgresNoteRepository>;
  noteVersionRepository: ReturnType<typeof createPostgresNoteVersionRepository>;
  knowledgeItemRepository: ReturnType<typeof createPostgresKnowledgeItemRepository>;
  knowledgeEvidenceRepository: ReturnType<typeof createPostgresKnowledgeEvidenceRepository>;
  learningObjectiveRepository: ReturnType<typeof createPostgresLearningObjectiveRepository>;
  examProfileRepository: ReturnType<typeof createPostgresExamProfileRepository>;
  examFocusRepository: ReturnType<typeof createPostgresExamFocusRepository>;
  questionRepository: ReturnType<typeof createPostgresQuestionRepository>;
  questionObjectiveRepository: ReturnType<typeof createPostgresQuestionObjectiveRepository>;
  questionSourceRepository: ReturnType<typeof createPostgresQuestionSourceRepository>;
};
const _pg = create({ repositories: _postgres });
const _mixed = create({
  repositories: { ..._localRepositories, questionObjectiveRepository: _postgres.questionObjectiveRepository }
});
const _mixedReverse = create({
  repositories: { ..._postgres, questionObjectiveRepository: _localRepositories.questionObjectiveRepository }
});
const _defaults = create();
const _undefined = create(undefined);
const _empty = create({});
const _null = create({ repositories: null });
const _bridge = bridge({ repositories: _localRepositories });

const _customNotes = {
  map: (_project: (record: WorkspaceSnapshotIdRecord) => unknown) => new Set([['external', 7] as const]),
  marker: 'notes' as const
};
const _customEvidence = { reduce: () => Symbol('not-a-map'), marker: 'evidence' as const };
const _customQuestions = {
  map: (_project: (record: WorkspaceSnapshotIdRecord) => unknown) => new Set<unknown>(),
  marker: 'questions' as const
};
const _customLinks = { reduce: () => false, marker: 'links' as const };
const _custom = create({
  repositories: {
    ..._localRepositories,
    noteRepository: { list: () => _customNotes },
    noteVersionRepository: { list: () => Promise.resolve([{ id: 1n, marker: 'version' }] as const) },
    knowledgeItemRepository: { list: () => ({ passthrough: true as const }) },
    knowledgeEvidenceRepository: { list: () => _customEvidence },
    learningObjectiveRepository: { list: () => ({ reduce: () => undefined, marker: 'objective' as const }) },
    examProfileRepository: { list: () => 4n },
    examFocusRepository: { list: () => ({ reduce: () => new Date(), marker: 'focus' as const }) },
    questionRepository: { list: () => _customQuestions },
    questionObjectiveRepository: { listByQuestionIds: (_ids: Set<unknown>) => _customLinks },
    questionSourceRepository: { list: () => ({ reduce: () => 'not-a-map', marker: 'sources' as const }) }
  }
});
const _customScalar = create({
  repositories: {
    ..._localRepositories,
    questionRepository: { list: () => ({ map: () => Symbol('ids') }) },
    questionObjectiveRepository: { listByQuestionIds: (_ids: symbol) => [] }
  }
});
const _arrayIds = create({
  repositories: {
    ..._localRepositories,
    questionRepository: { list: () => [{ id: Symbol() }] },
    questionObjectiveRepository: { listByQuestionIds: (_ids: unknown[]) => [] }
  }
});
const _readonlyIds = create({
  repositories: {
    ..._localRepositories,
    questionRepository: { list: () => [{ id: 1n }] as const },
    questionObjectiveRepository: { listByQuestionIds: (_ids: readonly unknown[]) => [] }
  }
});
const _promise = create({
  repositories: {
    ..._localRepositories,
    noteRepository: { list: async () => [{ id: 'note' as const, marker: 1 }] },
    questionRepository: { list: async () => [{ id: 'q' as const }] },
    questionObjectiveRepository: {
      listByQuestionIds: async (_ids: Iterable<unknown>) => [{ questionId: 'q', learningObjectiveId: 1n }]
    }
  }
});
declare const _thenable: PromiseLike<readonly [{ readonly id: 'thenable' }]>;
const _thenableReader = create({ repositories: { ..._localRepositories, noteRepository: { list: () => _thenable } } });
const _rawMap: WorkspaceSnapshotMap<WorkspaceSnapshotIdRecord> = { map: () => false };
const _rawGroups: WorkspaceSnapshotGroups<WorkspaceSnapshotItemRecord> = { reduce: () => false };
const _rawLinks: WorkspaceSnapshotLinks = { reduce: () => null };
const _setIdsPort: WorkspaceSnapshotRepositories<Set<unknown>> = {
  ..._localRepositories,
  questionRepository: { list: () => _customQuestions }
};
const _arrayIdsPort: WorkspaceSnapshotRepositories<unknown[]> = _localRepositories;
const _readonlyIdsPort: WorkspaceSnapshotRepositories<readonly unknown[]> = _localRepositories;
const _iterableIdsPort: WorkspaceSnapshotRepositories<Iterable<unknown>> = _localRepositories;

type _Bridge = Assert<Equal<typeof bridge, typeof create>>;
type _Async = Assert<Equal<ReturnType<typeof _local.load> extends Promise<unknown> ? true : false, true>>;
type _Notes = Assert<Equal<Result<typeof _local>['notes'], ReturnType<typeof _localRepositories.noteRepository.list>>>;
type _Versions = Assert<
  Equal<Result<typeof _local>['noteVersions'], ReturnType<typeof _localRepositories.noteVersionRepository.list>>
>;
type _Items = Assert<
  Equal<Result<typeof _local>['knowledgeItems'], ReturnType<typeof _localRepositories.knowledgeItemRepository.list>>
>;
type _Evidence = Assert<
  Equal<Result<typeof _local>['evidence'], ReturnType<typeof _localRepositories.knowledgeEvidenceRepository.list>>
>;
type _Objectives = Assert<
  Equal<Result<typeof _local>['objectives'], ReturnType<typeof _localRepositories.learningObjectiveRepository.list>>
>;
type _Profiles = Assert<
  Equal<Result<typeof _local>['profiles'], ReturnType<typeof _localRepositories.examProfileRepository.list>>
>;
type _Focuses = Assert<
  Equal<Result<typeof _local>['focuses'], ReturnType<typeof _localRepositories.examFocusRepository.list>>
>;
type _QuestionFields = Assert<Equal<Result<typeof _local>['questions'][number]['id'], unknown>>;
type _Links = Assert<
  Equal<
    Result<typeof _local>['questionObjectives'],
    ReturnType<typeof _localRepositories.questionObjectiveRepository.listByQuestionIds>
  >
>;
type _Sources = Assert<
  Equal<Result<typeof _local>['questionSources'], ReturnType<typeof _localRepositories.questionSourceRepository.list>>
>;
type _NoteIndex = Assert<Equal<Result<typeof _local>['indexes']['noteById'], Map<unknown, unknown>>>;
type _VersionIndex = Assert<Equal<Result<typeof _local>['indexes']['noteVersionById'], Map<unknown, unknown>>>;
type _EvidenceIndex = Assert<Equal<Result<typeof _local>['indexes']['evidenceByItem'], unknown>>;
type _ObjectiveIndex = Assert<Equal<Result<typeof _local>['indexes']['objectivesByItem'], unknown>>;
type _FocusIndex = Assert<Equal<Result<typeof _local>['indexes']['focusByProfile'], unknown>>;
type _LinksIndex = Assert<Equal<Result<typeof _local>['indexes']['linksByQuestion'], unknown>>;
type _SourcesIndex = Assert<Equal<Result<typeof _local>['indexes']['sourcesByQuestion'], unknown>>;
type _QuestionsIndex = Assert<Equal<Result<typeof _local>['indexes']['questionsByObjective'], unknown>>;
type _CustomNotes = Assert<Equal<Result<typeof _custom>['notes'], typeof _customNotes>>;
type _CustomVersions = Assert<
  Equal<Result<typeof _custom>['noteVersions'], readonly [{ readonly id: 1n; readonly marker: 'version' }]>
>;
type _CustomItems = Assert<Equal<Result<typeof _custom>['knowledgeItems'], { passthrough: true }>>;
type _CustomEvidence = Assert<Equal<Result<typeof _custom>['evidence'], typeof _customEvidence>>;
type _CustomObjective = Assert<Equal<Result<typeof _custom>['objectives']['marker'], 'objective'>>;
type _CustomProfile = Assert<Equal<Result<typeof _custom>['profiles'], bigint>>;
type _CustomFocus = Assert<Equal<Result<typeof _custom>['focuses']['marker'], 'focus'>>;
type _CustomQuestions = Assert<Equal<Result<typeof _custom>['questions']['marker'], 'questions'>>;
type _CustomLinks = Assert<Equal<Result<typeof _custom>['questionObjectives'], typeof _customLinks>>;
type _CustomSources = Assert<Equal<Result<typeof _custom>['questionSources']['marker'], 'sources'>>;
type _CustomMapResult = Assert<Equal<ReturnType<Result<typeof _customScalar>['questions']['map']>, symbol>>;
type _PromiseNote = Assert<Equal<Result<typeof _promise>['notes'][number]['id'], 'note'>>;
type _ThenableNote = Assert<Equal<Result<typeof _thenableReader>['notes'], readonly [{ readonly id: 'thenable' }]>>;
type _DefaultItems = Assert<Equal<Result<ReturnType<typeof create>>['knowledgeItems'], unknown>>;
type _DefaultProfile = Assert<Equal<Result<ReturnType<typeof create>>['profiles'], unknown>>;
type _DefaultUnknownIndex = Assert<Equal<Result<ReturnType<typeof create>>['indexes']['evidenceByItem'], unknown>>;
type _NoAnyNotes = Assert<Equal<IsAny<Result<typeof _custom>['notes']>, false>>;
type _NoAnyIndexes = Assert<Equal<IsAny<Result<typeof _local>['indexes']['noteById']>, false>>;
type _NoAnyReturn = Assert<Equal<IsAny<Result<ReturnType<typeof create>>>, false>>;
type _IdUnknown = Assert<Equal<WorkspaceSnapshotIdRecord['id'], unknown>>;
type _ItemUnknown = Assert<Equal<WorkspaceSnapshotItemRecord['knowledgeItemId'], unknown>>;
type _FocusUnknown = Assert<Equal<WorkspaceSnapshotFocusRecord['examProfileId'], unknown>>;
type _LinkUnknown = Assert<Equal<WorkspaceSnapshotLinkRecord['learningObjectiveId'], unknown>>;
type _SourceUnknown = Assert<Equal<WorkspaceSnapshotSourceRecord['questionId'], unknown>>;
void [
  _local,
  _pg,
  _mixed,
  _mixedReverse,
  _defaults,
  _undefined,
  _empty,
  _null,
  _bridge,
  _custom,
  _customScalar,
  _arrayIds,
  _readonlyIds,
  _promise,
  _thenableReader,
  _rawMap,
  _rawGroups,
  _rawLinks,
  _setIdsPort,
  _arrayIdsPort,
  _readonlyIdsPort,
  _iterableIdsPort
];
