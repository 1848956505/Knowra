import { parseBody, toQueryObject } from './request.js';
import { sendBinary, sendJson } from './response.js';

export async function handleStorageRoute({ request, response, url, storage }) {
  if (request.method === 'GET' && url.pathname === '/api/storage/export') {
    sendJson(response, 200, {
      data: storage.exportKnowledgeBase()
    });
    return true;
  }

  if (request.method === 'GET' && url.pathname === '/api/storage/attachments') {
    sendJson(response, 200, {
      data: storage.listAttachments(toQueryObject(url))
    });
    return true;
  }

  if (request.method === 'POST' && url.pathname === '/api/storage/attachments') {
    const body = await parseBody(request);
    sendJson(response, 201, {
      data: storage.uploadAttachment(body)
    });
    return true;
  }

  if (request.method === 'GET' && url.pathname.startsWith('/api/storage/attachments/') && url.pathname.endsWith('/content')) {
    const attachmentId = url.pathname.split('/')[4];
    const payload = storage.getAttachmentContent({ id: decodeURIComponent(attachmentId) });
    sendBinary(response, 200, payload.content, payload.attachment.mimeType, payload.attachment.fileName);
    return true;
  }

  if (request.method === 'DELETE' && url.pathname.startsWith('/api/storage/attachments/')) {
    const attachmentId = url.pathname.split('/')[4];
    if (attachmentId && !url.pathname.endsWith('/content')) {
      sendJson(response, 200, {
        data: storage.deleteAttachment({ id: decodeURIComponent(attachmentId) })
      });
      return true;
    }
  }

  if (request.method === 'PATCH' && url.pathname.startsWith('/api/storage/attachments/')) {
    const attachmentId = url.pathname.split('/')[4];
    if (attachmentId && !url.pathname.endsWith('/content')) {
      const body = await parseBody(request);
      sendJson(response, 200, {
        data: storage.updateAttachment({ id: decodeURIComponent(attachmentId) }, body)
      });
      return true;
    }
  }

  if (request.method === 'POST' && url.pathname.startsWith('/api/storage/attachments/') && url.pathname.endsWith('/rename')) {
    const attachmentId = url.pathname.split('/')[4];
    if (attachmentId) {
      const body = await parseBody(request);
      sendJson(response, 200, {
        data: storage.updateAttachment({ id: decodeURIComponent(attachmentId) }, body)
      });
      return true;
    }
  }

  if (request.method === 'POST' && url.pathname === '/api/storage/import') {
    const body = await parseBody(request);
    sendJson(response, 200, {
      data: storage.importKnowledgeBase(body)
    });
    return true;
  }

  return false;
}
