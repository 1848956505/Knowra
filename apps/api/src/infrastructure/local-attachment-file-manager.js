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
  ]).map((directoryPath) => path.resolve(directoryPath));

  function buildStorageFileName(id, safeName) {
    const normalizedId = normalizeAttachmentId(id);
    return `${normalizedId}-${sanitizeFileName(safeName)}`;
  }

  function buildStoragePath(id, safeName) {
    return joinPortablePath(
      portableUploadsDir,
      buildStorageFileName(id, safeName)
    );
  }

  function resolvePortableStoragePath(storagePath) {
    if (
      !storagePath
      || looksWindowsAbsolute(storagePath)
      || looksPosixAbsolute(storagePath)
      || path.isAbsolute(storagePath)
    ) {
      return null;
    }

    const segments = toPortablePath(storagePath).split('/').filter(Boolean);
    const resolvedPath = path.resolve(normalizedStorageRootDir, ...segments);
    return isPathWithin(normalizedUploadsDir, resolvedPath)
      ? resolvedPath
      : null;
  }

  function resolveManagedAbsolutePath(id, safeName) {
    const managedPath = resolveManagedChildPath(
      buildStorageFileName(id, safeName)
    );
    assertSafeManagedDestination(managedPath);
    return managedPath;
  }

  function resolveManagedAttachmentPath(attachment) {
    const fileName = getAttachmentFileName(attachment);
    return fileName ? resolveManagedChildPath(fileName) : null;
  }

  function getAttachmentSafeName(attachment) {
    return sanitizeFileName(attachment?.fileName || 'attachment.bin');
  }

  function getAttachmentFileName(attachment) {
    try {
      return buildStorageFileName(
        attachment?.id,
        getAttachmentSafeName(attachment)
      );
    } catch {
      return '';
    }
  }

  function getAttachmentCandidatePaths(attachment) {
    const managedPath = resolveManagedAttachmentPath(attachment);
    if (!managedPath || (
      fs.existsSync(managedPath)
      && !isSafeRegularFile(managedPath, normalizedUploadsDir)
    )) {
      return [];
    }
    return [managedPath];
  }

  function reconcileAttachmentRecord(attachment) {
    const attachmentFileName = getAttachmentFileName(attachment);
    if (!attachmentFileName) {
      return false;
    }

    const safeName = getAttachmentSafeName(attachment);
    const canonicalStoragePath = buildStoragePath(attachment.id, safeName);
    const managedAbsolutePath = resolveManagedChildPath(attachmentFileName);
    const managedFileExists = isSafeRegularFile(
      managedAbsolutePath,
      normalizedUploadsDir
    );
    const legacyPath = managedFileExists
      ? null
      : findLegacyAttachmentPath(attachmentFileName);
    let changed = false;

    ensureDirectory(path.dirname(managedAbsolutePath));
    if (
      legacyPath
      && copyLegacyFileIntoManaged(legacyPath, managedAbsolutePath)
    ) {
      changed = true;
    }

    if (attachment.storagePath !== canonicalStoragePath) {
      attachment.storagePath = canonicalStoragePath;
      changed = true;
    }

    if (isSafeRegularFile(managedAbsolutePath, normalizedUploadsDir)) {
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
    const managedPath = resolveManagedAttachmentPath(attachment);
    return managedPath
      && isSafeRegularFile(managedPath, normalizedUploadsDir)
      ? managedPath
      : null;
  }

  function removeAttachmentFile(attachment) {
    const managedPath = resolveManagedAttachmentPath(attachment);
    if (!managedPath) {
      return false;
    }

    let stats;
    try {
      stats = fs.lstatSync(managedPath);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return false;
      }
      throw error;
    }

    if (stats.isSymbolicLink()) {
      fs.unlinkSync(managedPath);
      return true;
    }
    if (
      !stats.isFile()
      || !isSafeRegularFile(managedPath, normalizedUploadsDir)
    ) {
      return false;
    }

    fs.rmSync(managedPath, {
      force: true,
      maxRetries: 5,
      retryDelay: 50
    });
    return true;
  }

  function resolveManagedChildPath(fileName) {
    const targetPath = path.resolve(normalizedUploadsDir, fileName);
    if (
      !isPathWithin(normalizedUploadsDir, targetPath)
      || path.dirname(targetPath) !== normalizedUploadsDir
    ) {
      throw new Error('Attachment path must stay inside the managed uploads directory');
    }
    return targetPath;
  }

  function findLegacyAttachmentPath(fileName) {
    for (const legacyUploadsDir of normalizedLegacyUploadsDirs) {
      const candidatePath = path.resolve(legacyUploadsDir, fileName);
      if (
        path.dirname(candidatePath) === legacyUploadsDir
        && isSafeRegularFile(candidatePath, legacyUploadsDir)
      ) {
        return candidatePath;
      }
    }
    return null;
  }

  function copyLegacyFileIntoManaged(sourcePath, targetPath) {
    if (
      !isSafeRegularFile(
        sourcePath,
        path.dirname(sourcePath)
      )
    ) {
      return false;
    }

    try {
      fs.copyFileSync(sourcePath, targetPath, fs.constants.COPYFILE_EXCL);
      return true;
    } catch (error) {
      if (
        error.code === 'EEXIST'
        && isSafeRegularFile(targetPath, normalizedUploadsDir)
      ) {
        return false;
      }
      if (error.code === 'EEXIST') {
        return false;
      }
      throw error;
    }
  }

  function assertSafeManagedDestination(targetPath) {
    if (!fs.existsSync(targetPath)) {
      return;
    }
    if (!isSafeRegularFile(targetPath, normalizedUploadsDir)) {
      throw new Error('Attachment destination is not a safe managed file');
    }
  }

  return {
    buildStoragePath,
    getAttachmentCandidatePaths,
    getAttachmentFileName,
    getManagedUploadsDirectory() {
      return normalizedUploadsDir;
    },
    reconcileAttachmentRecord,
    removeAttachmentFile,
    resolveManagedAttachmentPath,
    resolveManagedAbsolutePath,
    resolvePortableStoragePath,
    resolveReadableAttachmentPath
  };
}

function normalizeAttachmentId(id) {
  const rawId = String(id ?? '');
  const normalizedId = rawId.trim();
  if (
    !normalizedId
    || rawId !== normalizedId
    || normalizedId === '.'
    || normalizedId === '..'
    || /[/\\\0]/.test(normalizedId)
  ) {
    throw new Error('Attachment id must be a safe path segment');
  }
  return normalizedId;
}

function isPathWithin(rootPath, targetPath) {
  const relativePath = path.relative(
    path.resolve(rootPath),
    path.resolve(targetPath)
  );
  return relativePath === ''
    || (
      relativePath !== '..'
      && !relativePath.startsWith(`..${path.sep}`)
      && !path.isAbsolute(relativePath)
    );
}

function isSafeRegularFile(filePath, rootPath) {
  if (!isPathWithin(rootPath, filePath)) {
    return false;
  }

  let stats;
  try {
    stats = fs.lstatSync(filePath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
  if (stats.isSymbolicLink() || !stats.isFile()) {
    return false;
  }

  try {
    const realRootPath = fs.realpathSync(rootPath);
    const realFilePath = fs.realpathSync(filePath);
    return isPathWithin(realRootPath, realFilePath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}
