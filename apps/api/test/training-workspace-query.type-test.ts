import {
  createTrainingWorkspaceQuery as create,
  type TrainingWorkspaceSnapshot,
  type TrainingWorkspaceSnapshotReader,
  type TrainingWorkspaceQueryOptions,
  type TrainingWorkspacePage
} from '../src/modules/knowledge/application/training-workspace-query-service.ts';
import { createTrainingWorkspaceQuery as bridge } from '../src/modules/knowledge/application/training-workspace-query-service.js';
import { createWorkspaceSnapshotReader as createSnapshot } from '../src/modules/knowledge/application/workspace-query-snapshot.ts';
import { createWorkspaceSnapshotReader as createSnapshotBridge } from '../src/modules/knowledge/application/workspace-query-snapshot.js';
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
const _snapshotBridgeQuery = create({ snapshotReader: createSnapshotBridge({ repositories: _localRepositories }) });
declare const _broadSnapshotReader: ReturnType<typeof createSnapshot>;
const _broadQuery = create({ snapshotReader: _broadSnapshotReader });
declare const _snapshot: TrainingWorkspaceSnapshot;
declare const _thenable: PromiseLike<TrainingWorkspaceSnapshot>;
const _sync = create({ snapshotReader: { load: () => _snapshot } });
const _async = create({ snapshotReader: { load: async () => _snapshot } });
const _promiseLike = create({ snapshotReader: { load: () => _thenable } });
const _optionalParameter = create({ snapshotReader: { load: (_unused?: string) => _snapshot } });
const _defaults = create();
const _undefined = create(undefined);
const _empty = create({});
const _nullReader = create({ snapshotReader: null });
// 自定义集合的更窄 callback/键域无需转成泛型未知记录集合；也不保证执行成功。
const _custom = create({
  snapshotReader: {
    load: () => ({
      questions: { filter: (predicate: (record: { id: string }) => boolean) => predicate({ id: 'q' }) },
      profiles: new Set([17]),
      objectives: Symbol('objectives'),
      knowledgeItems: 1n,
      noteVersions: null,
      evidence: false,
      indexes: {
        focusByProfile: new Map<string, bigint>(),
        linksByQuestion: { get: (id: string) => id },
        sourcesByQuestion: 17,
        noteById: new Map<string, string>()
      }
    })
  }
});
const _unknownInput = _sync.listQuestions({ limit: 1n, query: Symbol(), includeArchived: { value: true } });
const _defaultQuestions = _sync.listQuestions();
const _defaultProfiles = _sync.listExamProfiles();

