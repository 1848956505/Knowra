import { isRecord, type ApiErrorEnvelope } from './response.js';

export interface FetchResponseLike {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export interface FetchOptionsLike {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export type FetchLike = (url: string, options: FetchOptionsLike) => Promise<FetchResponseLike>;

export interface RequestJsonOptions extends FetchOptionsLike {}

export type RequestJson = <T = unknown>(url: string, options?: RequestJsonOptions) => Promise<T>;

export function createApiClient({ fetchImpl = resolveGlobalFetch() }: { fetchImpl?: FetchLike } = {}) {
  const requestJson: RequestJson = async <T>(url: string, options: RequestJsonOptions = {}) => {
    const response = await fetchImpl(url, {
      method: options.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers ?? {})
      },
      body: options.body
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(resolveErrorMessage(payload, response.status));
    }

    return (payload ?? {}) as T;
  };

  return { requestJson };
}

export const apiClient = createApiClient();

function resolveErrorMessage(payload: unknown, status: number): string {
  if (isRecord(payload)) {
    const candidate = payload as ApiErrorEnvelope;
    if (candidate.error && typeof candidate.error === 'object') {
      return candidate.error.message || candidate.error.code || `Request failed: ${status}`;
    }
    if (typeof candidate.error === 'string') return candidate.error;
    if (typeof candidate.message === 'string') return candidate.message;
  }
  return `Request failed: ${status}`;
}

function resolveGlobalFetch(): FetchLike {
  const fetchImpl = (globalThis as { fetch?: FetchLike }).fetch;
  if (!fetchImpl) throw new Error('A fetch implementation is required.');
  return fetchImpl.bind(globalThis);
}
