import {
  createReviewQueueQuery as create,
  type ReviewQueueSnapshot,
  type ReviewQueueSnapshotReader,
  type ReviewQueueQueryOptions,
  type ReviewQueuePage
} from '../src/modules/knowledge/application/review-queue-query-service.ts';
import { createReviewQueueQuery as bridge } from '../src/modules/knowledge/application/review-queue-query-service.js';
import { createWorkspaceQueryService as compose } from '../src/modules/knowledge/application/workspace-query-service.ts';
import { createWorkspaceQueryService as composeBridge } from '../src/modules/knowledge/application/workspace-query-service.js';
import {
  createWorkspaceSnapshotReader as createSnapshot,
  type WorkspaceSnapshotRepositories,
  type WorkspaceSnapshotIdRecord
} from '../src/modules/knowledge/application/workspace-query-snapshot.ts';
import type { WorkspaceQueryInput } from '../src/modules/knowledge/application/workspace-query-utils.ts';
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
const _local = createSnapshot({ repositories: _localRepositories });
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
const _pg = createSnapshot({ repositories: _postgres });
const _mixed = createSnapshot({
  repositories: { ..._localRepositories, questionObjectiveRepository: _postgres.questionObjectiveRepository }
});
const _mixedReverse = createSnapshot({
  repositories: { ..._postgres, questionObjectiveRepository: _localRepositories.questionObjectiveRepository }
});

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2 ? true : false;
type Assert<Value extends true> = Value;
type IsAny<Value> = 0 extends 1 & Value ? true : false;

const _localQuery = create({ snapshotReader: _local });
const _pgQuery = create({ snapshotReader: _pg });
const _mixedQuery = create({ snapshotReader: _mixed });
const _mixedReverseQuery = create({ snapshotReader: _mixedReverse });
const _bridgeQuery = bridge({ snapshotReader: _local });
declare const _broadReader: ReturnType<typeof createSnapshot>;
const _broadQuery = create({ snapshotReader: _broadReader });
declare const _snapshot: ReviewQueueSnapshot;
declare const _thenable: PromiseLike<ReviewQueueSnapshot>;
const _sync = create({ snapshotReader: { load: () => _snapshot } });
const _async = create({ snapshotReader: { load: async () => _snapshot } });
const _promiseLike = create({ snapshotReader: { load: () => _thenable } });
const _optionalParameter = create({ snapshotReader: { load: (_unused?: string) => _snapshot } });
const _defaults = create();
const _undefined = create(undefined);
const _empty = create({});
const _nullReader = create({ snapshotReader: null });
const _custom = create({
  snapshotReader: {
    load: () => ({
      knowledgeItems: { map: (project: (record: { id: string }) => string) => project({ id: 'i' }) },
      evidence: Symbol(),
      objectives: new Set([1n]),
      questions: null,
      indexes: { linksByQuestion: { get: (key: string) => key }, sourcesByQuestion: 17 }
    })
  }
});
const _unknownInput = _sync.listReviewQueue({ limit: 1n, query: Symbol(), kind: { value: true } });
const _defaultList = _sync.listReviewQueue();
const _localService = compose({ repositories: _localRepositories });
const _pgService = compose({ repositories: _postgres });
const _mixedService = compose({
  repositories: { ..._localRepositories, questionObjectiveRepository: _postgres.questionObjectiveRepository }
});
const _mixedReverseService = compose({
  repositories: { ..._postgres, questionObjectiveRepository: _localRepositories.questionObjectiveRepository }
});
const _bridgeService = composeBridge({ repositories: _localRepositories });
const _defaultService = compose();
const _emptyService = compose({});
const _nullService = compose({ repositories: null });
const _undefinedService = compose(undefined);
declare const _broadRepositories: WorkspaceSnapshotRepositories;
const _broadService = compose({ repositories: _broadRepositories });
const _customService = compose({
  repositories: {
    ..._localRepositories,
    noteRepository: {
      list: () => ({ map: (_project: (record: WorkspaceSnapshotIdRecord) => unknown) => new Set([['n', 17]]) })
    },
    noteVersionRepository: { list: async () => [{ id: 1n, marker: true }] },
    knowledgeItemRepository: { list: () => Symbol() },
    knowledgeEvidenceRepository: { list: () => ({ reduce: () => false }) },
    learningObjectiveRepository: { list: () => ({ reduce: () => new Date() }) },
    examProfileRepository: { list: () => 1n },
    examFocusRepository: { list: () => ({ reduce: () => null }) },
    questionRepository: { list: () => ({ map: () => new Set<unknown>() }) },
    questionObjectiveRepository: { listByQuestionIds: (_ids: Set<unknown>) => ({ reduce: () => 17 }) },
    questionSourceRepository: { list: () => ({ reduce: () => Symbol() }) }
  }
});
const _symbolService = compose({
  repositories: {
    ..._localRepositories,
    questionRepository: { list: () => ({ map: () => Symbol('ids') }) },
    questionObjectiveRepository: { listByQuestionIds: (_ids: symbol) => [] }
  }
});
const _arrayService = compose({
  repositories: {
    ..._localRepositories,
    questionRepository: { list: () => [{ id: Symbol() }] },
    questionObjectiveRepository: { listByQuestionIds: (_ids: unknown[]) => [] }
  }
});
const _readonlyService = compose({
  repositories: {
    ..._localRepositories,
    questionRepository: { list: () => [{ id: 1n }] as const },
    questionObjectiveRepository: { listByQuestionIds: (_ids: readonly unknown[]) => [] }
  }
});
declare const _notesThenable: PromiseLike<readonly [{ readonly id: 'thenable' }]>;
const _thenableService = compose({
  repositories: { ..._localRepositories, noteRepository: { list: () => _notesThenable } }
});
const _promiseService = compose({
  repositories: {
    ..._localRepositories,
    questionRepository: { list: async () => [{ id: 'q' }] },
    questionObjectiveRepository: {
      listByQuestionIds: async (_ids: Iterable<unknown>) => [{ questionId: 'q', learningObjectiveId: 1n }]
    }
  }
});

