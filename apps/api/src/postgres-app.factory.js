import path from 'node:path';
import { createPrismaRuntime } from './infrastructure/prisma-client.js';
import { createPostgresAttachmentStore } from './infrastructure/postgres-attachment-store.js';
import { createPostgresSnapshotService } from './infrastructure/postgres-snapshot-service.js';
import { createPostgresKnowledgeModule } from './modules/knowledge/postgres-async-module.js';
import { createPostgresKnowledgeHttpHandlers } from './modules/knowledge/http/postgres-async-handlers.js';
import { createPostgresNoteRepository } from './modules/knowledge/infrastructure/postgres/note-repository.js';
import { createPostgresFolderRepository } from './modules/knowledge/infrastructure/postgres/folder-repository.js';
import { createPostgresTagRepository } from './modules/knowledge/infrastructure/postgres/tag-repository.js';
import { createPostgresKnowledgeSpaceRepository } from './modules/knowledge/infrastructure/postgres/knowledge-space-repository.js';
import { createPostgresContentAnnotationRepository } from './modules/knowledge/infrastructure/postgres/content-annotation-repository.js';
import { createPostgresAttachmentRepository } from './modules/knowledge/infrastructure/postgres/attachment-repository.js';
import { createPostgresNoteVersionRepository } from './modules/knowledge/infrastructure/postgres/note-version-repository.js';
import { createPostgresKnowledgeItemRepository } from './modules/knowledge/infrastructure/postgres/knowledge-item-repository.js';
import { createPostgresKnowledgeEvidenceRepository } from './modules/knowledge/infrastructure/postgres/knowledge-evidence-repository.js';
import { createPostgresLearningObjectiveRepository } from './modules/knowledge/infrastructure/postgres/learning-objective-repository.js';
import { createPostgresExamProfileRepository } from './modules/knowledge/infrastructure/postgres/exam-profile-repository.js';
import { createPostgresExamFocusRepository } from './modules/knowledge/infrastructure/postgres/exam-focus-repository.js';
import { createPostgresQuestionRepository } from './modules/knowledge/infrastructure/postgres/question-repository.js';
import { createPostgresQuestionObjectiveRepository } from './modules/knowledge/infrastructure/postgres/question-objective-repository.js';
import { createPostgresQuestionSourceRepository } from './modules/knowledge/infrastructure/postgres/question-source-repository.js';
import { createAsyncNoteDeletionCoordinator } from './modules/knowledge/application/postgres-async/note-deletion-coordinator.js';
import { withPostgresErrors } from './infrastructure/postgres-errors.js';
import { notFoundError } from './modules/knowledge/application/knowledge-errors.js';
import { assertPostgresOwnerBoundary } from './infrastructure/owner-boundary.js';
import {
  createMaintenanceGate,
  wrapHandlersWithMaintenanceGate
} from './infrastructure/maintenance-gate.js';
import {
  createPostgresAdvisoryLock,
  wrapHandlersWithPostgresAdvisoryLock
} from './infrastructure/postgres-advisory-lock.js';

export async function createPostgresAppContext({
  databaseUrl = process.env.DATABASE_URL,
  client = null,
  storageRootDir = process.cwd(),
  uploadsDir = path.join(storageRootDir, process.env.STORAGE_UPLOADS_DIR || 'storage/uploads'),
  legacyUploadsDirs = [],
  ownerId = process.env.KNOWRA_OWNER_ID || 'demo'
} = {}) {
  const runtime = await createPrismaRuntime({ databaseUrl, client });
  await runtime.connect();
  const db = runtime.client;
  const normalizedOwnerId = String(ownerId).trim() || 'demo';
  try {
    await assertPostgresOwnerBoundary(db, normalizedOwnerId);
    await ensureOwner(db, normalizedOwnerId);
  } catch (error) {
    await runtime.disconnect();
    throw error;
  }
  const maintenanceGate = createMaintenanceGate();
  const advisoryLock = createPostgresAdvisoryLock(db);

  const repositories = {
    noteRepository: createPostgresNoteRepository({ db }),
    folderRepository: createPostgresFolderRepository({ db }),
    tagRepository: createPostgresTagRepository({ db }),
    knowledgeSpaceRepository: createPostgresKnowledgeSpaceRepository({ db }),
    contentAnnotationRepository: createPostgresContentAnnotationRepository({ db }),
    attachmentRepository: createPostgresAttachmentRepository({ db }),
    noteVersionRepository: createPostgresNoteVersionRepository({ db }),
    knowledgeItemRepository: createPostgresKnowledgeItemRepository({ db }),
    knowledgeEvidenceRepository: createPostgresKnowledgeEvidenceRepository({ db }),
    learningObjectiveRepository: createPostgresLearningObjectiveRepository({ db }),
    examProfileRepository: createPostgresExamProfileRepository({ db }),
    examFocusRepository: createPostgresExamFocusRepository({ db }),
    questionRepository: createPostgresQuestionRepository({ db }),
    questionObjectiveRepository: createPostgresQuestionObjectiveRepository({ db }),
    questionSourceRepository: createPostgresQuestionSourceRepository({ db })
  };
  const knowledge = createPostgresKnowledgeModule({ ...repositories, client: db });
  const attachmentStore = createPostgresAttachmentStore({
    attachmentRepository: repositories.attachmentRepository,
    uploadsDir,
    storageRootDir,
    legacyUploadsDirs,
    validateAttachmentNote: async (noteId) => {
      const note = await repositories.noteRepository.findById(noteId);
      if (!note || note.deleted) throw notFoundError('NOTE_NOT_FOUND', 'Note not found');
      const space = await repositories.knowledgeSpaceRepository.findById(note.spaceId);
      if (!space || space.userId !== normalizedOwnerId) {
        throw notFoundError('NOTE_NOT_FOUND', 'Note not found');
      }
    }
  });
  const noteDeletionCoordinator = createAsyncNoteDeletionCoordinator({
    noteService: knowledge.noteService,
    noteRepository: repositories.noteRepository,
    attachmentStore
  });

  const knowledgeHandlers = createPostgresKnowledgeHttpHandlers({
    knowledgeModule: knowledge,
    noteDeletionCoordinator,
    ownerId: normalizedOwnerId
  });

  return {
    driver: 'postgres',
    prisma: db,
    close: runtime.disconnect,
    modules: { knowledge },
    repositories,
    http: {
      storage: createPostgresSnapshotService({
        client: db,
        repositories,
        attachmentStore,
        storageRootDir,
        ownerId: normalizedOwnerId,
        maintenanceGate
      }),
      knowledge: wrapHandlersWithMaintenanceGate(
        wrapHandlersWithPostgresAdvisoryLock(
          knowledgeHandlers,
          advisoryLock
        ),
        maintenanceGate
      )
    }
  };
}

async function ensureOwner(db, ownerId) {
  await withPostgresErrors(() => db.user.upsert({
    where: { id: ownerId },
    create: {
      id: ownerId,
      email: null,
      passwordHash: null,
      nickname: null,
      status: 'active'
    },
    update: { status: 'active' }
  }));
}