type Service = ReturnType<typeof create>;
type Overview = Awaited<ReturnType<Service['getTrainingOverview']>>;
type Page = Awaited<ReturnType<Service['listQuestions']>>;
type ProfilePage = Awaited<ReturnType<Service['listExamProfiles']>>;
export type TrainingWorkspaceContracts = [
  Assert<Equal<Parameters<typeof create>, [TrainingWorkspaceQueryOptions?]>>,
  Assert<Equal<Parameters<Service['listQuestions']>, [WorkspaceQueryInput?]>>,
  Assert<Equal<Parameters<Service['listExamProfiles']>, [WorkspaceQueryInput?]>>,
  Assert<Equal<Parameters<Service['getTrainingOverview']>, []>>,
  Assert<Equal<Parameters<TrainingWorkspaceSnapshotReader['load']>, []>>,
  Assert<
    Equal<
      ReturnType<TrainingWorkspaceSnapshotReader['load']>,
      TrainingWorkspaceSnapshot | PromiseLike<TrainingWorkspaceSnapshot>
    >
  >,
  Assert<Equal<Page, TrainingWorkspacePage>>,
  Assert<Equal<ProfilePage, TrainingWorkspacePage>>,
  Assert<Equal<Page['items'], unknown[]>>,
  Assert<Equal<ProfilePage['items'][number], unknown>>,
  Assert<Equal<Page['pagination']['limit'], number>>,
  Assert<Equal<Page['pagination']['sort'], string>>,
  Assert<Equal<Page['pagination']['total'], number>>,
  Assert<Equal<Page['pagination']['hasMore'], boolean>>,
  Assert<Equal<Page['pagination']['nextCursor'], string | null>>,
  Assert<Equal<Overview['generatedAt'], string>>,
  Assert<Equal<Overview['questions']['total'], unknown>>,
  Assert<Equal<Overview['questions']['byReviewStatus'], unknown>>,
  Assert<Equal<Overview['questions']['byQuestionType'], unknown>>,
  Assert<Equal<Overview['questions']['byDifficulty'], unknown>>,
  Assert<Equal<Overview['review']['pendingValidation'], unknown>>,
  Assert<Equal<Overview['review']['pendingConfirmation'], unknown>>,
  Assert<Equal<Overview['review']['staleSources'], unknown>>,
  Assert<Equal<Overview['review']['insufficientSources'], unknown>>,
  Assert<Equal<Overview['examProfiles']['total'], unknown>>,
  Assert<Equal<Overview['examProfiles']['updatedRecently'], unknown>>,
  Assert<Equal<Overview['recentQuestions'], unknown>>,
  Assert<Equal<TrainingWorkspaceSnapshot['questions'], unknown>>,
  Assert<Equal<TrainingWorkspaceSnapshot['profiles'], unknown>>,
  Assert<Equal<TrainingWorkspaceSnapshot['objectives'], unknown>>,
  Assert<Equal<TrainingWorkspaceSnapshot['knowledgeItems'], unknown>>,
  Assert<Equal<TrainingWorkspaceSnapshot['noteVersions'], unknown>>,
  Assert<Equal<TrainingWorkspaceSnapshot['evidence'], unknown>>,
  Assert<Equal<TrainingWorkspaceSnapshot['indexes']['focusByProfile'], unknown>>,
  Assert<Equal<TrainingWorkspaceSnapshot['indexes']['linksByQuestion'], unknown>>,
  Assert<Equal<TrainingWorkspaceSnapshot['indexes']['sourcesByQuestion'], unknown>>,
  Assert<Equal<TrainingWorkspaceSnapshot['indexes']['noteById'], unknown>>,
  Assert<Equal<typeof _localQuery, Service>>,
  Assert<Equal<typeof _postgresQuery, Service>>,
  Assert<Equal<typeof _mixedQuery, Service>>,
  Assert<Equal<typeof _mixedReverseQuery, Service>>,
  Assert<Equal<typeof _bridgeQuery, Service>>,
  Assert<Equal<typeof _snapshotBridgeQuery, Service>>,
  Assert<Equal<typeof _broadQuery, Service>>,
  Assert<Equal<typeof _sync, typeof _async>>,
  Assert<Equal<typeof _sync, typeof _promiseLike>>,
  Assert<Equal<typeof _sync, typeof _optionalParameter>>,
  Assert<Equal<typeof _defaults, typeof _undefined>>,
  Assert<Equal<typeof _empty, typeof _nullReader>>,
  Assert<Equal<typeof _custom, Service>>,
  Assert<Equal<typeof _unknownInput, Promise<TrainingWorkspacePage>>>,
  Assert<Equal<typeof _defaultQuestions, typeof _defaultProfiles>>,
  Assert<Equal<IsAny<Page['items'][number]>, false>>,
  Assert<Equal<IsAny<Overview['questions']['total']>, false>>,
  Assert<Equal<IsAny<Overview['questions']['byReviewStatus']>, false>>,
  Assert<Equal<IsAny<Overview['review']['staleSources']>, false>>,
  Assert<Equal<IsAny<Overview['examProfiles']['updatedRecently']>, false>>,
  Assert<Equal<IsAny<Overview['recentQuestions']>, false>>
];
