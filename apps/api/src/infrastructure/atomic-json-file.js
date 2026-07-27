import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const WINDOWS_REPLACE_ERROR_CODES = new Set([
  'EACCES',
  'EEXIST',
  'EPERM'
]);

export function writeJsonFileAtomically(
  filePath,
  value,
  {
    fileSystem = fs,
    createUniqueId = randomUUID
  } = {}
) {
  const directoryPath = path.dirname(filePath);
  const baseName = path.basename(filePath);
  const uniqueId = `${process.pid}-${createUniqueId()}`;
  const temporaryPath = path.join(
    directoryPath,
    `.${baseName}.${uniqueId}.tmp`
  );
  const backupPath = path.join(
    directoryPath,
    `.${baseName}.${uniqueId}.bak`
  );
  const content = JSON.stringify(value, null, 2);
  let preserveBackup = false;

  fileSystem.mkdirSync(directoryPath, { recursive: true });
  try {
    writeAndSyncTemporaryFile(fileSystem, temporaryPath, content);
    replaceTarget(fileSystem, temporaryPath, filePath, backupPath);
  } catch (error) {
    preserveBackup = Boolean(error?.restoreError);
    throw error;
  } finally {
    tryRemove(fileSystem, temporaryPath);
    if (!preserveBackup) {
      tryRemove(fileSystem, backupPath);
    }
  }
}

function writeAndSyncTemporaryFile(fileSystem, temporaryPath, content) {
  const descriptor = fileSystem.openSync(
    temporaryPath,
    'wx',
    0o600
  );

  try {
    fileSystem.writeFileSync(descriptor, content, 'utf8');
    fileSystem.fsyncSync(descriptor);
  } finally {
    fileSystem.closeSync(descriptor);
  }
}

function replaceTarget(fileSystem, temporaryPath, filePath, backupPath) {
  try {
    fileSystem.renameSync(temporaryPath, filePath);
    return;
  } catch (error) {
    if (
      !fileSystem.existsSync(filePath)
      || !WINDOWS_REPLACE_ERROR_CODES.has(error?.code)
    ) {
      throw error;
    }
  }

  fileSystem.renameSync(filePath, backupPath);
  try {
    fileSystem.renameSync(temporaryPath, filePath);
  } catch (error) {
    restoreBackup(fileSystem, backupPath, filePath, error);
    throw error;
  }
}

function restoreBackup(fileSystem, backupPath, filePath, originalError) {
  try {
    removeIfPresent(fileSystem, filePath);
    fileSystem.renameSync(backupPath, filePath);
  } catch (restoreError) {
    originalError.restoreError = restoreError;
  }
}

function removeIfPresent(fileSystem, targetPath) {
  if (!fileSystem.existsSync(targetPath)) {
    return;
  }

  fileSystem.rmSync(targetPath, {
    force: true,
    maxRetries: 5,
    retryDelay: 50
  });
}

function tryRemove(fileSystem, targetPath) {
  try {
    removeIfPresent(fileSystem, targetPath);
  } catch (error) {
    console.error(
      `Atomic JSON cleanup failed for ${path.basename(targetPath)}:`,
      error?.message
    );
  }
}
