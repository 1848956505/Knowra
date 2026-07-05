import fs from 'node:fs';
import path from 'node:path';

function ensureDirectory(directoryPath) {
  fs.mkdirSync(directoryPath, { recursive: true });
}

function sanitizeFileName(fileName) {
  return String(fileName ?? 'attachment.bin')
    .replace(/[^\w.\-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '') || 'attachment.bin';
}

function createAttachmentId() {
  return `attachment-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function scheduleFileCleanup(storagePath, remainingAttempts = 5) {
  if (!storagePath || remainingAttempts <= 0) {
    return;
  }

  setTimeout(() => {
    try {
      if (fs.existsSync(storagePath)) {
        fs.rmSync(storagePath, { force: true, maxRetries: 5, retryDelay: 50 });
      }
    } catch {
      scheduleFileCleanup(storagePath, remainingAttempts - 1);
    }
  }, 150);
}

export function createLocalAttachmentStore({
  dataStore,
  uploadsDir = path.join('storage', 'uploads')
}) {
  ensureDirectory(uploadsDir);

  if (!dataStore) {
    throw new Error('Attachment store requires a data store');
  }

  function flush() {
    dataStore.flush();
  }

  function buildStoragePath(id, safeName) {
    return path.join(uploadsDir, `${id}-${safeName}`);
  }

  function removeAttachmentFile(storagePath) {
    if (storagePath && fs.existsSync(storagePath)) {
      const stats = fs.statSync(storagePath);
      if (stats.isDirectory()) {
        fs.rmSync(storagePath, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
        return;
      }

      fs.rmSync(storagePath, { force: true, maxRetries: 5, retryDelay: 50 });
    }
  }

  return {
    uploadAttachment({ noteId, fileName, mimeType = 'application/octet-stream', contentBase64 }) {
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
      const filePath = buildStoragePath(id, safeName);
      fs.writeFileSync(filePath, buffer);

      const attachment = {
        id,
        noteId,
        fileName: safeName,
        mimeType,
        size: buffer.byteLength,
        storagePath: filePath,
        createdAt: new Date().toISOString()
      };

      dataStore.state.attachments.push(attachment);
      flush();
      return attachment;
    },
    listAttachments({ noteId } = {}) {
      return dataStore.state.attachments
        .filter((attachment) => (noteId ? attachment.noteId === noteId : true))
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
    },
    getAttachment(attachmentId) {
      return dataStore.state.attachments.find((attachment) => attachment.id === attachmentId) ?? null;
    },
    readAttachmentContent(attachmentId) {
      const attachment = this.getAttachment(attachmentId);

      if (!attachment) {
        const error = new Error('Attachment not found');
        error.statusCode = 404;
        error.code = 'ATTACHMENT_NOT_FOUND';
        throw error;
      }

      if (!fs.existsSync(attachment.storagePath)) {
        // Attachment record exists in the JSON store, but the file on disk is
        // missing. This happens when the JSON snapshot was restored without
        // the corresponding `storage/uploads/` files (e.g. partial restore
        // from an export). Returning a proper 404 distinguishes this from
        // a generic 400 and lets the front-end render a "missing" placeholder
        // instead of an opaque request-failed error.
        const error = new Error(`Attachment file missing: ${attachmentId}`);
        error.statusCode = 404;
        error.code = 'ATTACHMENT_FILE_MISSING';
        throw error;
      }

      return {
        attachment,
        content: fs.readFileSync(attachment.storagePath)
      };
    },
    deleteAttachment(attachmentId) {
      const existingIndex = dataStore.state.attachments.findIndex((attachment) => attachment.id === attachmentId);

      if (existingIndex === -1) {
        const error = new Error('Attachment not found');
        error.statusCode = 404;
        error.code = 'ATTACHMENT_NOT_FOUND';
        throw error;
      }

      const [attachment] = dataStore.state.attachments.splice(existingIndex, 1);
      try {
        removeAttachmentFile(attachment.storagePath);
      } catch {
        scheduleFileCleanup(attachment.storagePath);
      }
      flush();
      return attachment;
    },
    exportAttachmentsSnapshot() {
      return this.listAttachments().map((attachment) => ({
        ...cloneValue(attachment),
        contentBase64: fs.readFileSync(attachment.storagePath).toString('base64')
      }));
    },
    importAttachmentsSnapshot(items = []) {
      if (!Array.isArray(items)) {
        throw new Error('Attachment snapshot must be an array');
      }

      dataStore.state.attachments.forEach((attachment) => {
        try {
          removeAttachmentFile(attachment.storagePath);
        } catch {
          scheduleFileCleanup(attachment.storagePath);
        }
      });
      dataStore.state.attachments.splice(0, dataStore.state.attachments.length);

      const restoredAttachments = items.map((item) => {
        if (!item?.id || !item?.noteId || !item?.fileName || !item?.contentBase64) {
          throw new Error('Attachment snapshot items must include id, noteId, fileName, and contentBase64');
        }

        const safeName = sanitizeFileName(item.fileName);
        const filePath = buildStoragePath(item.id, safeName);
        const buffer = Buffer.from(item.contentBase64, 'base64');
        fs.writeFileSync(filePath, buffer);

        return {
          id: item.id,
          noteId: item.noteId,
          fileName: safeName,
          mimeType: item.mimeType || 'application/octet-stream',
          size: item.size ?? buffer.byteLength,
          storagePath: filePath,
          createdAt: item.createdAt || new Date().toISOString()
        };
      });

      dataStore.state.attachments.push(...restoredAttachments);
      flush();
      return restoredAttachments;
    }
  };
}
