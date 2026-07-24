import fs from 'node:fs';
import { createAppError } from '../errors/app-error.js';
import {
  cloneValue,
  sanitizeFileName,
  scheduleFileCleanup
} from './local-attachment-store-utils.js';

export function createLocalAttachmentSnapshotStore({
  dataStore,
  flush,
  fileManager,
  listAttachments
}) {
  function exportAttachmentsSnapshot() {
    return listAttachments().map((attachment) => {
      const readablePath = fileManager
        .resolveReadableAttachmentPath(attachment);
      if (!readablePath) {
        throw createAppError(
          'ATTACHMENT_FILE_MISSING',
          `Attachment file missing: ${attachment.id}`,
          404
        );
      }

      return {
        ...cloneValue(attachment),
        contentBase64: fs.readFileSync(readablePath).toString('base64')
      };
    });
  }

  function importAttachmentsSnapshot(items = []) {
    if (!Array.isArray(items)) {
      throw new Error('Attachment snapshot must be an array');
    }

    clearStoredAttachments();
    const restoredAttachments = items.map(restoreAttachmentSnapshotItem);
    dataStore.state.attachments.push(...restoredAttachments);
    flush();
    return restoredAttachments;
  }

  function clearStoredAttachments() {
    dataStore.state.attachments.forEach((attachment) => {
      try {
        fileManager.removeAttachmentFile(attachment.storagePath);
      } catch (error) {
        console.error(
          'import: removeAttachmentFile failed, scheduling cleanup retry:',
          error?.message
        );
        scheduleFileCleanup(
          fileManager.resolvePortableStoragePath(attachment.storagePath)
        );
      }
    });
    dataStore.state.attachments.splice(
      0,
      dataStore.state.attachments.length
    );
  }

  function restoreAttachmentSnapshotItem(item) {
    if (!item?.id || !item?.noteId || !item?.fileName || !item?.contentBase64) {
      throw new Error(
        'Attachment snapshot items must include id, noteId, fileName, and contentBase64'
      );
    }

    const safeName = sanitizeFileName(item.fileName);
    const storagePath = fileManager.buildStoragePath(item.id, safeName);
    const absoluteFilePath = fileManager.resolveManagedAbsolutePath(
      item.id,
      safeName
    );
    const buffer = Buffer.from(item.contentBase64, 'base64');
    fs.writeFileSync(absoluteFilePath, buffer);

    return {
      id: item.id,
      noteId: item.noteId,
      fileName: safeName,
      mimeType: item.mimeType || 'application/octet-stream',
      size: item.size ?? buffer.byteLength,
      storagePath,
      createdAt: item.createdAt || new Date().toISOString()
    };
  }

  return {
    exportAttachmentsSnapshot,
    importAttachmentsSnapshot
  };
}
