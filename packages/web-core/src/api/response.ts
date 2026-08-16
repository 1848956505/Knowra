export interface ApiSuccessEnvelope<T> {
  data: T;
}

export interface ApiErrorEnvelope {
  error?: string | {
    code?: string;
    message?: string;
  };
  message?: string;
}

export function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

export function asItems<T>(value: T | T[] | null | undefined): T[] {
  if (Array.isArray(value)) return value;
  return value == null ? [] : [value];
}

export function getData<T>(payload: unknown): T | undefined {
  if (!isRecord(payload) || !('data' in payload)) return undefined;
  return payload.data as T;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
