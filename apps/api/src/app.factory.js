import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createKnowledgeModule } from './modules/knowledge/index.js';
import { createKnowledgeHttpHandlers } from './modules/knowledge/http/knowledge-handlers.js';
import { createFileDataStore } from './infrastructure/file-data-store.js';
import { createLocalAttachmentStore } from './infrastructure/local-attachment-store.js';
import { createInMemoryNoteRepository } from './modules/knowledge/infrastructure/note-repository.js';
import { createInMemoryFolderRepository } from './modules/knowledge/infrastructure/folder-repository.js';
import { createInMemoryTagRepository } from './modules/knowledge/infrastructure/tag-repository.js';
import { createInMemoryKnowledgeSpaceRepository } from './modules/knowledge/infrastructure/knowledge-space-repository.js';
import { createInMemoryContentAnnotationRepository } from './modules/knowledge/infrastructure/content-annotation-repository.js';
import { createInMemoryNoteVersionRepository } from './modules/knowledge/infrastructure/note-version-repository.js';
import { createInMemoryKnowledgeItemRepository } from './modules/knowledge/infrastructure/knowledge-item-repository.js';
import { createInMemoryKnowledgeEvidenceRepository } from './modules/knowledge/infrastructure/knowledge-evidence-repository.js';
import { createInMemoryLearningObjectiveRepository } from './modules/knowledge/infrastructure/learning-objective-repository.js';
import { createInMemoryExamProfileRepository } from './modules/knowledge/infrastructure/exam-profile-repository.js';
import { createInMemoryExamFocusRepository } from './modules/knowledge/infrastructure/exam-focus-repository.js';
import { createInMemoryQuestionRepository } from './modules/knowledge/infrastructure/question-repository.js';
import { createInMemoryQuestionObjectiveRepository } from './modules/knowledge/infrastructure/question-objective-repository.js';
import { createInMemoryQuestionSourceRepository } from './modules/knowledge/infrastructure/question-source-repository.js';
import { createKnowledgeBaseSnapshotService } from './modules/knowledge/application/knowledge-base-snapshot-service.js';
import { createNoteDeletionCoordinator } from './modules/knowledge/application/note-deletion-coordinator.js';
import { createStorageConfig } from './config/storage.config.js';
import { createPostgresAppContext } from './postgres-app.factory.js';
import {
  assertSpacesOwnedBy,
  resolveSingleOwnerId
} from './infrastructure/owner-boundary.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, '..', '..', '..');

