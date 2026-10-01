import { apiClient, type Note } from '@study-accelerator/web-core';
export interface NoteAction {
  actionId: string; requestId: string; status: string; errorCode: string | null; expiresAt: string;
  reconciliationPending?: boolean;
  plan: { planHash: string; toolName: string; items: Array<{ before: Note | null; after: Note; softDelete?: boolean }> };
  receipt: null | { result: { saveState: 'localCommitted'; changes: Array<{ noteId: string }> } };
}
const data = async <T>(url: string, options?: Parameters<typeof apiClient.requestJson>[1]) =>
  (await apiClient.requestJson<{ data: T }>(url, options)).data;
const post = <T>(path: string, body: unknown = {}) => data<T>(`/api/ai/actions${path}`, {
  method: 'POST', headers: { 'X-Knowra-AI-Action': '1' }, body: JSON.stringify(body)
});
export const noteActionApi = {
  list: (spaceId: string) => data<NoteAction[]>(`/api/ai/actions?spaceId=${encodeURIComponent(spaceId)}`),
  get: (id: string) => data<NoteAction>(`/api/ai/actions/${encodeURIComponent(id)}`),
  plan: (input: Record<string, unknown>) => post<NoteAction>('', input),
  approve: (action: NoteAction) => post<NoteAction>(`/${encodeURIComponent(action.actionId)}/approve`, { planHash: action.plan.planHash }),
  apply: (id: string) => post<NoteAction>(`/${encodeURIComponent(id)}/apply`),
  cancel: (id: string) => post<NoteAction>(`/${encodeURIComponent(id)}/cancel`),
  reject: (id: string) => post<NoteAction>(`/${encodeURIComponent(id)}/reject`),
  undo: (id: string, requestId: string) => post<NoteAction>(`/${encodeURIComponent(id)}/undo-preview`, { requestId }),
  draft: (input: { noteId: string; clientId: string; dirty: boolean }) => post<{ dirty: boolean }>('/drafts', input),
  note: (id: string) => data<Note>(`/api/knowledge/notes/${encodeURIComponent(id)}`)
};
