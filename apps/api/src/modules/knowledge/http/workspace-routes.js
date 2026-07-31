import { toQueryObject } from '../../../http/request.js';
import { sendJson } from '../../../http/response.js';

export async function handleWorkspaceRoute({ request, response, url, knowledge }) {
  if (request.method !== 'GET') return false;

  if (url.pathname === '/api/knowledge/overview') {
    sendJson(response, 200, { data: await knowledge.getKnowledgeOverview() });
    return true;
  }

  if (url.pathname === '/api/knowledge/training-overview') {
    sendJson(response, 200, { data: await knowledge.getTrainingOverview() });
    return true;
  }

  if (url.pathname === '/api/knowledge/review-queue') {
    sendJson(response, 200, { data: await knowledge.listReviewQueue(toQueryObject(url)) });
    return true;
  }

  return false;
}
