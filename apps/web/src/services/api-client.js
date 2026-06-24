function normalizeSuccessPayload(payload) {
  if (payload?.success === true && Object.prototype.hasOwnProperty.call(payload, 'data')) {
    return { data: payload.data };
  }

  return payload ?? {};
}

function resolveErrorMessage(payload, status) {
  if (payload?.error && typeof payload.error === 'object') {
    return payload.error.message || payload.error.code || `Request failed: ${status}`;
  }

  return payload?.error || payload?.message || `Request failed: ${status}`;
}

export function createApiClient({ fetchImpl = globalThis.fetch } = {}) {
  async function requestJson(url, options = {}) {
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

    return normalizeSuccessPayload(payload);
  }

  return { requestJson };
}

export const apiClient = createApiClient();
