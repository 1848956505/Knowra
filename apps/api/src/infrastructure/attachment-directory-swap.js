import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createAppError } from '../errors/app-error.js';

export function stageAttachmentFiles({
  uploadsDirectory,
  preparedItems
}) {
  const stagingDirectory = createStagingDirectory(uploadsDirectory);

  try {
    for (const item of preparedItems) {
      fs.writeFileSync(
        path.join(stagingDirectory, item.storageFileName),
        item.content
      );
    }
    return stagingDirectory;
  } catch (error) {
    cleanupDirectory(stagingDirectory);
    throw createAppError(
      'STORAGE_ATTACHMENT_STAGE_FAILED',
      'Failed to stage imported attachment files',
      500,
      { cause: error }
    );
  }
}

export function createAttachmentDirectorySwap({
  uploadsDirectory,
  stagingDirectory,
  records
}) {
  const backupDirectory = `${uploadsDirectory}.backup-${randomUUID()}`;
  let status = 'staged';

  return {
    records,
    commit() {
      if (status !== 'staged') {
        return;
      }
      try {
        fs.renameSync(uploadsDirectory, backupDirectory);
        fs.renameSync(stagingDirectory, uploadsDirectory);
        status = 'committed';
      } catch (error) {
        restoreAfterCommitFailure({
          uploadsDirectory,
          stagingDirectory,
          backupDirectory,
          error
        });
        status = 'failed';
        throw createAppError(
          'STORAGE_ATTACHMENT_COMMIT_FAILED',
          'Failed to replace attachment files',
          500,
          { cause: error }
        );
      }
    },
    rollback() {
      if (status === 'staged') {
        removeDirectory(stagingDirectory);
        status = 'rolled-back';
        return;
      }
      if (status !== 'committed') {
        return;
      }
      rollbackDirectorySwap(uploadsDirectory, backupDirectory);
      status = 'rolled-back';
    },
    finalize() {
      if (status === 'staged') {
        removeDirectory(stagingDirectory);
      } else if (status === 'committed') {
        cleanupBackup(backupDirectory);
      }
      status = 'finalized';
    }
  };
}

function createStagingDirectory(uploadsDirectory) {
  const parentDirectory = path.dirname(uploadsDirectory);
  const baseName = path.basename(uploadsDirectory);
  fs.mkdirSync(parentDirectory, { recursive: true });
  return fs.mkdtempSync(path.join(parentDirectory, `.${baseName}.import-`));
}

function restoreAfterCommitFailure({
  uploadsDirectory,
  stagingDirectory,
  backupDirectory,
  error
}) {
  if (fs.existsSync(backupDirectory) && !fs.existsSync(uploadsDirectory)) {
    try {
      fs.renameSync(backupDirectory, uploadsDirectory);
    } catch (restoreError) {
      error.restoreError = restoreError;
    }
  }
  cleanupDirectory(stagingDirectory);
}

function rollbackDirectorySwap(uploadsDirectory, backupDirectory) {
  const importedDirectory = `${uploadsDirectory}.failed-${randomUUID()}`;
  try {
    fs.renameSync(uploadsDirectory, importedDirectory);
    fs.renameSync(backupDirectory, uploadsDirectory);
  } catch (error) {
    restoreImportedDirectory(uploadsDirectory, importedDirectory);
    throw createAppError(
      'STORAGE_IMPORT_ROLLBACK_FAILED',
      'Failed to restore attachment files after import failure',
      500,
      { cause: error }
    );
  }
  cleanupDirectory(importedDirectory);
}

function restoreImportedDirectory(uploadsDirectory, importedDirectory) {
  if (!fs.existsSync(uploadsDirectory) && fs.existsSync(importedDirectory)) {
    fs.renameSync(importedDirectory, uploadsDirectory);
  }
}

function cleanupBackup(backupDirectory) {
  try {
    removeDirectory(backupDirectory);
  } catch (error) {
    console.error(
      'Attachment import backup cleanup failed:',
      error?.message
    );
  }
}

function removeDirectory(directoryPath) {
  if (!fs.existsSync(directoryPath)) {
    return;
  }
  fs.rmSync(directoryPath, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 50
  });
}

function cleanupDirectory(directoryPath) {
  try {
    removeDirectory(directoryPath);
  } catch (error) {
    console.error(
      `Attachment directory cleanup failed for ${path.basename(directoryPath)}:`,
      error?.message
    );
  }
}
