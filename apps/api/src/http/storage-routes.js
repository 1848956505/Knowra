import { parseBody, toQueryObject } from './request.js';
import { sendBinary, sendJson } from './response.js';

export async function handleStorageRoute({ request, response, url, storage }) {
  if (request.method === 'GET' && url.pathname === '/api/storage/export') {
    sendJson(response, 200, {
      data: await storage.exportKnowledgeBase()
    });
    return true;
  }

  if (request.method === 'GET' && url.pathname === '/api/storage/attachments') {
    sendJson(response, 200, {
      data: await storage.listAttachments(toQueryObject(url))
    });
    return true;
  }

  if (request.method === 'POST' && url.pathname === '/api/storage/attachments') {
    const body = await parseBody(request);
    sendJson(response, 201, {
      data: await storage.uploadAttachment(body)
    });
    return true;
  }

  const contentAttachmentId = matchAttachmentRoute(
    url.pathname,
    'content'
  );
  if (request.method === 'GET' && contentAttachmentId !== null) {
    const payload = await storage.getAttachmentContent({
      id: contentAttachmentId
    });
    sendBinary(response, 200, payload.content, payload.attachment.mimeType, payload.attachment.fileName);
    return true;
  }

  const attachmentId = matchAttachmentRoute(url.pathname);
  if (request.method === 'DELETE' && attachmentId !== null) {
    sendJson(response, 200, {
      data: await storage.deleteAttachment({ id: attachmentId })
    });
    return true;
  }

  if (request.method === 'PATCH' && attachmentId !== null) {
    const body = await parseBody(request);
    sendJson(response, 200, {
      data: await storage.updateAttachment({ id: attachmentId }, body)
    });
    return true;
  }

  const renamedAttachmentId = matchAttachmentRoute(url.pathname, 'rename');
  if (request.method === 'POST' && renamedAttachmentId !== null) {
    const body = await parseBody(request);
    sendJson(response, 200, {
      data: await storage.updateAttachment({ id: renamedAttachmentId }, body)
    });
    return true;
  }

  if (request.method === 'POST' && url.pathname === '/api/storage/import') {
    const body = await parseBody(request);
    sendJson(response, 200, {
      data: await storage.importKnowledgeBase(body)
    });
    return true;
  }

  return false;
}

function matchAttachmentRoute(pathname, trailingSegment = null) {
  const segments = pathname.split('/');
  const expectedLength = trailingSegment ? 6 : 5;
  if (
    segments.length !== expectedLength
    || segments[0] !== ''
    || segments[1] !== 'api'
    || segments[2] !== 'storage'
    || segments[3] !== 'attachments'
    || !segments[4]
    || (trailingSegment && segments[5] !== trailingSegment)
  ) {
    return null;
  }

  try {
    const attachmentId = decodeURIComponent(segments[4]);
    if (
      !attachmentId
      || attachmentId === '.'
      || attachmentId === '..'
      || attachmentId.includes('/')
      || attachmentId.includes('\\')
    ) {
      return null;
    }
    return attachmentId;
  } catch {
    return null;
  }
}
