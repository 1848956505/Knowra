import { describe, expect, it, vi } from 'vitest';
import { createAttachmentApi, type AttachmentApi } from '../src/api/attachment-api.js';
import { createWorkspaceApi, type UploadAttachmentInput, type WorkspaceApi } from '../src/api/workspace-api.js';
import type { UploadAttachmentInput as RootUploadAttachmentInput, WorkspaceApi as RootWorkspaceApi } from '../src/index.js';
import { ApiRequestError, type RequestJson } from '../src/api/client.js';
import { createAttachmentApiBefore } from './fixtures/attachment-api-before.js';

const input: UploadAttachmentInput = Object.freeze({ noteId: '笔记/1?%#', fileName: '图 "一".png', mimeType: 'image/png', contentBase64: 'YWJj+/=' });
const rootInput: RootUploadAttachmentInput = input;
const id = '附件/1?%#';
const encodedId = encodeURIComponent(id);
const root = '/api/storage/attachments';
const attachment = Object.freeze({ id, noteId: input.noteId, fileName: input.fileName, size: 3, mimeType: input.mimeType, status: 'ready', extra: '保留' });
const cases: Array<{ name: keyof AttachmentApi; call(api: AttachmentApi): Promise<unknown>; args: unknown[] }> = [
  { name: 'listNoteAttachments', call: api => api.listNoteAttachments(input.noteId), args: [`${root}?noteId=${encodeURIComponent(input.noteId)}`] },
  { name: 'uploadNoteAttachment', call: api => api.uploadNoteAttachment(rootInput), args: [root, { method: 'POST', body: JSON.stringify(input) }] },
  { name: 'renameNoteAttachment', call: api => api.renameNoteAttachment(id, input.fileName), args: [`${root}/${encodedId}`, { method: 'PATCH', body: JSON.stringify({ fileName: input.fileName }) }] },
  { name: 'deleteNoteAttachment', call: api => api.deleteNoteAttachment(id), args: [`${root}/${encodedId}`, { method: 'DELETE' }] },
  { name: 'inspectAttachmentDeletion', call: api => api.inspectAttachmentDeletion(id), args: [`${root}/${encodedId}/deletion-preflight`] },
  { name: 'verifyNoteAttachment', call: api => api.verifyNoteAttachment(id), args: [`${root}/${encodedId}/verify`, { method: 'POST' }] },
  { name: 'restoreNoteAttachment', call: api => api.restoreNoteAttachment(id, input.contentBase64), args: [`${root}/${encodedId}/restore`, { method: 'POST', body: JSON.stringify({ contentBase64: input.contentBase64 }) }] },
  { name: 'listAttachmentCleanup', call: api => api.listAttachmentCleanup(), args: [`${root}/cleanup`] },
  { name: 'retryAttachmentCleanup', call: api => api.retryAttachmentCleanup(), args: [`${root}/cleanup/retry`, { method: 'POST' }] }
];
const factories = [
  { name: '附件领域', create: createAttachmentApi },
  { name: '工作区兼容入口', create: (requestJson: RequestJson): RootWorkspaceApi => createWorkspaceApi({ requestJson }) }
];
const responses: unknown[] = [
  undefined, null, false, 0, '', [], {}, { error: { code: 'ERROR' } },
  { data: undefined }, { data: null }, { data: false }, { data: 0 }, { data: '' },
  { data: [] }, { data: [attachment] }, { data: {} }, { data: { id: '' } },
  { data: { id: 42 } }, { data: attachment },
  { data: { ...attachment, cleanup: 'retained-local' } },
  { data: { asset: { type: 'attachment', id }, references: [], decision: 'can-purge-no-history' } },
  { data: { items: [], pending: 0 } }, { data: { completed: 1, pending: 0 } }
];
async function outcome(promise: Promise<unknown>) {
  try { return { value: await promise }; }
  catch (error) { return { error: error instanceof Error ? { name: error.name, message: error.message } : error }; }
}

describe.each(factories)('$name', ({ create }) => {
  it.each(cases)('$name 保持精确请求轨迹及旧响应语义', async ({ call, args }) => {
    for (const payload of responses) {
      const beforeRequest = vi.fn().mockResolvedValue(payload);
      const afterRequest = vi.fn().mockResolvedValue(payload);
      const before = await outcome(call(createAttachmentApiBefore(beforeRequest)));
      const after = await outcome(call(create(afterRequest)));
      expect(after).toEqual(before);
      expect(afterRequest.mock.calls).toEqual([args]);
      expect(afterRequest.mock.calls).toEqual(beforeRequest.mock.calls);
      if ('value' in before && before.value !== undefined && !Array.isArray(before.value)) {
        expect(after.value).toBe(before.value);
      }
    }
  });

  it.each(cases)('$name 原样传播请求异常且不重试', async ({ call, args }) => {
    const error = new ApiRequestError('附件仍被引用', { status: 409, code: 'ATTACHMENT_REFERENCED' });
    const request = vi.fn().mockRejectedValue(error);
    await expect(call(create(request))).rejects.toBe(error);
    expect(request.mock.calls).toEqual([args]);
  });

  it('保留仅三个写入方法的 id 校验与原错误文案', async () => {
    const request = vi.fn().mockResolvedValue({ data: {} });
    const api = create(request);
    await expect(api.uploadNoteAttachment(input)).rejects.toThrow('Upload attachment response is invalid.');
    await expect(api.renameNoteAttachment(id, '')).rejects.toThrow('Rename attachment response is invalid.');
    await expect(api.deleteNoteAttachment(id)).rejects.toThrow('Delete attachment response is invalid.');
    await expect(api.verifyNoteAttachment(id)).resolves.toEqual({});
  });

  it('保持列表数组身份与所有其余响应字段，不克隆或裁剪', async () => {
    const items = Object.freeze([attachment]);
    const request = vi.fn().mockResolvedValue({ data: items });
    await expect(create(request).listNoteAttachments('')).resolves.toBe(items);
    expect(request.mock.calls).toEqual([[`${root}?noteId=`]]);
    request.mockResolvedValue({ data: attachment });
    await expect(create(request).uploadNoteAttachment(input)).resolves.toBe(attachment);
  });
});

it('工作区只组合附件方法，仍包含其余领域且各实例使用独立传输', async () => {
  const firstRequest = vi.fn().mockResolvedValue({ data: attachment });
  const secondRequest = vi.fn().mockResolvedValue({ data: { ...attachment, id: 'second' } });
  const first: WorkspaceApi = createWorkspaceApi({ requestJson: firstRequest });
  const second = createWorkspaceApi({ requestJson: secondRequest });
  expect(firstRequest).not.toHaveBeenCalled();
  expect(secondRequest).not.toHaveBeenCalled();
  expect(first.knowledgeExtraction?.getCapabilities).toBeTypeOf('function');
  expect(first.listTrainingAssets).toBeTypeOf('function');
  expect(first.updateFolder).toBeTypeOf('function');
  await expect(first.verifyNoteAttachment(id)).resolves.toBe(attachment);
  await expect(second.verifyNoteAttachment('second')).resolves.toMatchObject({ id: 'second' });
  expect(firstRequest).toHaveBeenCalledOnce();
  expect(secondRequest).toHaveBeenCalledOnce();
});
