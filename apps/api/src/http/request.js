import { createAppError } from '../errors/app-error.js';

const DEFAULT_JSON_BODY_LIMIT_BYTES = 8 * 1024 * 1024;

function createRequestError(message, statusCode = 400, code = 'VALIDATION_ERROR') {
  return createAppError(code, message, statusCode);
}

export function parseBody(request, { limitBytes = DEFAULT_JSON_BODY_LIMIT_BYTES } = {}) {
  return new Promise((resolve, reject) => {
    let data = '';
    let receivedBytes = 0;
    const contentType = request.headers['content-type'] ?? '';

    request.on('data', (chunk) => {
      receivedBytes += chunk.byteLength;
      if (receivedBytes > limitBytes) {
        reject(createRequestError('Request body is too large', 413, 'PAYLOAD_TOO_LARGE'));
        request.destroy();
        return;
      }
      data += chunk;
    });
    request.on('end', () => {
      if (!data) {
        resolve({});
        return;
      }
      if (!contentType.includes('application/json')) {
        reject(createRequestError('Content-Type must be application/json', 415, 'UNSUPPORTED_MEDIA_TYPE'));
        return;
      }

      try {
        resolve(JSON.parse(data));
      } catch (error) {
        reject(createRequestError('Invalid JSON body'));
      }
    });
    request.on('error', reject);
  });
}

export function toQueryObject(url) {
  return Object.fromEntries(url.searchParams.entries());
}
