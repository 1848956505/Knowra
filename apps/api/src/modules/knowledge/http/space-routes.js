import { parseBody, toQueryObject } from '../../../http/request.js';
import { sendJson } from '../../../http/response.js';

export async function handleSpaceRoute({ request, response, url, knowledge }) {
  if (request.method === 'POST' && url.pathname === '/api/knowledge/spaces/default') {
    const body = await parseBody(request);
    sendJson(response, 201, {
      data: await knowledge.createDefaultKnowledgeSpace(body)
    });
    return true;
  }

  if (request.method === 'GET' && url.pathname === '/api/knowledge/spaces') {
    sendJson(response, 200, {
      data: await knowledge.listKnowledgeSpaces(toQueryObject(url))
    });
    return true;
  }

  return false;
}
