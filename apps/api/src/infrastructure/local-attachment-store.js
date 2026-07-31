import fs from 'node:fs';
import path from 'node:path';
import { createAppError } from '../errors/app-error.js';
import { createLocalAttachmentFileManager } from './local-attachment-file-manager.js';
import {
  createLocalAttachmentDeletionManager
} from './local-attachment-deletion.js';
import { createLocalAttachmentSnapshotStore } from './local-attachment-snapshot-store.js';
import { ATTACHMENT_STATUS } from './attachment-status.js';
import { reconcileAttachmentIntegrity } from './attachment-record-reconciliation.js';
import { createLocalAttachmentUpload } from './local-attachment-upload.js';
import {
  moveFileSafely,
  sanitizeFileName,
  sha256Buffer
} from './local-attachment-store-utils.js';

export function createLocalAttachmentStore({
  dataStore,
  uploadsDir = path.join('storage', 'uploads'),
  storageRootDir = process.cwd(),
  legacyUploadsDirs = []
}) {
  if (!dataStore) {
    throw new Error('Attachment store requires a data store');
  }

  const fileManager = createLocalAttachmentFileManager({
    uploadsDir,
    storageRootDir,
    legacyUploadsDirs
  });

  function flush() {
    dataStore.flush();
  }

  function reconcileStoredAttachments() {
    let changed = false;

    dataStore.state.attachments.forEach((attachment) => {
      const recordReconciled = fileManager.reconcileAttachmentRecord(attachment);
      const readablePath = fileManager.getAttachmentCandidatePaths(attachment)
        .find((candidatePath) => fs.existsSync(candidatePath));
      const integrityReconciled = reconcileAttachmentIntegrity(
        attachment,
        readablePath
      );
      if (recordReconciled || integrityReconciled) {
        changed = true;
      }
    });

    if (changed) {
      flush();
    }
  }

  reconcileStoredAttachments();

  function listAttachments({ noteId } = {}) {
    return dataStore.state.attachments
      .filter((attachment) => (
        noteId ? attachment.noteId === noteId : true
      ))
      .sort((left, right) => (
        new Date(right.createdAt).getTime()
        - new Date(left.createdAt).getTime()
      ));
  }

  function getAttachment(attachmentId) {
    return dataStore.state.attachments
      .find((attachment) => attachment.id === attachmentId) ?? null;
  }

  function readAttachmentContent(attachmentId) {
    const attachment = getAttachment(attachmentId);

    if (!attachment) {
      throw createAppError(
        'ATTACHMENT_NOT_FOUND',
        'Attachment not found',
        404
      );
    }

    if (attachment.status === ATTACHMENT_STATUS.CORRUPT) {
      throw createAppError(
        'ATTACHMENT_FILE_CORRUPT',
        `Attachment file failed integrity check: ${attachmentId}`,
        409
      );
    }
    if (
      attachment.status === ATTACHMENT_STATUS.PENDING
      || attachment.status === ATTACHMENT_STATUS.FAILED
    ) {
      throw createAppError(
        'ATTACHMENT_NOT_READY',
        `Attachment is not ready: ${attachmentId}`,
        409
      );
    }

    const readablePath = fileManager.resolveReadableAttachmentPath(attachment);
    if (!readablePath) {
      // Attachment record exists in the JSON store, but the file on disk is
      // missing. This happens when the JSON snapshot was restored without
      // the corresponding `storage/uploads/` files.
      throw createAppError(
        'ATTACHMENT_FILE_MISSING',
        `Attachment file missing: ${attachmentId}`,
        404
      );
    }

    const content = fs.readFileSync(readablePath);
    if (
      attachment.sha256
      && sha256Buffer(content) !== attachment.sha256.toLowerCase()
    ) {
      attachment.status = ATTACHMENT_STATUS.CORRUPT;
      attachment.verifiedAt = null;
      const corrupt = createAppError(
        'ATTACHMENT_FILE_CORRUPT',
        `Attachment file failed integrity check: ${attachmentId}`,
        409
      );
      try {
        flush();
      } catch (statusError) {
        corrupt.statusPersistError = statusError;
      }
      throw corrupt;
    }

    return {
      attachment,
      content
    };
  }

  function renameAttachment(attachmentId, fileName) {
    const attachment = getAttachment(attachmentId);
    if (!attachment) {
      throw createAppError(
        'ATTACHMENT_NOT_FOUND',
        'Attachment not found',
        404
      );
    }

    if (!String(fileName ?? '').trim()) {
      throw new Error('Attachment fileName is required');
    }

    const nextSafeName = sanitizeFileName(fileName);
    const currentReadablePath = fileManager
      .resolveReadableAttachmentPath(attachment);
    const nextAbsolutePath = fileManager.resolveManagedAbsolutePath(
      attachment.id,
      nextSafeName
    );
    const nextStoragePath = fileManager.buildStoragePath(
      attachment.id,
      nextSafeName
    );
    const previousFileName = attachment.fileName;
    const previousStoragePath = attachment.storagePath;
    const previousSize = attachment.size;
    const previousSha256 = attachment.sha256 ?? null;
    const previousStatus = attachment.status ?? ATTACHMENT_STATUS.READY;
    const previousVerifiedAt = attachment.verifiedAt ?? null;
    const fileMoved = Boolean(
      currentReadablePath
      && path.normalize(currentReadablePath) !== path.normalize(nextAbsolutePath)
    );

    if (fileMoved) {
      moveFileSafely(currentReadablePath, nextAbsolutePath);
    }

    attachment.fileName = nextSafeName;
    attachment.storagePath = nextStoragePath;
    if (fs.existsSync(nextAbsolutePath)) {
      attachment.size = fs.statSync(nextAbsolutePath).size;
    }
    reconcileAttachmentIntegrity(attachment, nextAbsolutePath);
    try {
      flush();
    } catch (error) {
      attachment.fileName = previousFileName;
      attachment.storagePath = previousStoragePath;
      attachment.size = previousSize;
      attachment.sha256 = previousSha256;
      attachment.status = previousStatus;
      attachment.verifiedAt = previousVerifiedAt;
      if (fileMoved && fs.existsSync(nextAbsolutePath)) {
        try {
          moveFileSafely(nextAbsolutePath, currentReadablePath);
        } catch (rollbackError) {
          error.rollbackError = rollbackError;
        }
      }
      throw error;
    }
    return attachment;
  }

  const snapshotStore = createLocalAttachmentSnapshotStore({
    dataStore,
    flush,
    fileManager,
    listAttachments
  });
  const deletionManager = createLocalAttachmentDeletionManager({
    dataStore,
    fileManager,
    flush
  });

  return {
    uploadAttachment: createLocalAttachmentUpload({
      dataStore,
      fileManager,
      flush
    }),
    listAttachments,
    getAttachment,
    readAttachmentContent,
    renameAttachment,
    ...deletionManager,
    ...snapshotStore
  };
}
