import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { createAppError } from '../errors/app-error.js';
import { createLocalAttachmentFileManager } from './local-attachment-file-manager.js';
import { ATTACHMENT_STATUS } from './attachment-status.js';
import {
  createAttachmentId,
  moveFileSafely,
  sanitizeFileName,
  scheduleFileCleanup,
  sha256Buffer,
  writeFileAtomicallyAsync
} from './local-attachment-store-utils.js';

export function createPostgresAttachmentStore({
  attachmentRepository,
  uploadsDir = path.join('storage', 'uploads'),
  storageRootDir = process.cwd(),
  legacyUploadsDirs = [],
  validateAttachmentNote = null
} = {}) {
  if (!attachmentRepository) throw new TypeError('PostgreSQL attachment store requires a repository');
  const fileManager = createLocalAttachmentFileManager({
    uploadsDir,
    storageRootDir,
    legacyUploadsDirs
  });

  async function uploadAttachment({ noteId, fileName, mimeType = 'application/octet-stream', contentBase64 }) {
    if (!noteId?.trim()) throw new Error('Attachment noteId is required');
    await validateAttachmentNote?.(noteId);
    if (!fileName?.trim()) throw new Error('Attachment fileName is required');
    if (!contentBase64?.trim()) throw new Error('Attachment contentBase64 is required');
    const id = createAttachmentId();
    const safeName = sanitizeFileName(fileName);
    const buffer = Buffer.from(contentBase64, 'base64');
    const contentSha256 = sha256Buffer(buffer);
    const storagePath = fileManager.buildStoragePath(id, safeName);
    const absoluteFilePath = fileManager.resolveManagedAbsolutePath(id, safeName);
    const attachment = {
      id,
      noteId,
      fileName: safeName,
      mimeType,
      size: buffer.byteLength,
      sha256: contentSha256,
      status: ATTACHMENT_STATUS.PENDING,
      storagePath,
      verifiedAt: null,
      createdAt: new Date().toISOString()
    };

    await attachmentRepository.save(attachment);
    try {
      await writeFileAtomicallyAsync(absoluteFilePath, buffer);
    } catch (error) {
      attachment.status = ATTACHMENT_STATUS.FAILED;
      try {
        await attachmentRepository.save(attachment);
      } catch (statusError) {
        error.statusPersistError = statusError;
      }
      throw error;
    }

    attachment.status = ATTACHMENT_STATUS.READY;
    attachment.verifiedAt = new Date().toISOString();
    try {
      return await attachmentRepository.save(attachment);
    } catch (error) {
      attachment.status = ATTACHMENT_STATUS.PENDING;
      attachment.verifiedAt = null;
      let pendingRecordRestored = false;
      try {
        await attachmentRepository.save(attachment);
        pendingRecordRestored = true;
      } catch (statusError) {
        error.statusPersistError = statusError;
      }
      if (!pendingRecordRestored) {
        let currentRecord;
        try {
          currentRecord = await attachmentRepository.findById(attachment.id);
        } catch (lookupError) {
          error.recordLookupError = lookupError;
        }
        if (currentRecord === null) {
          await removeFileOrSchedule(attachment, fileManager, error);
        }
      }
      throw error;
    }
  }

  async function listAttachments(query = {}) {
    return attachmentRepository.list(query);
  }

  async function getAttachment(attachmentId) {
    return attachmentRepository.findById(attachmentId);
  }

  async function getRequiredAttachment(attachmentId) {
    const attachment = await getAttachment(attachmentId);
    if (!attachment) throw createAppError('ATTACHMENT_NOT_FOUND', 'Attachment not found', 404);
    return attachment;
  }

  async function readAttachmentContent(attachmentId) {
    const attachment = await getRequiredAttachment(attachmentId);
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
    if (!readablePath) throw createAppError('ATTACHMENT_FILE_MISSING', `Attachment file missing: ${attachmentId}`, 404);
    try {
      const content = await fsp.readFile(readablePath);
      if (
        attachment.sha256
        && sha256Buffer(content) !== attachment.sha256.toLowerCase()
      ) {
        const corrupt = createAppError(
          'ATTACHMENT_FILE_CORRUPT',
          `Attachment file failed integrity check: ${attachmentId}`,
          409
        );
        attachment.status = ATTACHMENT_STATUS.CORRUPT;
        attachment.verifiedAt = null;
        try {
          await attachmentRepository.save(attachment);
        } catch (statusError) {
          corrupt.statusPersistError = statusError;
        }
        throw corrupt;
      }
      return { attachment, content };
    } catch (error) {
      if (error.code === 'ENOENT') throw createAppError('ATTACHMENT_FILE_MISSING', `Attachment file missing: ${attachmentId}`, 404, { cause: error });
      throw error;
    }
  }

  async function renameAttachment(attachmentId, fileName) {
    const attachment = await getRequiredAttachment(attachmentId);
    if (!String(fileName ?? '').trim()) throw new Error('Attachment fileName is required');
    const nextSafeName = sanitizeFileName(fileName);
    const currentReadablePath = fileManager.resolveReadableAttachmentPath(attachment);
    const nextAbsolutePath = fileManager.resolveManagedAbsolutePath(attachment.id, nextSafeName);
    const nextStoragePath = fileManager.buildStoragePath(attachment.id, nextSafeName);
    const previous = { fileName: attachment.fileName, storagePath: attachment.storagePath, size: attachment.size };
    const fileMoved = Boolean(currentReadablePath && path.normalize(currentReadablePath) !== path.normalize(nextAbsolutePath));
    if (fileMoved) moveFileSafely(currentReadablePath, nextAbsolutePath);
    const updated = {
      ...attachment,
      fileName: nextSafeName,
      storagePath: nextStoragePath,
      size: fs.existsSync(nextAbsolutePath) ? fs.statSync(nextAbsolutePath).size : attachment.size
    };
    try {
      return await attachmentRepository.save(updated);
    } catch (error) {
      if (fileMoved && fs.existsSync(nextAbsolutePath) && currentReadablePath) {
        moveFileSafely(nextAbsolutePath, currentReadablePath);
      }
      Object.assign(attachment, previous);
      throw error;
    }
  }

  async function deleteAttachment(attachmentId) {
    const attachment = await getRequiredAttachment(attachmentId);
    const deleted = await attachmentRepository.delete(attachmentId);
    try {
      fileManager.removeAttachmentFile(deleted ?? attachment);
    } catch (error) {
      scheduleFileCleanup(
        fileManager.resolveManagedAttachmentPath(deleted ?? attachment)
      );
      error.attachmentId = attachmentId;
      throw error;
    }
    return deleted ?? attachment;
  }

  async function detachAttachmentsForNotes(noteIds) {
    return attachmentRepository.deleteByNoteIds(noteIds);
  }

  async function removeDetachedAttachmentFiles(attachments) {
    for (const attachment of attachments) {
      try {
        fileManager.removeAttachmentFile(attachment);
      } catch (error) {
        scheduleFileCleanup(
          fileManager.resolveManagedAttachmentPath(attachment)
        );
        throw createAppError('ATTACHMENT_FILE_CLEANUP_FAILED', 'Attachment metadata was deleted but file cleanup failed', 500, { cause: error });
      }
    }
  }

  async function exportAttachmentsSnapshot() {
    const attachments = await listAttachments();
    const result = [];
    for (const attachment of attachments) {
      const readablePath = fileManager.resolveReadableAttachmentPath(attachment);
      if (!readablePath) throw createAppError('ATTACHMENT_FILE_MISSING', `Attachment file missing: ${attachment.id}`, 404);
      result.push({ ...attachment, contentBase64: (await fsp.readFile(readablePath)).toString('base64') });
    }
    return result;
  }

  return {
    uploadAttachment,
    listAttachments,
    getAttachment,
    readAttachmentContent,
    renameAttachment,
    deleteAttachment,
    detachAttachmentsForNotes,
    removeDetachedAttachmentFiles,
    exportAttachmentsSnapshot,
    fileManager
  };
}

async function removeFileOrSchedule(attachment, fileManager, originalError) {
  try {
    fileManager.removeAttachmentFile(attachment);
  } catch (cleanupError) {
    scheduleFileCleanup(
      fileManager.resolveManagedAttachmentPath(attachment)
    );
    originalError.cleanupError = cleanupError;
  }
}
