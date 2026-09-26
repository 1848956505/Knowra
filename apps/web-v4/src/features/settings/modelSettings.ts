import { apiClient } from '@study-accelerator/web-core';

export interface ModelSettingsStatus {
  provider: 'deepseek';
  modelId: string;
  configured: boolean;
  connected?: boolean;
  modelAvailable?: boolean;
  checkedAt?: string;
}

type Action = 'status' | 'save' | 'remove' | 'check';

async function request(action: Action, value?: { modelId: string; apiKey: string }): Promise<ModelSettingsStatus> {
  if (window.knowraDesktop?.modelSettings) return window.knowraDesktop.modelSettings(action, value);
  const url = `/api/ai/model-settings${action === 'check' ? '/check' : ''}`;
  const method = { status: 'GET', save: 'PUT', remove: 'DELETE', check: 'POST' }[action];
  const response = await apiClient.requestJson<{ data: ModelSettingsStatus }>(url, {
    method,
    headers: action === 'status' ? undefined : { 'X-Knowra-Model-Settings': '1' },
    body: value ? JSON.stringify(value) : undefined
  });
  return response.data;
}

export const modelSettings = {
  status: () => request('status'),
  save: (value: { modelId: string; apiKey: string }) => request('save', value),
  remove: () => request('remove'),
  check: () => request('check')
};
