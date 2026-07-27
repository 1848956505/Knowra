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
import { createKnowledgeBaseSnapshotService } from './modules/knowledge/application/knowledge-base-snapshot-service.js';
import { createNoteDeletionCoordinator } from './modules/knowledge/application/note-deletion-coordinator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, '..', '..', '..');

export function createAppContext(options = {}) {
  const dataStore = options.dataStore;
  const ownerId = resolveOwnerId(options.ownerId);
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
    enforceReferences: options.enforceReferences ?? true
  });
  const noteDeletionCoordinator = createNoteDeletionCoordinator({
    noteService: knowledge.noteService,
    noteRepository: knowledge.repositories.noteRepository,
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
  ownerId
} = {}) {
  const dataStore = createFileDataStore(dataFilePath);
  return createAppContext({ dataStore, uploadsDir, storageRootDir, ownerId });
}

export function resolveStoragePath(targetPath, storageRootDir = workspaceRoot) {
  if (path.isAbsolute(targetPath)) {
    return targetPath;
  }

  return path.resolve(storageRootDir, targetPath);
}

function resolveOwnerId(value) {
  const candidate = value ?? process.env.KNOWRA_OWNER_ID ?? 'demo';
  return String(candidate).trim() || 'demo';
}
