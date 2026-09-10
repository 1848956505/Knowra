const READ_METHODS = new Set(['GET', 'HEAD']);
const MUTATIONS = [
  ['DELETE', /^\/api\/storage\/attachments\/[^/]+$/],
  ['POST', /^\/api\/storage\/attachments$/],
  ['POST', /^\/api\/storage\/attachments\/[^/]+\/rename$/],
  ['POST', /^\/api\/knowledge\/annotations(?:\/[^/]+\/(?:restore|exclusions))?$/],
  ['PATCH', /^\/api\/knowledge\/annotations\/[^/]+(?:\/anchor)?$/],
  ['DELETE', /^\/api\/knowledge\/annotations\/[^/]+(?:\/exclusions\/[^/]+)?$/],
  ['POST', /^\/api\/knowledge\/spaces\/default$/],
  ['POST', /^\/api\/knowledge\/notes(?:\/import-markdown(?:-batch)?|\/batch\/(?:delete|tags))?$/],
  ['PATCH', /^\/api\/knowledge\/notes\/batch\/tags$/],
  ['PATCH', /^\/api\/knowledge\/notes\/[^/]+$/],
  ['DELETE', /^\/api\/knowledge\/notes\/[^/]+$/],
  ['POST', /^\/api\/knowledge\/notes\/[^/]+\/(?:favorite|restore|tags)$/],
  ['PUT', /^\/api\/knowledge\/notes\/[^/]+\/tags$/],
  ['DELETE', /^\/api\/knowledge\/notes\/[^/]+\/tags\/[^/]+$/],
  ['POST', /^\/api\/knowledge\/(?:folders|tags|tag-groups)$/],
  ['PATCH', /^\/api\/knowledge\/(?:folders|tags|tag-groups)\/[^/]+$/],
  ['DELETE', /^\/api\/knowledge\/(?:folders|tags|tag-groups)\/[^/]+$/],
  ['POST', /^\/api\/knowledge\/tags\/(?:merge|reorder)$/]
];

/** 开放首版离线领域写入；知识、试题、AI 和永久删除维持受限。 */
export function permitsLocalRoute(method, pathname) {
  if (READ_METHODS.has(method)) return true;
  if (/\/(permanent|recycle-bin)(\/|$)/.test(pathname)) return false;
  return MUTATIONS.some(([allowedMethod, pattern]) => method === allowedMethod && pattern.test(pathname));
}

export function sendRuntimeError(response, status, code, message) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify({ error: { code, message } }));
}