type Query = ReturnType<typeof create>;
type Page = Awaited<ReturnType<Query['listReviewQueue']>>;
type Service = ReturnType<typeof compose>;
type Overview = Awaited<ReturnType<Service['getTrainingOverview']>>;
type KnowledgeOverview = Awaited<ReturnType<Service['getKnowledgeOverview']>>;
export type ReviewWorkspaceContracts = [
  Assert<Equal<Parameters<typeof create>, [ReviewQueueQueryOptions?]>>,
  Assert<Equal<Parameters<Query['listReviewQueue']>, [WorkspaceQueryInput?]>>,
  Assert<Equal<Parameters<ReviewQueueSnapshotReader['load']>, []>>,
  Assert<Equal<ReturnType<ReviewQueueSnapshotReader['load']>, ReviewQueueSnapshot | PromiseLike<ReviewQueueSnapshot>>>,
  Assert<Equal<Page, ReviewQueuePage>>,
  Assert<Equal<Page['items'], unknown[]>>,
  Assert<Equal<Page['pagination']['limit'], number>>,
  Assert<Equal<Page['pagination']['sort'], string>>,
  Assert<Equal<Page['pagination']['total'], number>>,
  Assert<Equal<Page['pagination']['hasMore'], boolean>>,
  Assert<Equal<Page['pagination']['nextCursor'], string | null>>,
  Assert<Equal<ReviewQueueSnapshot['knowledgeItems'], unknown>>,
  Assert<Equal<ReviewQueueSnapshot['evidence'], unknown>>,
  Assert<Equal<ReviewQueueSnapshot['objectives'], unknown>>,
  Assert<Equal<ReviewQueueSnapshot['questions'], unknown>>,
  Assert<Equal<ReviewQueueSnapshot['indexes']['linksByQuestion'], unknown>>,
  Assert<Equal<ReviewQueueSnapshot['indexes']['sourcesByQuestion'], unknown>>,
  Assert<Equal<typeof _localQuery, Query>>,
  Assert<Equal<typeof _pgQuery, Query>>,
  Assert<Equal<typeof _mixedQuery, Query>>,
  Assert<Equal<typeof _mixedReverseQuery, Query>>,
  Assert<Equal<typeof _bridgeQuery, Query>>,
  Assert<Equal<typeof _broadQuery, Query>>,
  Assert<Equal<typeof _sync, typeof _async>>,
  Assert<Equal<typeof _sync, typeof _promiseLike>>,
  Assert<Equal<typeof _sync, typeof _optionalParameter>>,
  Assert<Equal<typeof _defaults, typeof _undefined>>,
  Assert<Equal<typeof _empty, typeof _nullReader>>,
  Assert<Equal<typeof _custom, Query>>,
  Assert<Equal<typeof _unknownInput, Promise<ReviewQueuePage>>>,
  Assert<Equal<typeof _defaultList, Promise<ReviewQueuePage>>>,
  Assert<Equal<typeof bridge, typeof create>>,
  Assert<Equal<typeof composeBridge, typeof compose>>,
  Assert<Equal<Parameters<typeof compose>, Parameters<typeof createSnapshot>>>,
  Assert<Equal<typeof _localService, Service>>,
  Assert<Equal<typeof _pgService, Service>>,
  Assert<Equal<typeof _mixedService, Service>>,
  Assert<Equal<typeof _mixedReverseService, Service>>,
  Assert<Equal<typeof _bridgeService, Service>>,
  Assert<Equal<typeof _defaultService, Service>>,
  Assert<Equal<typeof _emptyService, Service>>,
  Assert<Equal<typeof _nullService, Service>>,
  Assert<Equal<typeof _undefinedService, Service>>,
  Assert<Equal<typeof _broadService, Service>>,
  Assert<Equal<typeof _customService, Service>>,
  Assert<Equal<typeof _symbolService, Service>>,
  Assert<Equal<typeof _arrayService, Service>>,
  Assert<Equal<typeof _readonlyService, Service>>,
  Assert<Equal<typeof _thenableService, Service>>,
  Assert<Equal<typeof _promiseService, Service>>,
  Assert<Equal<Service['listReviewQueue'], Query['listReviewQueue']>>,
  Assert<Equal<Awaited<ReturnType<Service['listKnowledgeItems']>>['items'], unknown[]>>,
  Assert<Equal<Awaited<ReturnType<Service['listLearningObjectives']>>['items'], unknown[]>>,
  Assert<Equal<Awaited<ReturnType<Service['listQuestions']>>['items'], unknown[]>>,
  Assert<Equal<Awaited<ReturnType<Service['listExamProfiles']>>['items'], unknown[]>>,
  Assert<Equal<Overview['questions']['byReviewStatus'], unknown>>,
  Assert<Equal<Overview['questions']['total'], unknown>>,
  Assert<Equal<Overview['recentQuestions'], unknown>>,
  Assert<Equal<KnowledgeOverview['knowledgeItems']['total'], unknown>>,
  Assert<Equal<KnowledgeOverview['knowledgeItems']['byReviewStatus'], unknown>>,
  Assert<Equal<KnowledgeOverview['recentItems'], unknown>>,
  Assert<Equal<IsAny<Page['items'][number]>, false>>,
  Assert<Equal<IsAny<Overview['questions']['byReviewStatus']>, false>>,
  Assert<Equal<IsAny<KnowledgeOverview['recentItems']>, false>>,
  Assert<Equal<IsAny<Service>, false>>
];
