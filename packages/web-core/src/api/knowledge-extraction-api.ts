import { ApiRequestError, type RequestJson } from './client.js';
import { getData, isRecord } from './response.js';

export interface ExtractionCapability {
  available: boolean;
  executionMode: 'unavailable' | 'mock';
  executionLocation: 'server';
  canStart: boolean;
  canReadJobs: boolean;
  reasonCode: string | null;
  message: string;
}
export interface AiCapabilities { contractVersion: 1; knowledgeExtraction: ExtractionCapability }
export type ExtractionStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'retrying' | 'cancelling' | 'cancelled';
export interface ExtractionJobSummary {
  contractVersion: 1; kind: 'knowledgeExtraction'; jobId: string; scopeId: string; spaceId: string;
  executionMode: 'mock'; status: ExtractionStatus;
  phase: 'preparing' | 'retrieving' | 'generating' | 'validating' | 'committing' | 'finished';
  createdAt: string; updatedAt: string;
}
export interface ExtractionSafeError { code: string; message: string }
export interface ExtractionJobDetail extends ExtractionJobSummary {
  candidateIds: string[];
  error: ExtractionSafeError | null;
  actions: { canCancel: boolean; canRetry: boolean; retryUnavailableReason: ExtractionSafeError | null };
}
export interface ExtractionJobPage { items: ExtractionJobSummary[]; nextCursor: string | null }
export interface KnowledgeExtractionApi {
  getCapabilities(): Promise<AiCapabilities>;
  listJobs(input: { spaceId: string; limit?: number; cursor?: string; idempotencyKey?: string }): Promise<ExtractionJobPage>;
  getJob(jobId: string): Promise<ExtractionJobDetail>;
  startJob(input: { scopeId: string; idempotencyKey: string }): Promise<ExtractionJobDetail>;
  cancelJob(jobId: string): Promise<ExtractionJobDetail>;
  retryJob(jobId: string): Promise<ExtractionJobDetail>;
}
export const UNAVAILABLE_EXTRACTION: ExtractionCapability = {
  available: false, executionMode: 'unavailable', executionLocation: 'server', canStart: false, canReadJobs: false,
  reasonCode: 'KNOWLEDGE_EXTRACTION_UNAVAILABLE', message: '知识提炼暂不可用；仍可保存分析范围和手动整理知识。'
};
const keys = (v: unknown, required: string[]) => isRecord(v) && Object.keys(v).length === required.length && required.every(k => k in v);
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const safeError = (v: unknown) => v === null || keys(v, ['code', 'message']) && isRecord(v) && text(v.code) && text(v.message);
const summaryKeys = ['contractVersion', 'kind', 'jobId', 'scopeId', 'spaceId', 'executionMode', 'status', 'phase', 'createdAt', 'updatedAt'];
function summary(v: unknown) {
  return isRecord(v) && v.contractVersion === 1 && v.kind === 'knowledgeExtraction' && v.executionMode === 'mock'
    && ['jobId', 'scopeId', 'spaceId', 'createdAt', 'updatedAt'].every(k => text(v[k]))
    && ['pending', 'running', 'succeeded', 'failed', 'retrying', 'cancelling', 'cancelled'].includes(String(v.status))
    && ['preparing', 'retrieving', 'generating', 'validating', 'committing', 'finished'].includes(String(v.phase));
}
function detail(v: unknown) {
  return keys(v, [...summaryKeys, 'candidateIds', 'error', 'actions']) && isRecord(v) && summary(v)
    && Array.isArray(v.candidateIds) && v.candidateIds.every(text) && (v.status === 'succeeded' || v.candidateIds.length === 0)
    && safeError(v.error) && keys(v.actions, ['canCancel', 'canRetry', 'retryUnavailableReason']) && isRecord(v.actions)
    && typeof v.actions.canCancel === 'boolean' && typeof v.actions.canRetry === 'boolean' && safeError(v.actions.retryUnavailableReason);
}
/** Narrow DTO only; capability never changes the separately signed scope preview. */
export function createKnowledgeExtractionApi(requestJson: RequestJson): KnowledgeExtractionApi {
  async function request<T>(url: string, valid: (v: unknown) => boolean, body?: unknown): Promise<T> {
    let value: unknown;
    try { value = getData(await requestJson(url, body === undefined ? undefined : {
      method: 'POST', headers: { 'X-Knowra-AI-Job': '1' }, body: JSON.stringify(body)
    })); } catch (error) {
      // The task UI never displays arbitrary transport/provider error text.
      throw new ApiRequestError('任务请求未完成，请查询当前状态后再操作。', {
        status: error instanceof ApiRequestError ? error.status : 0,
        code: error instanceof ApiRequestError ? error.code : null
      });
    }
    if (!valid(value)) throw new ApiRequestError('任务响应无效，请刷新状态。', { status: 502, code: 'KNOWLEDGE_EXTRACTION_INVALID_RESPONSE' });
    return value as T;
  }
  const jobPath = (id: string) => `/api/ai/jobs/${encodeURIComponent(id)}`;
  return {
    getCapabilities: () => request('/api/ai/capabilities', v => keys(v, ['contractVersion', 'knowledgeExtraction']) && isRecord(v)
      && v.contractVersion === 1 && isRecord(v.knowledgeExtraction) && (() => {
        const c = v.knowledgeExtraction;
        return keys(c, ['available', 'executionMode', 'executionLocation', 'canStart', 'canReadJobs', 'reasonCode', 'message'])
          && typeof c.available === 'boolean' && typeof c.canStart === 'boolean' && typeof c.canReadJobs === 'boolean'
          && ['mock', 'unavailable'].includes(String(c.executionMode)) && c.executionLocation === 'server'
          && (c.reasonCode === null || text(c.reasonCode)) && text(c.message)
          && (c.executionMode === 'mock' || (!c.available && !c.canStart && !c.canReadJobs));
      })()),
    listJobs: input => {
      const params = Object.entries({ kind: 'knowledgeExtraction', spaceId: input.spaceId, limit: input.limit ?? 20,
        cursor: input.cursor, idempotencyKey: input.idempotencyKey }).filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
      return request(`/api/ai/jobs?${params}`, v => keys(v, ['items', 'nextCursor']) && isRecord(v) && Array.isArray(v.items)
        && v.items.length <= (input.limit ?? 20) && v.items.every(item => keys(item, summaryKeys) && summary(item) && item.spaceId === input.spaceId)
        && (v.nextCursor === null || text(v.nextCursor)));
    },
    getJob: id => request(jobPath(id), v => detail(v) && isRecord(v) && v.jobId === id),
    startJob: input => request('/api/ai/jobs', v => detail(v) && isRecord(v) && v.scopeId === input.scopeId,
      { kind: 'knowledgeExtraction', scopeId: input.scopeId, idempotencyKey: input.idempotencyKey }),
    cancelJob: id => request(`${jobPath(id)}/cancel`, v => detail(v) && isRecord(v) && v.jobId === id, {}),
    retryJob: id => request(`${jobPath(id)}/retry`, v => detail(v) && isRecord(v) && v.jobId === id, {})
  };
}
