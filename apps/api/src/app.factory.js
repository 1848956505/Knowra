import { createKnowledgeModule } from './modules/knowledge/index.js';
import { createKnowledgeHttpHandlers } from './modules/knowledge/http/knowledge-handlers.js';
import { createFileDataStore } from './infrastructure/file-data-store.js';
import { createLocalAttachmentStore } from './infrastructure/local-attachment-store.js';
import { createInMemoryNoteRepository } from './modules/knowledge/infrastructure/note-repository.js';
import { createInMemoryFolderRepository } from './modules/knowledge/infrastructure/folder-repository.js';
import { createInMemoryTagRepository } from './modules/knowledge/infrastructure/tag-repository.js';
import { createInMemoryKnowledgeSpaceRepository } from './modules/knowledge/infrastructure/knowledge-space-repository.js';
import {
  createInMemoryKnowledgePointRepository,
  createInMemoryKnowledgePointSourceRepository,
  createInMemoryKnowledgePointTagRepository,
  createInMemoryNoteKnowledgePointRepository,
  createInMemoryTagGroupRepository
} from './modules/knowledge/infrastructure/knowledge-point-repository.js';

export function createAppContext(options = {}) {
  const dataStore = options.dataStore;
  const attachmentStore = options.attachmentStore ?? (dataStore
    ? createLocalAttachmentStore({
        dataStore,
        uploadsDir: options.uploadsDir ?? pathJoin('storage', 'uploads')
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
    knowledgePointRepository: options.knowledgePointRepository ?? (dataStore
      ? createInMemoryKnowledgePointRepository({
          records: dataStore.state.knowledgePoints,
          onChange: dataStore.flush
        })
      : undefined),
    knowledgePointSourceRepository: options.knowledgePointSourceRepository ?? (dataStore
      ? createInMemoryKnowledgePointSourceRepository({
          records: dataStore.state.knowledgePointSources,
          onChange: dataStore.flush
        })
      : undefined),
    tagGroupRepository: options.tagGroupRepository ?? (dataStore
      ? createInMemoryTagGroupRepository({
          records: dataStore.state.tagGroups,
          onChange: dataStore.flush
        })
      : undefined),
    knowledgePointTagRepository: options.knowledgePointTagRepository ?? (dataStore
      ? createInMemoryKnowledgePointTagRepository({
          records: dataStore.state.knowledgePointTags,
          onChange: dataStore.flush
        })
      : undefined),
    noteKnowledgePointRepository: options.noteKnowledgePointRepository ?? (dataStore
      ? createInMemoryNoteKnowledgePointRepository({
          records: dataStore.state.noteKnowledgePoints,
          onChange: dataStore.flush
        })
      : undefined)
  });

  return {
    dataStore,
    modules: {
      knowledge
    },
    http: {
      storage: createStorageHttpHandlers({ dataStore, attachmentStore }),
      knowledge: createKnowledgeHttpHandlers({
        knowledgeModule: knowledge
      })
    }
  };
}

export function createPersistentAppContext({
  dataFilePath = pathJoin('storage', 'data', 'knowledge-base.json'),
  uploadsDir = process.env.STORAGE_UPLOADS_DIR || pathJoin('storage', 'uploads')
} = {}) {
  const dataStore = createFileDataStore(dataFilePath);
  return createAppContext({ dataStore, uploadsDir });
}

function pathJoin(...segments) {
  return segments.join('/');
}

function createStorageHttpHandlers({ dataStore, attachmentStore }) {
  return {
    exportKnowledgeBase() {
      if (!dataStore) {
        return {
          exportedAt: new Date().toISOString(),
          version: 'v1-local-json',
          data: {
            spaces: [],
            folders: [],
            tags: [],
            notes: [],
            attachments: []
          }
        };
      }

      const snapshot = dataStore.exportSnapshot();
      return {
        ...snapshot,
        attachmentFiles: attachmentStore?.exportAttachmentsSnapshot?.() ?? []
      };
    },
    importKnowledgeBase(body) {
      if (!dataStore) {
        throw new Error('Persistent storage is not configured');
      }

      dataStore.importSnapshot(body);
      if (attachmentStore?.importAttachmentsSnapshot) {
        attachmentStore.importAttachmentsSnapshot(body?.attachmentFiles ?? []);
      }

      return {
        ...dataStore.exportSnapshot(),
        attachmentFiles: attachmentStore?.exportAttachmentsSnapshot?.() ?? []
      };
    },
    uploadAttachment(body) {
      if (!attachmentStore) {
        throw new Error('Attachment storage is not configured');
      }

      return attachmentStore.uploadAttachment(body);
    },
    listAttachments(query = {}) {
      if (!attachmentStore) {
        return [];
      }

      return attachmentStore.listAttachments(query);
    },
    getAttachmentContent(params) {
      if (!attachmentStore) {
        throw new Error('Attachment storage is not configured');
      }

      return attachmentStore.readAttachmentContent(params.id);
    },
    deleteAttachment(params) {
      if (!attachmentStore) {
        throw new Error('Attachment storage is not configured');
      }

      return attachmentStore.deleteAttachment(params.id);
    }
  };
}
