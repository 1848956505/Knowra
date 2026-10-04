const READ_METHODS = new Set(['GET', 'HEAD']);
const MUTATIONS = [
  ['POST', /^\/api\/knowledge\/items\/[^/]+\/learning-objectives$/],
  ['POST', /^\/api\/knowledge\/(?:learning-objectives|exam-profiles|exam-focuses|questions)$/],
  ['PATCH', /^\/api\/knowledge\/(?:learning-objectives|exam-profiles|exam-focuses|questions)\/[^/]+$/],
  ['POST', /^\/api\/knowledge\/exam-profiles\/[^/]+\/focuses$/],
  ['POST', /^\/api\/knowledge\/learning-objectives\/[^/]+\/(?:confirm|request-revision|archive|restore|trash|restore-deleted)$/],
  ['POST', /^\/api\/knowledge\/exam-profiles\/[^/]+\/(?:archive|restore|trash|restore-deleted)$/],
  ['POST', /^\/api\/knowledge\/exam-focuses\/[^/]+\/(?:confirm|archive|restore|trash|restore-deleted)$/],
  ['POST', /^\/api\/knowledge\/questions\/[^/]+\/(?:validate|submit-review|confirm|archive|restore|trash|restore-deleted)$/],
  ['POST', /^\/api\/ai\/actions(?:\/drafts|\/[^/]+\/(?:approve|apply|cancel|reject|undo-preview))?$/],
  ['POST', /^\/api\/ai\/conversations$/],
  ['POST', /^\/api\/ai\/conversations\/[^/]+\/messages$/],
  ['POST', /^\/api\/ai\/conversations\/[^/]+\/attachments$/],
  ['DELETE', /^\/api\/ai\/conversations\/[^/]+\/attachments\/[^/]+$/],
  ['POST', /^\/api\/ai\/conversations\/[^/]+\/turns\/[^/]+\/(?:cancel|retry|resume)$/],
  ['POST', /^\/api\/ai\/access-policies$/],
  ['PATCH', /^\/api\/ai\/access-policies\/[^/]+$/],
  ['POST', /^\/api\/ai\/assistant\/preview$/],
  ['POST', /^\/api\/ai\/assistant\/jobs$/],
  ['POST', /^\/api\/ai\/assistant\/jobs\/[^/]+\/cancel$/],
  // 该 POST 只计算预览，不保存分析范围或触发 AI。
  ['POST', /^\/api\/knowledge\/analysis-scopes\/preview$/],
  ['POST', /^\/api\/knowledge\/items$/],
  ['POST', /^\/api\/knowledge\/items\/[^/]+\/evidence(?:\/[^/]+\/(?:retire|readopt))?$/],
  ['PATCH', /^\/api\/knowledge\/items\/[^/]+$/],
  ['POST', /^\/api\/knowledge\/items\/[^/]+\/(?:confirm|archive|restore|trash|restore-deleted)$/],
  ['DELETE', /^\/api\/storage\/attachments\/[^/]+$/],
  ['POST', /^\/api\/storage\/attachments$/],
  ['POST', /^\/api\/storage\/attachments\/[^/]+\/(?:verify|restore)$/],
  ['POST', /^\/api\/storage\/attachments\/cleanup\/retry$/],
  ['POST', /^\/api\/storage\/attachments\/[^/]+\/rename$/],
  ['POST', /^\/api\/knowledge\/annotations(?:\/[^/]+\/(?:restore|exclusions|confirm-range))?$/],
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

/** 人工训练资产与笔记可本地保存；永久删除仍需单独权威入口。 */
export function permitsLocalRoute(method, pathname) {
  if (READ_METHODS.has(method)) return true;
  if (/\/(permanent|recycle-bin)(\/|$)/.test(pathname)) return false;
  return MUTATIONS.some(([allowedMethod, pattern]) => method === allowedMethod && pattern.test(pathname));
}

export function sendRuntimeError(response, status, code, message) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify({ error: { code, message } }));
}
