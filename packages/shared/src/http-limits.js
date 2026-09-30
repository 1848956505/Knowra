// HTTP 上限按最终序列化 JSON 的 UTF-8 字节数计量；API 和生产代理共用。
export const DEFAULT_JSON_BODY_LIMIT_BYTES = 8 * 1024 * 1024;
export const SYNC_BATCH_BODY_LIMIT_BYTES = 16 * 1024 * 1024;
export const SYNC_BLOB_BODY_LIMIT_BYTES = 9 * 1024 * 1024;
export const SYNC_CLIENT_BATCH_BODY_LIMIT_BYTES = 12 * 1024 * 1024;
export function requestBodyLimit(method, pathname) {
  if (method === 'POST') {
    if (pathname === '/api/sync/batch') return SYNC_BATCH_BODY_LIMIT_BYTES;
    if (pathname === '/api/sync/blobs' || /^\/api\/storage\/attachments\/[^/]+\/restore$/.test(pathname)) return SYNC_BLOB_BODY_LIMIT_BYTES;
  }
  return DEFAULT_JSON_BODY_LIMIT_BYTES;
}
