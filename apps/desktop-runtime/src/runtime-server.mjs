import { createAttachmentTransfer } from '../../api/src/modules/sync/attachment-transfer.js';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { createAppContext } from '../../api/src/app.factory.js';
import { createServer } from '../../api/src/server.js';
import { resolveAssetPath, serveV4Asset } from '../../web-v4/server/static-assets.mjs';
import { createSqliteDataStore } from './sqlite-data-store.mjs';
import { lockDataDirectory } from './data-directory.mjs';
import { createRuntimeBackup } from './backup.mjs';
import { permitsLocalRoute, sendRuntimeError } from './runtime-policy.mjs';
import { createSyncEngine } from './sync-engine.mjs';
import { parseBody } from '../../api/src/http/request.js';

export async function startLocalRuntime({ dataDirectory, distRoot, port = 0, logger = console, syncOptions = {} } = {}) {
  if (!path.isAbsolute(dataDirectory ?? '')) throw new Error('本地数据目录必须是绝对路径。');
  if (!fs.existsSync(path.join(distRoot, 'index.html'))) throw new Error('缺少前端构建，请先运行 npm run build:web。');
  const release = lockDataDirectory(dataDirectory);
  let store;
  let server;
  let sync;
  try {
    store = createSqliteDataStore(path.join(dataDirectory, 'local.sqlite'));
    const context = createAppContext({
      dataStore: store, storageRootDir: dataDirectory,
      uploadsDir: path.join(dataDirectory, 'uploads'), ownerId: 'demo'
    });
    // 复用业务规则，但本地更新时间不能在同一毫秒内重复。
    const noteService = context.modules.knowledge.noteService;
    const updateNote = noteService.updateNote.bind(noteService);
    noteService.updateNote = (id, updates) => updateNote(id, {
      ...updates,
      updatedAt: new Date(Math.max(Date.now(), Date.parse(noteService.getNote(id, { includeDeleted: true }).updatedAt) + 1)).toISOString()
    });
    // 保留本地来源版本的稳定 ID；列表对相同正文去重，优先展示已确认的云端版本。
    const listVersions = context.http.knowledge.listNoteVersions;
    context.http.knowledge.listNoteVersions = (...args) => store.readSync(db => {
      const remoteIds = new Set(db.prepare("SELECT id FROM sync_base WHERE collection = 'noteVersions' AND payload != 'null'").all().map(row => row.id));
      const versions = listVersions(...args);
      const selected = new Map();
      for (const version of versions) {
        const previous = selected.get(version.contentHash);
        if (!previous || (!remoteIds.has(previous.id) && remoteIds.has(version.id))) selected.set(version.contentHash, version);
      }
      return versions.filter(version => selected.get(version.contentHash)?.id === version.id);
    });
    const entityTransfer = createAttachmentTransfer({ allowRepair: true, uploadsDir: path.join(dataDirectory, 'uploads'), storageRootDir: dataDirectory });
    const renameAttachment = context.http.storage.updateAttachment;
    context.http.storage.updateAttachment = (params, body) => {
      const attachment = store.state.attachments.find(item => item.id === params.id);
      if (attachment) entityTransfer.read(attachment);
      return renameAttachment(params, body);
    };
    context.http.storage.deleteAttachment = params => store.runTransaction(() => {
      const reference = `/api/storage/attachments/${params.id}/content`;
      if ([...store.state.notes.map(note => note.rawMarkdown), ...store.state.noteVersions.map(version => version.content)].some(content => content.includes(reference))) {
        const error = new Error('正文或历史版本仍引用此附件，不能删除。'); error.code = 'ATTACHMENT_REFERENCED'; error.statusCode = 409; throw error;
      }
      const index = store.state.attachments.findIndex(item => item.id === params.id);
      if (index < 0) throw new Error('附件不存在。');
      const [attachment] = store.state.attachments.splice(index, 1);
      // 同步确认与备份完成前保留文件，删除只产生元数据墓碑。
      store.flush(); return attachment;
    });
    sync = createSyncEngine(store, { ...syncOptions, noteService, entityTransfer });
    const apiServer = createServer({ appContext: context, logger });
    const handleApi = apiServer.listeners('request')[0];
    const secret = randomBytes(32).toString('hex');
    const cookieName = `knowra_local_${randomBytes(8).toString('hex')}`;
    let origin;
    let sessionClaimed = false;
    server = http.createServer(async (request, response) => {
      try {
        if (request.headers.host !== new URL(origin).host
          || (request.headers.origin && request.headers.origin !== origin)
          || request.headers['sec-fetch-site'] === 'cross-site') {
          return sendRuntimeError(response, 403, 'LOCAL_ORIGIN_REJECTED', '本地服务拒绝外部来源。');
        }
        const url = new URL(request.url, origin);
        if (request.method === 'GET' && url.pathname === `/local-session/${secret}` && !sessionClaimed) {
          sessionClaimed = true;
          response.writeHead(303, { Location: '/', 'Set-Cookie': `${cookieName}=${secret}; HttpOnly; SameSite=Strict; Path=/`, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
          response.end();
          return;
        }
        if (!(request.headers.cookie ?? '').split(';').some(part => part.trim() === `${cookieName}=${secret}`)) {
          return sendRuntimeError(response, 401, 'LOCAL_SESSION_REQUIRED', '请从本地运行入口打开应用。');
        }
        if (request.method === 'GET' && url.pathname === '/api/local-runtime/status') {
          response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          response.end(JSON.stringify({ data: store.getStatus() }));
          return;
        }
        if (url.pathname.startsWith('/api/local-runtime/sync')) {
          try {
          let result;
          if (request.method === 'GET' && url.pathname.endsWith('/sync')) result = sync.status();
          else if (request.method === 'GET' && url.pathname.endsWith('/recovery')) result = sync.recovery();
          else if (request.method === 'POST' && url.pathname.endsWith('/configure')) result = await sync.configure(await parseBody(request));
          else if (request.method === 'POST' && url.pathname.endsWith('/disconnect')) result = await sync.disconnect();
          else if (request.method === 'POST' && url.pathname.endsWith('/retry')) result = await sync.retry();
          else if (request.method === 'POST' && url.pathname.endsWith('/resolve')) result = await sync.resolve(await parseBody(request));
          else return sendRuntimeError(response, 404, 'ROUTE_NOT_FOUND', '路径不存在。');
          response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          response.end(JSON.stringify({ data: result }));
          return;
          } catch (failure) {
            return sendRuntimeError(response, 422, failure.code ?? 'SYNC_ACTION_FAILED', failure.message ?? '同步操作失败。');
          }
        }
        if (request.method === 'POST' && url.pathname === '/api/local-runtime/backup') {
          const directory = createRuntimeBackup(store, dataDirectory);
          response.writeHead(201, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          response.end(JSON.stringify({ data: { directory } }));
          return;
        }
        if (url.pathname.startsWith('/api/')) {
          if (!permitsLocalRoute(request.method, url.pathname)) {
            return sendRuntimeError(response, 409, 'LOCAL_FEATURE_UNAVAILABLE', '当前阶段尚未开放此操作，本地笔记已保留。');
          }
          await handleApi(request, response);
          if (!['GET', 'HEAD'].includes(request.method)) sync.wake();
          return;
        }
        if (['GET', 'HEAD'].includes(request.method)) {
          const asset = resolveAssetPath(url.pathname, distRoot);
          if (asset && path.basename(asset) === 'index.html') {
            const configuration = JSON.stringify({ persistenceMode: 'desktop-local', datasetId: store.getStatus().datasetId }).replaceAll('<', '\\u003c');
            const config = `<script>globalThis.knowraRuntime = Object.freeze(${configuration});</script>`;
            const html = fs.readFileSync(asset, 'utf8').replace('<head>', `<head>${config}`);
            response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
            response.end(request.method === 'HEAD' ? undefined : html);
            return;
          }
          if (serveV4Asset({ request, response, pathname: url.pathname, distRoot })) return;
        }
        sendRuntimeError(response, 404, 'ROUTE_NOT_FOUND', '路径不存在。');
      } catch (error) {
        logger.error?.('Local runtime request failed', error);
        if (!response.headersSent) sendRuntimeError(response, 500, 'LOCAL_STORAGE_FAILED', '本地操作失败，请保留当前内容并重试或导出。');
        else response.end();
      }
    });
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', resolve);
    });
    origin = `http://127.0.0.1:${server.address().port}`;
    let closed = false;
    return {
      origin, launchUrl: `${origin}/local-session/${secret}`, store,
      async close() {
        if (closed) return;
        closed = true;
        await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
        await sync.close();
        store.close();
        release();
      }
    };
  } catch (error) {
    server?.close();
    store?.close();
    release();
    throw error;
  }
}
