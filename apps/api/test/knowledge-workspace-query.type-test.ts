import {
  createKnowledgeWorkspaceQuery as create,
  type KnowledgeWorkspaceSnapshot,
  type KnowledgeWorkspaceSnapshotReader,
  type KnowledgeWorkspaceQueryOptions,
  type KnowledgeWorkspacePage
} from '../src/modules/knowledge/application/knowledge-workspace-query-service.ts';
import { createKnowledgeWorkspaceQuery as bridge } from '../src/modules/knowledge/application/knowledge-workspace-query-service.js';
import { createWorkspaceSnapshotReader as createSnapshot } from '../src/modules/knowledge/application/workspace-query-snapshot.ts';
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
const _postgresQuery = create({ snapshotReader: _pg });
const _mixedQuery = create({ snapshotReader: _mixed });
const _mixedReverseQuery = create({ snapshotReader: _mixedReverse });
const _bridgeQuery = bridge({ snapshotReader: _local });
declare const _broadSnapshotReader: ReturnType<typeof createSnapshot>;
const _broadQuery = create({ snapshotReader: _broadSnapshotReader });
declare const _snapshot: KnowledgeWorkspaceSnapshot;
declare const _thenable: PromiseLike<KnowledgeWorkspaceSnapshot>;
const _sync = create({ snapshotReader: { load: () => _snapshot } });
const _async = create({ snapshotReader: { load: async () => _snapshot } });
const _promiseLike = create({ snapshotReader: { load: () => _thenable } });
const _optionalParameter = create({ snapshotReader: { load: (_unused?: string) => _snapshot } });
const _defaults = create();
const _undefined = create(undefined);
const _empty = create({});
const _nullReader = create({ snapshotReader: null });
// 未验证快照字段可以是任意值；声明不保证每种快照都能执行成功。
const _custom = create({
  snapshotReader: {
    load: () => ({
      knowledgeItems: { filter: () => ({ filter: () => ({ map: () => ({ filter: () => new Set([17]) }) }) }) },
      objectives: Symbol('not-an-array'),
      evidence: 42,
      indexes: {
        noteById: new Map<string, bigint>(),
        evidenceByItem: false,
        objectivesByItem: null,
        questionsByObjective: 7n
      }
    })
  }
});
const _unknownInput = _sync.listKnowledgeItems({ limit: 1n, query: Symbol(), includeArchived: { value: true } });
const _defaultItems = _sync.listKnowledgeItems();
const _defaultObjectives = _sync.listLearningObjectives();

type Service = ReturnType<typeof create>;
type Overview = Awaited<ReturnType<Service['getKnowledgeOverview']>>;
type Page = Awaited<ReturnType<Service['listKnowledgeItems']>>;
type ObjectivePage = Awaited<ReturnType<Service['listLearningObjectives']>>;
export type KnowledgeWorkspaceContracts = [
  Assert<Equal<Parameters<typeof create>, [KnowledgeWorkspaceQueryOptions?]>>,
  Assert<Equal<Parameters<Service['listKnowledgeItems']>, [WorkspaceQueryInput?]>>,
  Assert<Equal<Parameters<Service['listLearningObjectives']>, [WorkspaceQueryInput?]>>,
  Assert<Equal<Parameters<Service['getKnowledgeOverview']>, []>>,
  Assert<Equal<Parameters<KnowledgeWorkspaceSnapshotReader['load']>, []>>,
  Assert<
    Equal<
      ReturnType<KnowledgeWorkspaceSnapshotReader['load']>,
      KnowledgeWorkspaceSnapshot | PromiseLike<KnowledgeWorkspaceSnapshot>
    >
  >,
  Assert<Equal<Page, KnowledgeWorkspacePage>>,
  Assert<Equal<ObjectivePage, KnowledgeWorkspacePage>>,
  Assert<Equal<Page['items'], unknown[]>>,
  Assert<Equal<ObjectivePage['items'][number], unknown>>,
  Assert<Equal<Page['pagination']['limit'], number>>,
  Assert<Equal<Page['pagination']['sort'], string>>,
  Assert<Equal<Page['pagination']['total'], number>>,
  Assert<Equal<Page['pagination']['hasMore'], boolean>>,
  Assert<Equal<Page['pagination']['nextCursor'], string | null>>,
  Assert<Equal<Overview['generatedAt'], string>>,
  Assert<Equal<Overview['knowledgeItems']['total'], unknown>>,
  Assert<Equal<Overview['knowledgeItems']['byReviewStatus'], unknown>>,
  Assert<Equal<Overview['knowledgeItems']['byKnowledgeType'], unknown>>,
  Assert<Equal<Overview['evidence']['byStatus'], unknown>>,
  Assert<Equal<Overview['evidence']['byHealth'], unknown>>,
  Assert<Equal<Overview['learningObjectives']['total'], unknown>>,
  Assert<Equal<Overview['learningObjectives']['byReviewStatus'], unknown>>,
  Assert<Equal<Overview['learningObjectives']['withoutConfirmedObjective'], unknown>>,
  Assert<Equal<Overview['coverage']['itemsWithoutConfirmedObjective'], unknown>>,
  Assert<Equal<Overview['coverage']['itemsWithoutQuestions'], unknown>>,
  Assert<Equal<Overview['recentItems'], unknown>>,
  Assert<Equal<KnowledgeWorkspaceSnapshot['knowledgeItems'], unknown>>,
  Assert<Equal<KnowledgeWorkspaceSnapshot['objectives'], unknown>>,
  Assert<Equal<KnowledgeWorkspaceSnapshot['evidence'], unknown>>,
  Assert<Equal<KnowledgeWorkspaceSnapshot['indexes']['evidenceByItem'], unknown>>,
  Assert<Equal<KnowledgeWorkspaceSnapshot['indexes']['objectivesByItem'], unknown>>,
  Assert<Equal<KnowledgeWorkspaceSnapshot['indexes']['questionsByObjective'], unknown>>,
  Assert<Equal<KnowledgeWorkspaceSnapshot['indexes']['noteById'], unknown>>,
  Assert<Equal<typeof _localQuery, Service>>,
  Assert<Equal<typeof _postgresQuery, Service>>,
  Assert<Equal<typeof _mixedQuery, Service>>,
  Assert<Equal<typeof _mixedReverseQuery, Service>>,
  Assert<Equal<typeof _bridgeQuery, Service>>,
  Assert<Equal<typeof _broadQuery, Service>>,
  Assert<Equal<typeof _sync, typeof _async>>,
  Assert<Equal<typeof _sync, typeof _promiseLike>>,
  Assert<Equal<typeof _sync, typeof _optionalParameter>>,
  Assert<Equal<typeof _defaults, typeof _undefined>>,
  Assert<Equal<typeof _empty, typeof _nullReader>>,
  Assert<Equal<typeof _custom, Service>>,
  Assert<Equal<typeof _unknownInput, Promise<KnowledgeWorkspacePage>>>,
  Assert<Equal<typeof _defaultItems, typeof _defaultObjectives>>,
  Assert<Equal<IsAny<Page['items'][number]>, false>>,
  Assert<Equal<IsAny<Overview['recentItems']>, false>>
];
