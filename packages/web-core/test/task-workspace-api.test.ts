import { describe, it, expect, vi } from 'vitest';
import { createTaskWorkspaceApi } from '../src/api/task-workspace-api.js';
const page = {
  id: 'doc',
  workspaceId: 'workspace',
  title: '合成文档',
  revision: 1,
  currentVersionId: 'v1',
  version: {
    id: 'v1',
    ordinal: 1,
    contentHash: 'a'.repeat(64),
    createdAt: '2026-10-15T00:00:00Z',
    actor: { kind: 'user', id: 'synthetic' },
  },
  markdown: 'a',
  start: 0,
  end: 1,
  hasMore: true,
  attachments: [],
};
describe('任务工作区HTTP客户端', () => {
  it('读取固定版本连续片段后提供完整编辑正文', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ data: page })
      .mockResolvedValueOnce({
        data: { ...page, markdown: '😀', start: 1, end: 3, hasMore: false },
      });
    const result = await createTaskWorkspaceApi(request).getFullDocument({
      workspaceId: 'workspace',
      documentId: 'doc',
    });
    expect(result.markdown).toBe('a😀');
    expect(request.mock.calls[1][0]).toContain('versionId=v1&start=1');
  });
  it('拒绝不前进分页与跨工作区正文', async () => {
    for (const value of [
      { ...page, markdown: '', end: 0 },
      { ...page, workspaceId: 'private' },
    ]) {
      const request = vi.fn().mockResolvedValue({ data: value });
      await expect(
        createTaskWorkspaceApi(request).getFullDocument({
          workspaceId: 'workspace',
          documentId: 'doc',
        }),
      ).rejects.toMatchObject({ code: 'TASK_WORKSPACE_INVALID_RESPONSE' });
      expect(request).toHaveBeenCalledTimes(1);
    }
  });
  it('恢复后的revision变化不拼接混合正文', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ data: page })
      .mockResolvedValueOnce({
        data: { ...page, revision: 2, start: 1, end: 2, hasMore: false },
      });
    await expect(
      createTaskWorkspaceApi(request).getFullDocument({
        workspaceId: 'workspace',
        documentId: 'doc',
      }),
    ).rejects.toMatchObject({ code: 'TASK_WORKSPACE_CONFLICT' });
  });
  it('mutation携带页面绑定epoch并安全映射错误', async () => {
    const request = vi
      .fn()
      .mockResolvedValue({
        data: {
          operationId: 'op',
          reused: false,
          data: { workspace: { id: 'workspace' } },
        },
      });
    await createTaskWorkspaceApi(request, {
      datasetEpoch: () => 'epoch',
    }).createWorkspace({ operationId: 'op', name: '合成' });
    expect(request.mock.calls[0][1].headers).toEqual({
      'X-Task-Workspace-Epoch': 'epoch',
    });
  });
});
