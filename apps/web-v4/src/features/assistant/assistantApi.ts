import { apiClient } from '@study-accelerator/web-core';

export interface AssistantStatus {
  provider: 'deepseek';
  modelId: string | null;
  configured: boolean;
  executionLocation: 'local' | 'server';
  generationAvailable: boolean;
  unavailableReason: string | null;
}

export interface AssistantSource {
  sourceId: string;
  noteId: string;
  noteVersionId: string;
  contentHash?: string;
  start: number;
  end: number;
}

export interface AssistantPreview {
  previewId: string;
  expiresAt: string;
  scopeHash: string;
  payloadHash: string;
  recipient: string;
  spaceId: string;
  sources: Array<AssistantSource & { text: string }>;
  omissions: string[];
  estimatedInputTokens: number;
}

export interface AssistantJob {
  jobId: string;
  spaceId: string;
  question: string | null;
  status: 'pending' | 'running' | 'retrying' | 'cancelling' | 'cancelled' | 'succeeded' | 'failed';
  phase: string;
  modelId: string;
  createdAt: string;
  updatedAt: string;
  result?: { answer: string; citations: AssistantSource[] } | null;
  sources?: AssistantSource[];
  omissions?: string[];
}

const root = '/api/ai/assistant';
const mutation = { 'X-Knowra-AI-Assistant': '1' };
const data = async <T>(url: string, options?: Parameters<typeof apiClient.requestJson>[1]) => (
  await apiClient.requestJson<{ data: T }>(url, options)).data;

export const assistantApi = {
  status: () => data<AssistantStatus>(`${root}/status`),
  list: (spaceId: string) => data<AssistantJob[]>(`${root}/jobs?spaceId=${encodeURIComponent(spaceId)}`),
  get: (jobId: string) => data<AssistantJob>(`${root}/jobs/${encodeURIComponent(jobId)}`),
  preview: (input: { spaceId: string; scope: { kind: 'note'; noteId: string } | { kind: 'folder'; folderId: string }; question: string }) =>
    data<AssistantPreview>(`${root}/preview`, { method: 'POST', headers: mutation, body: JSON.stringify(input) }),
  start: (preview: AssistantPreview, idempotencyKey: string) => data<AssistantJob>(`${root}/jobs`, {
    method: 'POST', headers: mutation, body: JSON.stringify({ previewId: preview.previewId,
      scopeHash: preview.scopeHash, payloadHash: preview.payloadHash, idempotencyKey })
  }),
  cancel: (jobId: string) => data<AssistantJob>(`${root}/jobs/${encodeURIComponent(jobId)}/cancel`, {
    method: 'POST', headers: mutation
  })
};
