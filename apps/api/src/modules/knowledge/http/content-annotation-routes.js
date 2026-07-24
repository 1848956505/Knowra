import { parseBody, toQueryObject } from '../../../http/request.js';
import { sendJson } from '../../../http/response.js';

export async function handleContentAnnotationRoute({ request, response, url, knowledge }) {
  const root = '/api/knowledge/annotations';
  if (request.method === 'POST' && url.pathname === root) { sendJson(response, 201, { data: knowledge.createAnnotation(await parseBody(request)) }); return true; }
  if (request.method === 'GET' && url.pathname === root) { sendJson(response, 200, { data: knowledge.listAnnotations(toQueryObject(url)) }); return true; }
  const match = url.pathname.match(/^\/api\/knowledge\/annotations\/([^/]+)(?:\/(restore|anchor))?$/);
  if (!match) return false;
  const [, encodedId, action] = match; const id = decodeURIComponent(encodedId);
  if (request.method === 'GET' && !action) { sendJson(response, 200, { data: knowledge.getAnnotation({ id }) }); return true; }
  if (request.method === 'DELETE' && !action) { sendJson(response, 200, { data: knowledge.deleteAnnotation({ id }) }); return true; }
  if (request.method === 'POST' && action === 'restore') { sendJson(response, 200, { data: knowledge.restoreAnnotation({ id }) }); return true; }
  if (request.method === 'PATCH' && action === 'anchor') { sendJson(response, 200, { data: knowledge.updateAnnotationAnchor({ id }, await parseBody(request)) }); return true; }
  return false;
}
