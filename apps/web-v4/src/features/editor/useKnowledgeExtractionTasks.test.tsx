import { StrictMode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ApiRequestError, UNAVAILABLE_EXTRACTION, type ExtractionJobDetail, type KnowledgeExtractionApi } from '@study-accelerator/web-core';
import { useKnowledgeExtractionTasks } from './useKnowledgeExtractionTasks';
import { extractionIntentKey, saveExtractionIntent } from './extractionIntentRecovery';

const environment = vi.hoisted(() => ({ value: {} as any }));
vi.mock('./ExtractionEnvironment', () => ({ useExtractionEnvironment: () => environment.value }));
const capability = { available: true, executionMode: 'mock', executionLocation: 'server', canStart: true, canReadJobs: true, reasonCode: null, message: '模拟演示' };
const job: ExtractionJobDetail = { contractVersion: 1, kind: 'knowledgeExtraction', jobId: 'job-1', scopeId: 'scope-1', spaceId: 'space', executionMode: 'mock', status: 'running', phase: 'generating', createdAt: '2026-10-02T01:00:00Z', updatedAt: '2026-10-02T01:00:00Z', candidateIds: [], error: null, actions: { canCancel: true, canRetry: false, retryUnavailableReason: null } };
function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
let api: ReturnType<typeof makeApi>;
function makeApi() {
  return { getCapabilities: vi.fn(), listJobs: vi.fn().mockResolvedValue({ items: [], nextCursor: null }), getJob: vi.fn().mockResolvedValue(job), startJob: vi.fn().mockResolvedValue(job), cancelJob: vi.fn().mockResolvedValue({ ...job, status: 'cancelled', actions: { canCancel: false, canRetry: false, retryUnavailableReason: null } }), retryJob: vi.fn().mockResolvedValue(job) } satisfies KnowledgeExtractionApi;
}
beforeEach(() => {
  api = makeApi(); environment.value = { api, capability, scopeKey: {} };
  for (const note of ['note', 'next']) saveExtractionIntent(extractionIntentKey('space', note), null);
});
function mount(note = 'note') { return renderHook(({ id }) => useKnowledgeExtractionTasks('space', id, true), { initialProps: { id: note }, wrapper: StrictMode }); }
it('默认关闭的能力不读取任务，也不允许开始', async () => {
  environment.value.capability = UNAVAILABLE_EXTRACTION;
  const { result } = mount();
  act(() => result.current.setOpen(true));
  await act(() => result.current.start({ scopeId: 'scope-1', taskKey: 'intent-1' }));
  expect(api.listJobs).not.toHaveBeenCalled(); expect(api.startJob).not.toHaveBeenCalled();
});
it('双击开始只有一个 POST；关面板不取消，重开只 GET 回读', async () => {
  const start = deferred<ExtractionJobDetail>(); api.startJob.mockReturnValue(start.promise);
  const { result } = mount();
  let pending!: Promise<void>;
  act(() => { pending = result.current.start({ scopeId: 'scope-1', taskKey: 'intent-1' }); void result.current.start({ scopeId: 'scope-1', taskKey: 'intent-1' }); });
  expect(api.startJob).toHaveBeenCalledTimes(1);
  act(() => result.current.setOpen(false)); act(() => result.current.setOpen(true));
  api.listJobs.mockResolvedValue({ items: [job], nextCursor: null });
  await act(async () => { start.resolve(job); await pending; });
  await waitFor(() => expect(result.current.job?.jobId).toBe(job.jobId));
  expect(api.cancelJob).not.toHaveBeenCalled(); expect(api.listJobs).toHaveBeenCalledWith({ spaceId: 'space', idempotencyKey: 'intent-1' });
  await act(() => result.current.refresh()); expect(api.startJob).toHaveBeenCalledTimes(1);
});
it('创建及首次恢复 GET 均丢响应后，重新挂载按 session 原 key 恢复且不重发 POST', async () => {
  api.startJob.mockRejectedValue(new Error('lost')); api.listJobs.mockRejectedValueOnce(new Error('offline'));
  const first = mount();
  await act(() => first.result.current.start({ scopeId: 'scope-1', taskKey: 'intent-lost' }));
  expect(first.result.current.error).toContain('任务状态未知');
  expect(JSON.parse(sessionStorage.getItem(extractionIntentKey('space', 'note'))!)).toEqual({ scopeId: 'scope-1', taskKey: 'intent-lost', submitted: true });
  first.unmount(); api.listJobs.mockResolvedValue({ items: [job], nextCursor: null });
  const second = mount(); act(() => second.result.current.setOpen(true));
  await waitFor(() => expect(second.result.current.job?.jobId).toBe(job.jobId));
  expect(api.listJobs).toHaveBeenLastCalledWith({ spaceId: 'space', idempotencyKey: 'intent-lost' }); expect(api.startJob).toHaveBeenCalledTimes(1);
});
it('查不到未知提交时，显式重试沿用同 key；保存范围与任务 key 不混用', async () => {
  api.startJob.mockRejectedValueOnce(new Error('lost'));
  const { result } = mount();
  act(() => result.current.prepare('scope-1'));
  await waitFor(() => expect(result.current.pending).toBe(false));
  const intent = result.current.intent!;
  await act(() => result.current.start(intent));
  expect(result.current.job).toBeNull(); expect(result.current.intent?.taskKey).toBe(intent.taskKey);
  await act(() => result.current.start(result.current.intent!));
  expect(api.startJob.mock.calls).toEqual([[{ scopeId: 'scope-1', idempotencyKey: intent.taskKey }], [{ scopeId: 'scope-1', idempotencyKey: intent.taskKey }]]);
});
it('切笔记后旧开始与 finally 不覆盖新任务或清掉新请求的 pending', async () => {
  const old = deferred<ExtractionJobDetail>(), next = deferred<ExtractionJobDetail>();
  api.startJob.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
  const { result, rerender } = mount(); let before!: Promise<void>, after!: Promise<void>;
  act(() => { before = result.current.start({ scopeId: 'scope-1', taskKey: 'old' }); });
  rerender({ id: 'next' }); expect(result.current.open).toBe(false);
  act(() => { after = result.current.start({ scopeId: 'scope-2', taskKey: 'new' }); });
  await act(async () => { old.resolve(job); await before; });
  expect(result.current.pending).toBe(true); expect(result.current.job).toBeNull();
  await act(async () => { next.resolve({ ...job, jobId: 'job-2', scopeId: 'scope-2' }); await after; });
  expect(result.current.job?.jobId).toBe('job-2'); expect(result.current.pending).toBe(false);
});
it('资料集 snapshot 变化隔离迟到 GET，不触发隐式取消或重跑', async () => {
  const page = deferred<{ items: ExtractionJobDetail[]; nextCursor: null }>(); api.listJobs.mockReturnValue(page.promise);
  const { result, rerender } = mount(); act(() => result.current.setOpen(true));
  environment.value = { ...environment.value, scopeKey: {} }; rerender({ id: 'note' });
  await act(async () => { page.resolve({ items: [job], nextCursor: null }); await page.promise; });
  expect(result.current.open).toBe(false); expect(result.current.job).toBeNull(); expect(api.getJob).not.toHaveBeenCalled(); expect(api.cancelJob).not.toHaveBeenCalled();
});
it('只按服务器 actions 允许取消与重试，空成功保持没有候选', async () => {
  const { result } = mount(); await act(() => result.current.start({ scopeId: 'scope-1', taskKey: 'intent-1' }));
  await act(() => result.current.action('retry')); expect(api.retryJob).not.toHaveBeenCalled();
  await act(() => result.current.action('cancel')); expect(result.current.job?.status).toBe('cancelled');
  await act(() => result.current.action('cancel')); expect(api.cancelJob).toHaveBeenCalledTimes(1);
  api.listJobs.mockResolvedValue({ items: [{ ...job, status: 'succeeded' }], nextCursor: null });
  api.getJob.mockResolvedValue({ ...job, status: 'succeeded', actions: { canCancel: false, canRetry: false, retryUnavailableReason: null } });
  await act(() => result.current.refresh()); expect(result.current.job?.candidateIds).toEqual([]);
});
it('恢复任务已失效时清理原 key，要求重新核对，绝不自动开始', async () => {
  saveExtractionIntent(extractionIntentKey('space', 'note'), { scopeId: 'scope-1', taskKey: 'stale', submitted: true });
  api.listJobs.mockResolvedValue({ items: [job], nextCursor: null }); api.getJob.mockRejectedValue(new ApiRequestError('not found', { status: 404 }));
  const { result } = mount(); act(() => result.current.setOpen(true));
  await waitFor(() => expect(result.current.notice).toContain('重新核对'));
  expect(result.current.intent).toBeNull(); expect(sessionStorage.getItem(extractionIntentKey('space', 'note'))).toBeNull(); expect(api.startJob).not.toHaveBeenCalled();
});
it('会话写入失败仍保留当前意图并显示恢复限制', async () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  const { result } = mount(); await act(() => result.current.start({ scopeId: 'scope-1', taskKey: 'stable' }));
  expect(result.current.intent?.taskKey).toBe('stable'); expect(result.current.recoveryWarning).toContain('避免刷新后重复开始');
});
