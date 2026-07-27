import fs from 'node:fs';
import path from 'node:path';
import { createAppError } from '../errors/app-error.js';
import { createLocalAttachmentFileManager } from './local-attachment-file-manager.js';
import {
  createLocalAttachmentDeletionManager
} from './local-attachment-deletion.js';
import { createLocalAttachmentSnapshotStore } from './local-attachment-snapshot-store.js';
import {
  createAttachmentId,
  moveFileSafely,
  sanitizeFileName
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
      if (fileManager.reconcileAttachmentRecord(attachment)) {
        changed = true;
      }
    });

    if (changed) {
      flush();
    }
  }

  reconcileStoredAttachments();

  function uploadAttachment({
    noteId,
    fileName,
    mimeType = 'application/octet-stream',
    contentBase64
  }) {
    if (!noteId?.trim()) {
      throw new Error('Attachment noteId is required');
    }
    if (!fileName?.trim()) {
      throw new Error('Attachment fileName is required');
    }
    if (!contentBase64?.trim()) {
      throw new Error('Attachment contentBase64 is required');
    }

    const id = createAttachmentId();
    const safeName = sanitizeFileName(fileName);
    const buffer = Buffer.from(contentBase64, 'base64');
    const storagePath = fileManager.buildStoragePath(id, safeName);
    const absoluteFilePath = fileManager.resolveManagedAbsolutePath(
      id,
      safeName
    );
    fs.writeFileSync(absoluteFilePath, buffer);

    const attachment = {
      id,
      noteId,
      fileName: safeName,
      mimeType,
      size: buffer.byteLength,
      storagePath,
      createdAt: new Date().toISOString()
    };

    dataStore.state.attachments.push(attachment);
    try {
      flush();
    } catch (error) {
      dataStore.state.attachments.pop();
      try {
        fileManager.removeAttachmentFile(storagePath);
      } catch (cleanupError) {
        error.cleanupError = cleanupError;
      }
      throw error;
    }
    return attachment;
  }

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

    return {
      attachment,
      content: fs.readFileSync(readablePath)
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
    try {
      flush();
    } catch (error) {
      attachment.fileName = previousFileName;
      attachment.storagePath = previousStoragePath;
      attachment.size = previousSize;
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
    uploadAttachment,
    listAttachments,
    getAttachment,
    readAttachmentContent,
    renameAttachment,
    ...deletionManager,
    ...snapshotStore
  };
}
