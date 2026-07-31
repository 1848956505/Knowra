import { ATTACHMENT_STATUS } from './attachment-status.js';
import {
  createAttachmentId,
  sanitizeFileName,
  sha256Buffer,
  writeFileAtomically
} from './local-attachment-store-utils.js';

export function createLocalAttachmentUpload({
  dataStore,
  fileManager,
  flush
}) {
  return function uploadAttachment({
    noteId,
    fileName,
    mimeType = 'application/octet-stream',
    contentBase64
  }) {
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
    const contentSha256 = sha256Buffer(buffer);
    const storagePath = fileManager.buildStoragePath(id, safeName);
    const absoluteFilePath = fileManager.resolveManagedAbsolutePath(
      id,
      safeName
    );
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

    dataStore.state.attachments.push(attachment);
    try {
      flush();
    } catch (error) {
      dataStore.state.attachments.pop();
      throw error;
    }

    try {
      writeFileAtomically(absoluteFilePath, buffer);
    } catch (error) {
      attachment.status = ATTACHMENT_STATUS.FAILED;
      persistStatusAfterFailure(attachment, flush, error);
      throw error;
    }

    attachment.status = ATTACHMENT_STATUS.READY;
    attachment.verifiedAt = new Date().toISOString();
    try {
      flush();
    } catch (error) {
      attachment.status = ATTACHMENT_STATUS.PENDING;
      attachment.verifiedAt = null;
      persistStatusAfterFailure(attachment, flush, error);
      throw error;
    }
    return attachment;
  };
}

function persistStatusAfterFailure(attachment, flush, originalError) {
  try {
    flush();
  } catch (statusError) {
    originalError.statusPersistError = statusError;
  }
  return attachment;
}
