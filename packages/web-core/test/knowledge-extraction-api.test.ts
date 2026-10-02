import { describe, expect, it, vi } from 'vitest';
import { ApiRequestError, createWorkspaceApi, UNAVAILABLE_EXTRACTION, type ExtractionJobDetail } from '../src/index.js';

const summary = { contractVersion: 1, kind: 'knowledgeExtraction', jobId: 'job/合成', scopeId: 'scope', spaceId: 'space/合成', executionMode: 'mock', status: 'running', phase: 'generating', createdAt: '2026-10-02T01:00:00Z', updatedAt: '2026-10-02T01:00:00Z' } as const;
const detail: ExtractionJobDetail = { ...summary, candidateIds: [], error: null, actions: { canCancel: true, canRetry: false, retryUnavailableReason: null } };
describe('知识提炼独立 HTTP 契约', () => {
  it('默认能力独立查询，不能被旧 preview.ai 改写', async () => {
    const requestJson = vi.fn().mockResolvedValue({ data: { contractVersion: 1, knowledgeExtraction: UNAVAILABLE_EXTRACTION } });
    const api = createWorkspaceApi({ requestJson }).knowledgeExtraction!;
    await expect(api.getCapabilities()).resolves.toMatchObject({ knowledgeExtraction: { canStart: false, canReadJobs: false } });
    expect(requestJson).toHaveBeenCalledExactlyOnceWith('/api/ai/capabilities', undefined);
  });
  it('显式开始只发三字段与保护头，不透传正文或宿主配置', async () => {
    const requestJson = vi.fn().mockResolvedValue({ data: detail });
    const input = { scopeId: 'scope', idempotencyKey: 'task-stable', rawMarkdown: '不发送的正文', owner: '不发送的owner' };
    await createWorkspaceApi({ requestJson }).knowledgeExtraction!.startJob(input);
    expect(requestJson).toHaveBeenCalledExactlyOnceWith('/api/ai/jobs', { method: 'POST', headers: { 'X-Knowra-AI-Job': '1' }, body: JSON.stringify({ kind: 'knowledgeExtraction', scopeId: 'scope', idempotencyKey: 'task-stable' }) });
  });
  it('恢复 GET 按空间及原请求精确查询，有界分页且不触发 POST', async () => {
    const requestJson = vi.fn().mockResolvedValue({ data: { items: [summary], nextCursor: 'page-2' } });
    await createWorkspaceApi({ requestJson }).knowledgeExtraction!.listJobs({ spaceId: summary.spaceId, cursor: 'a&b', idempotencyKey: '原请求 / 1' });
    const [url, options] = requestJson.mock.calls[0];
    expect(Object.fromEntries(new URL(url, 'http://contract.test').searchParams)).toEqual({ kind: 'knowledgeExtraction', spaceId: summary.spaceId, limit: '20', cursor: 'a&b', idempotencyKey: '原请求 / 1' });
    expect(options).toBeUndefined();
  });
  it('详情及显式动作只使用已编码 jobId，动作 body 为空', async () => {
    const requestJson = vi.fn().mockResolvedValue({ data: detail });
    const api = createWorkspaceApi({ requestJson }).knowledgeExtraction!;
    await api.getJob(summary.jobId); await api.cancelJob(summary.jobId); await api.retryJob(summary.jobId);
    expect(requestJson.mock.calls.map(call => call[0])).toEqual(['/api/ai/jobs/job%2F%E5%90%88%E6%88%90', '/api/ai/jobs/job%2F%E5%90%88%E6%88%90/cancel', '/api/ai/jobs/job%2F%E5%90%88%E6%88%90/retry']);
    for (const [, options] of requestJson.mock.calls.slice(1)) expect(options).toEqual({ method: 'POST', headers: { 'X-Knowra-AI-Job': '1' }, body: '{}' });
  });
  it.each([{ ...detail, rawMarkdown: '私有字段' }, { ...detail, executionMode: 'real' }, { ...detail, candidateIds: ['premature'] }, { ...detail, jobId: 'other' }, { ...detail, actions: { canRetry: true } }])('拒绝非法或跨任务 detail %#', async value => {
    const api = createWorkspaceApi({ requestJson: vi.fn().mockResolvedValue({ data: value }) }).knowledgeExtraction!;
    await expect(api.getJob(summary.jobId)).rejects.toMatchObject({ code: 'KNOWLEDGE_EXTRACTION_INVALID_RESPONSE' });
  });
  it('拒绝跨空间列表和超页长度', async () => {
    const requestJson = vi.fn().mockResolvedValueOnce({ data: { items: [{ ...summary, spaceId: 'other' }], nextCursor: null } }).mockResolvedValueOnce({ data: { items: Array(21).fill(summary), nextCursor: null } });
    const api = createWorkspaceApi({ requestJson }).knowledgeExtraction!;
    await expect(api.listJobs({ spaceId: summary.spaceId })).rejects.toThrow();
    await expect(api.listJobs({ spaceId: summary.spaceId })).rejects.toThrow();
  });
  it('保留安全状态码但不把任意传输/供应商异常送入 UI', async () => {
    const api = createWorkspaceApi({ requestJson: vi.fn().mockRejectedValue(new ApiRequestError('SQL及供应商机密', { status: 503, code: 'KNOWLEDGE_EXTRACTION_UNAVAILABLE' })) }).knowledgeExtraction!;
    await expect(api.getJob(summary.jobId)).rejects.toMatchObject({ status: 503, code: 'KNOWLEDGE_EXTRACTION_UNAVAILABLE', message: '任务请求未完成，请查询当前状态后再操作。' });
  });
});
