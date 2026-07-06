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

function toPortablePath(targetPath) {
  return String(targetPath ?? '')
    .replaceAll('\\', '/')
    .replace(/\/+/g, '/')
    .replace(/^\.\//, '')
    .trim();
}

function joinPortablePath(...segments) {
  return segments
    .map((segment) => toPortablePath(segment))
    .filter(Boolean)
    .join('/');
}

function looksWindowsAbsolute(targetPath) {
  return /^[A-Za-z]:[\\/]/.test(String(targetPath ?? ''));
}

function looksPosixAbsolute(targetPath) {
  return String(targetPath ?? '').startsWith('/');
}

function uniquePaths(paths) {
  return [...new Set(paths.filter(Boolean).map((value) => path.normalize(value)))];
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
  uploadsDir = path.join('storage', 'uploads'),
  storageRootDir = process.cwd(),
  legacyUploadsDirs = []
}) {
  ensureDirectory(uploadsDir);

  if (!dataStore) {
    throw new Error('Attachment store requires a data store');
  }

  function flush() {
    dataStore.flush();
  }

  const normalizedUploadsDir = path.resolve(uploadsDir);
  const normalizedStorageRootDir = path.resolve(storageRootDir);
  const portableUploadsDir = toPortablePath(path.relative(normalizedStorageRootDir, normalizedUploadsDir));
  const normalizedLegacyUploadsDirs = uniquePaths([
    ...legacyUploadsDirs,
    path.join(normalizedStorageRootDir, 'apps', 'api', 'storage', 'uploads')
  ]);

  function buildStorageFileName(id, safeName) {
    return `${id}-${safeName}`;
  }

  function buildPortableStoragePath(id, safeName) {
    return joinPortablePath(portableUploadsDir, buildStorageFileName(id, safeName));
  }

  function resolvePortableStoragePath(storagePath) {
    return path.resolve(normalizedStorageRootDir, ...toPortablePath(storagePath).split('/').filter(Boolean));
  }

  function buildStoragePath(id, safeName) {
    return buildPortableStoragePath(id, safeName);
  }

  function resolveManagedAbsolutePath(id, safeName) {
    return path.join(normalizedUploadsDir, buildStorageFileName(id, safeName));
  }

  function getAttachmentSafeName(attachment) {
    return sanitizeFileName(attachment?.fileName || 'attachment.bin');
  }

  function getAttachmentFileName(attachment) {
    const rawPath = toPortablePath(attachment?.storagePath);
    const basename = rawPath ? rawPath.split('/').pop() : '';
    return basename || buildStorageFileName(attachment.id, getAttachmentSafeName(attachment));
  }

  function getAttachmentCandidatePaths(attachment) {
    const basename = getAttachmentFileName(attachment);
    const storedPath = String(attachment?.storagePath ?? '');
    const portableStoredPath = toPortablePath(storedPath);
    const candidates = [
      path.join(normalizedUploadsDir, basename),
      ...normalizedLegacyUploadsDirs.map((directoryPath) => path.join(directoryPath, basename))
    ];

    if (portableStoredPath && !looksWindowsAbsolute(storedPath) && !looksPosixAbsolute(storedPath)) {
      candidates.push(resolvePortableStoragePath(portableStoredPath));
    } else if (portableStoredPath && looksPosixAbsolute(storedPath) && path.sep === '/') {
      candidates.push(path.normalize(portableStoredPath));
    } else if (storedPath && looksWindowsAbsolute(storedPath) && path.sep === '\\') {
      candidates.push(path.normalize(storedPath));
    } else if (storedPath && path.isAbsolute(storedPath)) {
      candidates.push(path.normalize(storedPath));
    }

    return uniquePaths(candidates);
  }

  function reconcileAttachmentRecord(attachment) {
    if (!attachment?.id) {
      return false;
    }

    const safeName = getAttachmentSafeName(attachment);
    const canonicalStoragePath = buildPortableStoragePath(attachment.id, safeName);
    const managedAbsolutePath = resolveManagedAbsolutePath(attachment.id, safeName);
    const candidatePaths = getAttachmentCandidatePaths(attachment);
    const existingPath = candidatePaths.find((candidatePath) => fs.existsSync(candidatePath));

    let changed = false;

    ensureDirectory(path.dirname(managedAbsolutePath));
    if (existingPath && path.normalize(existingPath) !== path.normalize(managedAbsolutePath)) {
      fs.copyFileSync(existingPath, managedAbsolutePath);
      changed = true;
    }

    if (attachment.storagePath !== canonicalStoragePath) {
      attachment.storagePath = canonicalStoragePath;
      changed = true;
    }

    if (fs.existsSync(managedAbsolutePath)) {
      const stats = fs.statSync(managedAbsolutePath);
      if (attachment.size !== stats.size) {
        attachment.size = stats.size;
        changed = true;
      }
    }

    return changed;
  }

  function reconcileStoredAttachments() {
    let changed = false;

    dataStore.state.attachments.forEach((attachment) => {
      if (reconcileAttachmentRecord(attachment)) {
        changed = true;
      }
    });

    if (changed) {
      flush();
    }
  }

  function resolveReadableAttachmentPath(attachment) {
    reconcileAttachmentRecord(attachment);
    const candidatePaths = getAttachmentCandidatePaths(attachment);
    return candidatePaths.find((candidatePath) => fs.existsSync(candidatePath)) ?? null;
  }

  function removeAttachmentFile(storagePath) {
    const candidatePaths = uniquePaths([
      storagePath ? resolvePortableStoragePath(storagePath) : '',
      storagePath
    ]);

    const existingPath = candidatePaths.find((candidatePath) => fs.existsSync(candidatePath));
    if (existingPath) {
      const stats = fs.statSync(existingPath);
      if (stats.isDirectory()) {
        fs.rmSync(existingPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
        return;
      }

      fs.rmSync(existingPath, { force: true, maxRetries: 5, retryDelay: 50 });
    }
  }

  reconcileStoredAttachments();

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
      const storagePath = buildStoragePath(id, safeName);
      const absoluteFilePath = resolveManagedAbsolutePath(id, safeName);
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

      const readablePath = resolveReadableAttachmentPath(attachment);
      if (!readablePath) {
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
        content: fs.readFileSync(readablePath)
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
        scheduleFileCleanup(resolvePortableStoragePath(attachment.storagePath));
      }
      flush();
      return attachment;
    },
    exportAttachmentsSnapshot() {
      return this.listAttachments().map((attachment) => {
        const readablePath = resolveReadableAttachmentPath(attachment);
        if (!readablePath) {
          const error = new Error(`Attachment file missing: ${attachment.id}`);
          error.statusCode = 404;
          error.code = 'ATTACHMENT_FILE_MISSING';
          throw error;
        }

        return {
          ...cloneValue(attachment),
          contentBase64: fs.readFileSync(readablePath).toString('base64')
        };
      });
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
        const storagePath = buildStoragePath(item.id, safeName);
        const absoluteFilePath = resolveManagedAbsolutePath(item.id, safeName);
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
      });

      dataStore.state.attachments.push(...restoredAttachments);
      flush();
      return restoredAttachments;
    }
  };
}