export function createAppContext(options = {}) {
  const dataStore = options.dataStore;
  ensureDataCollections(dataStore, [
    'noteVersions',
    'knowledgeItems',
    'knowledgeEvidence',
    'learningObjectives',
    'examProfiles',
    'examFocuses',
    'questions',
    'questionObjectives',
    'questionSources'
  ]);
  const ownerId = resolveOwnerId(options.ownerId, dataStore?.state?.spaces);
  const attachmentStore = options.attachmentStore ?? (dataStore
    ? createLocalAttachmentStore({
        dataStore,
        uploadsDir: options.uploadsDir ?? resolveStoragePath('storage/uploads'),
        storageRootDir: options.storageRootDir ?? workspaceRoot,
        legacyUploadsDirs: options.legacyUploadsDirs
      })
    : null);

  const knowledge = createKnowledgeModule({
    noteRepository: options.noteRepository ?? (dataStore
      ? createInMemoryNoteRepository({
          records: dataStore.state.notes,
          onChange: dataStore.flush
        })
      : undefined),
    folderRepository: options.folderRepository ?? (dataStore
      ? createInMemoryFolderRepository({
          records: dataStore.state.folders,
          onChange: dataStore.flush
        })
      : undefined),
    tagRepository: options.tagRepository ?? (dataStore
      ? createInMemoryTagRepository({
          records: dataStore.state.tags,
          onChange: dataStore.flush
        })
      : undefined),
    knowledgeSpaceRepository: options.knowledgeSpaceRepository ?? (dataStore
      ? createInMemoryKnowledgeSpaceRepository({
          records: dataStore.state.spaces,
          onChange: dataStore.flush
        })
      : undefined),
    contentAnnotationRepository: options.contentAnnotationRepository ?? (dataStore
      ? createInMemoryContentAnnotationRepository({
          records: dataStore.state.contentAnnotations,
          onChange: dataStore.flush
        })
      : undefined),
    noteVersionRepository: options.noteVersionRepository ?? (dataStore
      ? createInMemoryNoteVersionRepository({ records: dataStore.state.noteVersions, onChange: dataStore.flush })
      : undefined),
    knowledgeItemRepository: options.knowledgeItemRepository ?? (dataStore
      ? createInMemoryKnowledgeItemRepository({ records: dataStore.state.knowledgeItems, onChange: dataStore.flush })
      : undefined),
    knowledgeEvidenceRepository: options.knowledgeEvidenceRepository ?? (dataStore
      ? createInMemoryKnowledgeEvidenceRepository({ records: dataStore.state.knowledgeEvidence, onChange: dataStore.flush })
      : undefined),
    learningObjectiveRepository: options.learningObjectiveRepository ?? (dataStore
      ? createInMemoryLearningObjectiveRepository({ records: dataStore.state.learningObjectives, onChange: dataStore.flush })
      : undefined),
    examProfileRepository: options.examProfileRepository ?? (dataStore
      ? createInMemoryExamProfileRepository({ records: dataStore.state.examProfiles, onChange: dataStore.flush })
      : undefined),
    examFocusRepository: options.examFocusRepository ?? (dataStore
      ? createInMemoryExamFocusRepository({ records: dataStore.state.examFocuses, onChange: dataStore.flush })
      : undefined),
    questionRepository: options.questionRepository ?? (dataStore
      ? createInMemoryQuestionRepository({ records: dataStore.state.questions, onChange: dataStore.flush })
      : undefined),
    questionObjectiveRepository: options.questionObjectiveRepository ?? (dataStore
      ? createInMemoryQuestionObjectiveRepository({ records: dataStore.state.questionObjectives, onChange: dataStore.flush })
      : undefined),
    questionSourceRepository: options.questionSourceRepository ?? (dataStore
      ? createInMemoryQuestionSourceRepository({ records: dataStore.state.questionSources, onChange: dataStore.flush })
      : undefined),
    runTransaction: dataStore?.runTransaction
      ? (operation) => dataStore.runTransaction(operation)
      : undefined,
    enforceReferences: options.enforceReferences ?? true
  });
  const noteDeletionCoordinator = createNoteDeletionCoordinator({
    noteService: knowledge.noteService,
    noteRepository: knowledge.repositories.noteRepository,
    noteVersionRepository: knowledge.repositories.noteVersionRepository,
    contentAnnotationRepository:
      knowledge.repositories.contentAnnotationRepository,
    attachmentStore,
    runTransaction: dataStore?.runTransaction
      ? (operation) => dataStore.runTransaction(operation)
      : undefined
  });

  return {
    dataStore,
    modules: {
      knowledge
    },
    http: {
      storage: createKnowledgeBaseSnapshotService({
        dataStore,
        attachmentStore,
        ownerId,
        validateAttachmentNote: dataStore
          ? (noteId) => knowledge.noteService.getNote(noteId)
          : null
      }),
      knowledge: createKnowledgeHttpHandlers({
        knowledgeModule: knowledge,
        noteDeletionCoordinator,
        ownerId
      })
    }
  };
}

export function createPersistentAppContext({
  storageRootDir = workspaceRoot,
  dataFilePath = resolveStoragePath('storage/data/knowledge-base.json', storageRootDir),
  uploadsDir = resolveStoragePath(process.env.STORAGE_UPLOADS_DIR || 'storage/uploads', storageRootDir),
  persistenceDriver = createStorageConfig(process.env).persistenceDriver,
  databaseUrl = createStorageConfig(process.env).databaseUrl,
  client = null,
  ownerId
} = {}) {
  if (persistenceDriver === 'postgres') {
    return createPostgresAppContext({
      databaseUrl,
      client,
      storageRootDir,
      uploadsDir,
      ownerId
    });
  }
  const dataStore = createFileDataStore(dataFilePath);
  return createAppContext({ dataStore, uploadsDir, storageRootDir, ownerId });
}

export function resolveStoragePath(targetPath, storageRootDir = workspaceRoot) {
  if (path.isAbsolute(targetPath)) {
    return targetPath;
  }

  return path.resolve(storageRootDir, targetPath);
}

function resolveOwnerId(value, spaces = []) {
  const configuredOwnerId = value ?? process.env.KNOWRA_OWNER_ID;
  const ownerId = resolveSingleOwnerId({
    configuredOwnerId,
    spaces,
    fallbackOwnerId: 'demo'
  });
  assertSpacesOwnedBy(spaces, ownerId);
  return ownerId;
}

function ensureDataCollections(dataStore, collectionNames) {
  if (!dataStore?.state) return;
  for (const collectionName of collectionNames) {
    if (!Array.isArray(dataStore.state[collectionName])) {
      dataStore.state[collectionName] = [];
    }
  }
}

export { createPostgresAppContext };
