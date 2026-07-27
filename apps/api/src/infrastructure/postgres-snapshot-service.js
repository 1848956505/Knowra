import { createAppError } from '../errors/app-error.js';
import {
  validateLocalSnapshot,
  LOCAL_DATA_SCHEMA_VERSION,
  LOCAL_SNAPSHOT_VERSION
} from './local-data-schema.js';
import { validateAttachmentSnapshotItems } from './local-attachment-snapshot-validator.js';
import { stageAttachmentFiles, createAttachmentDirectorySwap } from './attachment-directory-swap.js';
import { assertNoInsecureImageUrls } from '../modules/knowledge/application/note-content-policy.js';
import { buildJsonMigrationPlan, applyJsonMigration } from './migration/json-to-postgres.js';

export function createPostgresSnapshotService({
  client,
  repositories,
  attachmentStore,
  storageRootDir = process.cwd()
} = {}) {
  if (!client?.$transaction) throw new TypeError('PostgreSQL snapshot service requires a Prisma client');
  if (!repositories?.noteRepository || !attachmentStore) throw new TypeError('PostgreSQL snapshot service dependencies are incomplete');

  return {
    exportKnowledgeBase,
    importKnowledgeBase,
    uploadAttachment: attachmentStore.uploadAttachment,
    updateAttachment: (params, body) => attachmentStore.renameAttachment(params.id, body?.fileName),
    listAttachments: (query) => attachmentStore.listAttachments(query),
    getAttachmentContent: (params) => attachmentStore.readAttachmentContent(params.id),
    deleteAttachment: (params) => attachmentStore.deleteAttachment(params.id)
  };

  async function exportKnowledgeBase() {
    const [spaces, folders, tags, notes, annotations, attachments, attachmentFiles] = await Promise.all([
      repositories.knowledgeSpaceRepository.list(),
      repositories.folderRepository.list(),
      repositories.tagRepository.list(),
      repositories.noteRepository.list({ includeDeleted: true }),
      repositories.contentAnnotationRepository.list({ includeDeleted: true }),
      attachmentStore.listAttachments(),
      attachmentStore.exportAttachmentsSnapshot()
    ]);
    return {
      exportedAt: new Date().toISOString(),
      version: LOCAL_SNAPSHOT_VERSION,
      schemaVersion: LOCAL_DATA_SCHEMA_VERSION,
      data: { spaces, folders, tags, notes, attachments, contentAnnotations: annotations },
      attachmentFiles
    };
  }

  async function importKnowledgeBase(body) {
    const prepared = validateLocalSnapshot(body);
    prepared.data.notes.forEach((note) => assertNoInsecureImageUrls(note.rawMarkdown));
    const transaction = prepareAttachmentSwap(body, prepared.data);
    try {
      transaction.commit();
      const state = {
        ...prepared.data,
        attachments: transaction.records
      };
      const migration = buildJsonMigrationPlan({
        input: { schemaVersion: LOCAL_DATA_SCHEMA_VERSION, data: state },
        storageRootDir,
        allowMissingAttachments: false
      });
      if (!migration.canApply) {
        throw createAppError('STORAGE_IMPORT_INVALID', 'PostgreSQL import preflight did not pass', 422, { report: migration.report });
      }
      await applyJsonMigration({
        client,
        plan: migration.plan,
        report: migration.report,
        requireEmptyTarget: false,
        replaceExisting: true
      });
      transaction.finalize();
    } catch (error) {
      rollbackImport(transaction, error);
      throw error;
    }
    return exportKnowledgeBase();
  }

  function prepareAttachmentSwap(body, data) {
    const items = body?.attachmentFiles ?? [];
    const preparedItems = validateAttachmentSnapshotItems(items, attachmentStore.fileManager, {
      expectedMetadata: data.attachments,
      noteIds: new Set(data.notes.map((note) => note.id))
    });
    const stagingDirectory = stageAttachmentFiles({
      uploadsDirectory: attachmentStore.fileManager.getManagedUploadsDirectory(),
      preparedItems
    });
    return createAttachmentDirectorySwap({
      uploadsDirectory: attachmentStore.fileManager.getManagedUploadsDirectory(),
      stagingDirectory,
      records: preparedItems.map(({ content, storageFileName, ...record }) => record)
    });
  }
}

function rollbackImport(transaction, originalError) {
  try {
    transaction?.rollback();
  } catch (rollbackError) {
    throw createAppError('STORAGE_IMPORT_ROLLBACK_FAILED', 'PostgreSQL import failed and attachment rollback was incomplete', 500, { cause: rollbackError ?? originalError });
  }
}
