import { toQueryObject } from '../../../http/request.js';
import { sendJson } from '../../../http/response.js';
import { createAppError } from '../../../errors/app-error.js';

function decode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    throw createAppError('ROUTE_PARAMETER_INVALID', 'Route parameter is invalid', 400);
  }
}

export async function handleNoteVersionRoute({ request, response, url, knowledge }) {
  const listMatch = url.pathname.match(/^\/api\/knowledge\/notes\/([^/]+)\/versions$/);
  if (request.method === 'GET' && listMatch) {
    sendJson(response, 200, { data: await knowledge.listNoteVersions({ id: decode(listMatch[1]) }, toQueryObject(url)) });
    return true;
  }
  const detailMatch = url.pathname.match(/^\/api\/knowledge\/notes\/([^/]+)\/versions\/([^/]+)$/);
  if (request.method === 'GET' && detailMatch) {
    sendJson(response, 200, { data: await knowledge.getNoteVersion({ id: decode(detailMatch[1]), versionId: decode(detailMatch[2]) }) });
    return true;
  }
  return false;
}
