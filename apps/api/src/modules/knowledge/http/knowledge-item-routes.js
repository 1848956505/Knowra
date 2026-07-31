import { parseBody, toQueryObject } from '../../../http/request.js';
import { sendJson } from '../../../http/response.js';
import { createAppError } from '../../../errors/app-error.js';

function decode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    throw createAppError('ROUTE_PARAMETER_INVALID', 'Route parameter is invalid', 400);
  }
}

export async function handleKnowledgeItemRoute({ request, response, url, knowledge }) {
  const root = '/api/knowledge/items';
  if (request.method === 'GET' && url.pathname === root) {
    const query = toQueryObject(url);
    const data = query.view === 'workspace'
      ? await knowledge.listWorkspaceKnowledgeItems(query)
      : await knowledge.listKnowledgeItems(query);
    sendJson(response, 200, { data });
    return true;
  }
  if (request.method === 'POST' && url.pathname === root) {
    sendJson(response, 201, { data: await knowledge.createKnowledgeItem(await parseBody(request)) });
    return true;
  }

  const actionMatch = url.pathname.match(/^\/api\/knowledge\/items\/([^/]+)\/(confirm|needs-revision|archive|restore|evidence)$/);
  if (actionMatch) {
    const id = decode(actionMatch[1]);
    const action = actionMatch[2];
    if (action === 'evidence' && request.method === 'GET') {
      sendJson(response, 200, { data: await knowledge.listKnowledgeEvidence({ id }) });
      return true;
    }
    if (action === 'evidence' && request.method === 'POST') {
      sendJson(response, 201, { data: await knowledge.createKnowledgeEvidence({ id }, await parseBody(request)) });
      return true;
    }
    if (request.method === 'POST' && action === 'confirm') {
      sendJson(response, 200, { data: await knowledge.confirmKnowledgeItem({ id }) });
      return true;
    }
    if (request.method === 'POST' && action === 'needs-revision') {
      sendJson(response, 200, { data: await knowledge.markKnowledgeItemNeedsRevision({ id }) });
      return true;
    }
    if (request.method === 'POST' && action === 'archive') {
      sendJson(response, 200, { data: await knowledge.archiveKnowledgeItem({ id }) });
      return true;
    }
    if (request.method === 'POST' && action === 'restore') {
      sendJson(response, 200, { data: await knowledge.restoreKnowledgeItem({ id }) });
      return true;
    }
    return false;
  }

  const detailMatch = url.pathname.match(/^\/api\/knowledge\/items\/([^/]+)$/);
  if (!detailMatch) return false;
  const id = decode(detailMatch[1]);
  if (request.method === 'GET') {
    sendJson(response, 200, { data: await knowledge.getKnowledgeItem({ id }) });
    return true;
  }
  if (request.method === 'PATCH') {
    sendJson(response, 200, { data: await knowledge.updateKnowledgeItem({ id }, await parseBody(request)) });
    return true;
  }
  return false;
}
