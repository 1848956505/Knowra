export function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8'
  });
  response.end(JSON.stringify(payload));
}

export function sendError(response, statusCode, code, message) {
  sendJson(response, statusCode, {
    error: {
      code,
      message
    }
  });
}

const INLINE_BINARY_TYPES = new Set([
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp'
]);

const ACTIVE_CONTENT_TYPES = new Set([
  'application/javascript',
  'application/xhtml+xml',
  'application/xml',
  'image/svg+xml',
  'text/html',
  'text/javascript',
  'text/xml'
]);

export function sendBinary(response, statusCode, content, mimeType, fileName) {
  const normalizedMimeType = normalizeMimeType(mimeType);
  const activeContent = ACTIVE_CONTENT_TYPES.has(normalizedMimeType);
  const disposition = INLINE_BINARY_TYPES.has(normalizedMimeType)
    ? 'inline'
    : 'attachment';
  const responseMimeType = activeContent
    ? 'application/octet-stream'
    : normalizedMimeType;

  response.writeHead(statusCode, {
    'Content-Type': responseMimeType,
    'Content-Length': content.byteLength,
    'Content-Disposition': buildContentDisposition(disposition, fileName),
    'Content-Security-Policy': 'sandbox',
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(content);
}

function normalizeMimeType(mimeType) {
  const normalized = String(mimeType ?? '')
    .split(';', 1)[0]
    .trim()
    .toLowerCase();
  return normalized || 'application/octet-stream';
}

function buildContentDisposition(disposition, fileName) {
  const normalizedName = String(fileName || 'attachment.bin')
    .replace(/[\r\n"\\]/g, '_');
  const fallbackName = normalizedName.replace(/[^\x20-\x7e]/g, '_');
  const encodedName = encodeURIComponent(normalizedName);
  return `${disposition}; filename="${fallbackName}"; filename*=UTF-8''${encodedName}`;
}
