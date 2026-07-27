import { createAppError } from '../errors/app-error.js';
import { scheduleFileCleanup } from './local-attachment-store-utils.js';

export function createLocalAttachmentDeletionManager({
  dataStore,
  fileManager,
  flush
}) {
  function removeAttachmentFiles(attachments) {
    attachments.forEach((attachment) => {
      try {
        fileManager.removeAttachmentFile(attachment.storagePath);
      } catch (error) {
        console.error(
          'removeAttachmentFile failed, scheduling cleanup retry:',
          error?.message
        );
        scheduleFileCleanup(
          fileManager.resolvePortableStoragePath(attachment.storagePath)
        );
      }
    });
  }

  function deleteAttachment(attachmentId) {
    const existingIndex = dataStore.state.attachments.findIndex(
      (attachment) => attachment.id === attachmentId
    );
    if (existingIndex === -1) {
      throw createAppError(
        'ATTACHMENT_NOT_FOUND',
        'Attachment not found',
        404
      );
    }

    const [attachment] = dataStore.state.attachments.splice(existingIndex, 1);
    try {
      flush();
    } catch (error) {
      dataStore.state.attachments.splice(existingIndex, 0, attachment);
      throw error;
    }
    removeAttachmentFiles([attachment]);
    return attachment;
  }

  function detachAttachmentsForNotes(noteIds) {
    const noteIdSet = new Set(noteIds);
    const detached = [];

    for (
      let index = dataStore.state.attachments.length - 1;
      index >= 0;
      index -= 1
    ) {
      if (!noteIdSet.has(dataStore.state.attachments[index].noteId)) {
        continue;
      }
      detached.push(...dataStore.state.attachments.splice(index, 1));
    }

    if (detached.length > 0) {
      flush();
    }
    return detached.reverse();
  }

  return {
    deleteAttachment,
    detachAttachmentsForNotes,
    removeDetachedAttachmentFiles: removeAttachmentFiles
  };
}
