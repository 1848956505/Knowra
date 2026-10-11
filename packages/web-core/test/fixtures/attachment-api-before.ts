// 冻结 main 3b690f6 的附件客户端实现，用于结构迁移差分；不要与新实现同步重构。
import type { Attachment, AttachmentDeleteResult, AttachmentDeletionPreflight, AttachmentCleanupStatus } from '../../src/workspace/types.js';
import type { RequestJson } from '../../src/api/client.js';
import type { WorkspaceApi } from '../../src/api/workspace-api.js';

type AttachmentMethods = Pick<WorkspaceApi,
  'listNoteAttachments' | 'uploadNoteAttachment' | 'renameNoteAttachment' |
  'deleteNoteAttachment' | 'inspectAttachmentDeletion' | 'verifyNoteAttachment' |
  'restoreNoteAttachment' | 'listAttachmentCleanup' | 'retryAttachmentCleanup'>;

function getData<T>(payload: unknown): T | undefined {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !('data' in payload)) return undefined;
  return payload.data as T;
}
function asArray<T>(value: unknown): T[] { return Array.isArray(value) ? value as T[] : []; }

export function createAttachmentApiBefore(requestJson: RequestJson): AttachmentMethods {
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
