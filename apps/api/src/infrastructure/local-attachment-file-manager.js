import fs from 'node:fs';
import path from 'node:path';
import {
  ensureDirectory,
  joinPortablePath,
  looksPosixAbsolute,
  looksWindowsAbsolute,
  sanitizeFileName,
  toPortablePath,
  uniquePaths
} from './local-attachment-store-utils.js';

export function createLocalAttachmentFileManager({
  uploadsDir,
  storageRootDir,
  legacyUploadsDirs = []
}) {
  ensureDirectory(uploadsDir);

  const normalizedUploadsDir = path.resolve(uploadsDir);
  const normalizedStorageRootDir = path.resolve(storageRootDir);
  const portableUploadsDir = toPortablePath(
    path.relative(normalizedStorageRootDir, normalizedUploadsDir)
  );
  const normalizedLegacyUploadsDirs = uniquePaths([
    ...legacyUploadsDirs,
    path.join(normalizedStorageRootDir, 'apps', 'api', 'storage', 'uploads')
  ]);

  function buildStorageFileName(id, safeName) {
    return `${id}-${safeName}`;
  }

  function buildStoragePath(id, safeName) {
    return joinPortablePath(
      portableUploadsDir,
      buildStorageFileName(id, safeName)
    );
  }

  function resolvePortableStoragePath(storagePath) {
    const segments = toPortablePath(storagePath).split('/').filter(Boolean);
    return path.resolve(normalizedStorageRootDir, ...segments);
  }

  function resolveManagedAbsolutePath(id, safeName) {
    return path.join(
      normalizedUploadsDir,
      buildStorageFileName(id, safeName)
    );
  }

  function getAttachmentSafeName(attachment) {
    return sanitizeFileName(attachment?.fileName || 'attachment.bin');
  }

  function getAttachmentFileName(attachment) {
    const rawPath = toPortablePath(attachment?.storagePath);
    const basename = rawPath ? rawPath.split('/').pop() : '';
    return basename || buildStorageFileName(
      attachment.id,
      getAttachmentSafeName(attachment)
    );
  }

  function getAttachmentCandidatePaths(attachment) {
    const basename = getAttachmentFileName(attachment);
    const storedPath = String(attachment?.storagePath ?? '');
    const portableStoredPath = toPortablePath(storedPath);
    const candidates = [
      path.join(normalizedUploadsDir, basename),
      ...normalizedLegacyUploadsDirs.map(
        (directoryPath) => path.join(directoryPath, basename)
      )
    ];

    if (
      portableStoredPath
      && !looksWindowsAbsolute(storedPath)
      && !looksPosixAbsolute(storedPath)
    ) {
      candidates.push(resolvePortableStoragePath(portableStoredPath));
    } else if (
      portableStoredPath
      && looksPosixAbsolute(storedPath)
      && path.sep === '/'
    ) {
      candidates.push(path.normalize(portableStoredPath));
    } else if (
      storedPath
      && looksWindowsAbsolute(storedPath)
      && path.sep === '\\'
    ) {
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
    const canonicalStoragePath = buildStoragePath(attachment.id, safeName);
    const managedAbsolutePath = resolveManagedAbsolutePath(
      attachment.id,
      safeName
    );
    const existingPath = getAttachmentCandidatePaths(attachment)
      .find((candidatePath) => fs.existsSync(candidatePath));
    let changed = false;

    ensureDirectory(path.dirname(managedAbsolutePath));
    if (
      existingPath
      && path.normalize(existingPath) !== path.normalize(managedAbsolutePath)
    ) {
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

  function resolveReadableAttachmentPath(attachment) {
    reconcileAttachmentRecord(attachment);
    return getAttachmentCandidatePaths(attachment)
      .find((candidatePath) => fs.existsSync(candidatePath)) ?? null;
  }

  function removeAttachmentFile(storagePath) {
    const candidatePaths = uniquePaths([
      storagePath ? resolvePortableStoragePath(storagePath) : '',
      storagePath
    ]);
    const existingPath = candidatePaths
      .find((candidatePath) => fs.existsSync(candidatePath));

    if (!existingPath) {
      return;
    }

    const stats = fs.statSync(existingPath);
    fs.rmSync(existingPath, {
      recursive: stats.isDirectory(),
      force: true,
      maxRetries: 5,
      retryDelay: 50
    });
  }

  return {
    buildStoragePath,
    reconcileAttachmentRecord,
    removeAttachmentFile,
    resolveManagedAbsolutePath,
    resolvePortableStoragePath,
    resolveReadableAttachmentPath
  };
}
