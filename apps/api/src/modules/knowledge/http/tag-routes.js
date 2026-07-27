import { parseBody, toQueryObject } from '../../../http/request.js';
import { sendJson } from '../../../http/response.js';

export async function handleTagRoute({ request, response, url, knowledge }) {
  if (request.method === 'POST' && url.pathname === '/api/knowledge/tags') {
    const body = await parseBody(request);
    sendJson(response, 201, {
      data: await knowledge.createTag(body)
    });
    return true;
  }

  if (request.method === 'GET' && url.pathname === '/api/knowledge/tags') {
    sendJson(response, 200, {
      data: await knowledge.listTags(toQueryObject(url))
    });
    return true;
  }

  const tagMatch = url.pathname.match(/^\/api\/knowledge\/tags\/([^/]+)$/);

  if (request.method === 'PATCH' && tagMatch) {
    const tagId = tagMatch[1];
    const body = await parseBody(request);
    sendJson(response, 200, {
      data: await knowledge.updateTag({ id: decodeURIComponent(tagId) }, body)
    });
    return true;
  }

  if (request.method === 'DELETE' && tagMatch) {
    const tagId = tagMatch[1];
    sendJson(response, 200, {
      data: await knowledge.deleteTag({ id: decodeURIComponent(tagId) })
    });
    return true;
  }

  return false;
}
