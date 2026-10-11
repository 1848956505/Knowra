import type { Attachment, AttachmentDeleteResult, AttachmentDeletionPreflight, AttachmentCleanupStatus } from '../workspace/types.js';
import type { RequestJson } from './client.js';
import { asArray, getData } from './response.js';

export interface UploadAttachmentInput {
  noteId: string;
  fileName: string;
  mimeType: string;
  contentBase64: string;
}

export interface AttachmentApi {
  listNoteAttachments(noteId: string): Promise<Attachment[]>;
  uploadNoteAttachment(input: UploadAttachmentInput): Promise<Attachment>;
  renameNoteAttachment(attachmentId: string, fileName: string): Promise<Attachment>;
  deleteNoteAttachment(attachmentId: string): Promise<AttachmentDeleteResult>;
  inspectAttachmentDeletion(attachmentId: string): Promise<AttachmentDeletionPreflight>;
  verifyNoteAttachment(attachmentId: string): Promise<Attachment>;
  restoreNoteAttachment(attachmentId: string, contentBase64: string): Promise<Attachment>;
  listAttachmentCleanup(): Promise<AttachmentCleanupStatus>;
  retryAttachmentCleanup(): Promise<{ completed: number; pending: number }>;
}

export function createAttachmentApi(requestJson: RequestJson): AttachmentApi {
  return {
    async listNoteAttachments(noteId) {
      return asArray<Attachment>(getData(await requestJson(
        `/api/storage/attachments?noteId=${encodeURIComponent(noteId)}`
      )));
    },
    async uploadNoteAttachment(input) {
      const attachment = getData<Attachment>(await requestJson('/api/storage/attachments', {
        method: 'POST',
        body: JSON.stringify(input)
      }));
      if (!attachment?.id) throw new Error('Upload attachment response is invalid.');
      return attachment;
    },
    async renameNoteAttachment(attachmentId, fileName) {
      const attachment = getData<Attachment>(await requestJson(
        `/api/storage/attachments/${encodeURIComponent(attachmentId)}`,
        { method: 'PATCH', body: JSON.stringify({ fileName }) }
      ));
      if (!attachment?.id) throw new Error('Rename attachment response is invalid.');
      return attachment;
    },
    async inspectAttachmentDeletion(id) {
      return getData<AttachmentDeletionPreflight>(await requestJson(`/api/storage/attachments/${encodeURIComponent(id)}/deletion-preflight`))!;
    },
    async verifyNoteAttachment(id) {
      return getData<Attachment>(await requestJson(`/api/storage/attachments/${encodeURIComponent(id)}/verify`, { method: 'POST' }))!;
    },
    async restoreNoteAttachment(id, contentBase64) {
      return getData<Attachment>(await requestJson(`/api/storage/attachments/${encodeURIComponent(id)}/restore`, { method: 'POST', body: JSON.stringify({ contentBase64 }) }))!;
    },
    async listAttachmentCleanup() {
      return getData<AttachmentCleanupStatus>(await requestJson('/api/storage/attachments/cleanup'))!;
    },
    async retryAttachmentCleanup() {
      return getData<{ completed: number; pending: number }>(await requestJson('/api/storage/attachments/cleanup/retry', { method: 'POST' }))!;
    },
    async deleteNoteAttachment(attachmentId) {
      const attachment = getData<AttachmentDeleteResult>(await requestJson(
        `/api/storage/attachments/${encodeURIComponent(attachmentId)}`,
        { method: 'DELETE' }
      ));
      if (!attachment?.id) throw new Error('Delete attachment response is invalid.');
      return attachment;
    }
  };
}
