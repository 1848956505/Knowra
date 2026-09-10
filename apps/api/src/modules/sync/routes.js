import { parseBody, toQueryObject } from '../../http/request.js';
import { sendJson } from '../../http/response.js';
import { syncError } from './journal.js';

export async function handleSyncRoute({ request, response, url, sync }) {
  if (!url.pathname.startsWith('/api/sync/')) return false;
  if (!sync) throw syncError('SYNC_UNAVAILABLE', '此运行服务尚未启用云端同步存储。', 503);
  const handlers = {
    'GET /api/sync/device': () => sync.device(toQueryObject(url)),
    'GET /api/sync/status': () => sync.status(),
    'POST /api/sync/bootstrap': () => sync.bootstrap(),
    'GET /api/sync/snapshot': () => sync.snapshot(toQueryObject(url)),
    'POST /api/sync/snapshot-release': async () => sync.releaseSnapshot(await parseBody(request)),
    'GET /api/sync/changes': () => sync.changes(toQueryObject(url)),
    'POST /api/sync/batch': async () => sync.pushBatch(await parseBody(request, { limitBytes: 16 * 1024 * 1024 })),
    'POST /api/sync/blobs': async () => sync.uploadBlob(await parseBody(request, { limitBytes: 9 * 1024 * 1024 })),
    'POST /api/sync/push': async () => sync.push(await parseBody(request))
  };
  const handler = handlers[`${request.method} ${url.pathname}`];
  if (!handler) return false;
  sendJson(response, 200, { data: await handler() });
  return true;
}
