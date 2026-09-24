import { createAppError } from '../errors/app-error.js';
import { inspectAttachmentDeletion } from './attachment-deletion-preflight.js';

export function createLocalAttachmentDeletionManager({
  dataStore,
  fileManager,
  flush,
  cleanupQueue
}) {
  function removeAttachmentFiles(attachments) {
    return attachments.map(attachment => ({ id: attachment.id, cleanup: cleanupQueue.finish(attachment) }));
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

    const preflight = inspectAttachmentDeletion(attachmentId, dataStore.state);
    if (preflight.references.length) {
      throw createAppError(
        'ATTACHMENT_REFERENCED',
        '保留的资产仍引用此附件，不能删除。',
        409
      );
    }

    const attachment = dataStore.state.attachments[existingIndex];
    cleanupQueue.enqueue(attachment);
    dataStore.state.attachments.splice(existingIndex, 1);
    try {
      flush();
    } catch (error) {
      dataStore.state.attachments.splice(existingIndex, 0, attachment);
      throw error;
    }
    const [result] = removeAttachmentFiles([attachment]);
    return { ...attachment, cleanup: result.cleanup };
  }

  function detachAttachmentsForNotes(noteIds) {
    const noteIdSet = new Set(noteIds);
    const detached = [];

    for (const attachment of dataStore.state.attachments) {
      if (!noteIdSet.has(attachment.noteId)) continue;
      if (inspectAttachmentDeletion(attachment.id, dataStore.state).references.length) {
        throw createAppError('ATTACHMENT_REFERENCED', '保留的资产仍引用此附件，不能删除。', 409);
      }
    }

    for (const attachment of dataStore.state.attachments.filter(item => noteIdSet.has(item.noteId))) {
      cleanupQueue.enqueue(attachment);
    }
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
    inspectAttachmentDeletion: (attachmentId) => {
      if (!dataStore.state.attachments.some((item) => item.id === attachmentId)) {
        throw createAppError('ATTACHMENT_NOT_FOUND', 'Attachment not found', 404);
      }
      return inspectAttachmentDeletion(attachmentId, dataStore.state);
    },
    detachAttachmentsForNotes,
    removeDetachedAttachmentFiles: removeAttachmentFiles
  };
}
