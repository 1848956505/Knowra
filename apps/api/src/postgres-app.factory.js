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
import { createAsyncNoteDeletionCoordinator } from './modules/knowledge/application/postgres-async/note-deletion-coordinator.js';
import { withPostgresErrors } from './infrastructure/postgres-errors.js';
import { notFoundError } from './modules/knowledge/application/knowledge-errors.js';

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
  await ensureOwner(db, normalizedOwnerId);

  const repositories = {
    noteRepository: createPostgresNoteRepository({ db }),
    folderRepository: createPostgresFolderRepository({ db }),
    tagRepository: createPostgresTagRepository({ db }),
    knowledgeSpaceRepository: createPostgresKnowledgeSpaceRepository({ db }),
    contentAnnotationRepository: createPostgresContentAnnotationRepository({ db }),
    attachmentRepository: createPostgresAttachmentRepository({ db })
  };
  const knowledge = createPostgresKnowledgeModule(repositories);
  const attachmentStore = createPostgresAttachmentStore({
    attachmentRepository: repositories.attachmentRepository,
    uploadsDir,
    storageRootDir,
    legacyUploadsDirs,
    validateAttachmentNote: async (noteId) => {
      const note = await repositories.noteRepository.findById(noteId);
      if (!note || note.deleted) throw notFoundError('NOTE_NOT_FOUND', 'Note not found');
    }
  });
  const noteDeletionCoordinator = createAsyncNoteDeletionCoordinator({
    noteService: knowledge.noteService,
    noteRepository: repositories.noteRepository,
    attachmentStore
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
        storageRootDir
      }),
      knowledge: createPostgresKnowledgeHttpHandlers({
        knowledgeModule: knowledge,
        noteDeletionCoordinator,
        ownerId: normalizedOwnerId
      })
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
