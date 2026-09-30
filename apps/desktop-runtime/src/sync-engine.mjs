import { KNOWLEDGE_SYNC_CAPABILITY, KNOWLEDGE_COLLECTIONS } from '../../api/src/modules/sync/entity-contract.js';
import { applyEntityRemote, nextEntityUpload, acknowledgeEntityUpload, getEntitySyncState, resolveEntityConflict } from './entity-sync-state.mjs';
import { applyRemote, nextUpload, acknowledge, getSyncState, resolveConflict, readMeta, writeMeta } from './sync-state.mjs';
import { createSyncScheduler } from './sync-scheduler.mjs';

function syncTransportError(failure) {
  const causes = [failure];
  const codes = new Set();
  const seen = new Set();
  for (let index = 0; index < causes.length; index++) {
    const current = causes[index];
    if (!current || typeof current !== 'object' || seen.has(current)) continue;
    seen.add(current);
    if (typeof current.code === 'string') codes.add(current.code);
    if (current.cause) causes.push(current.cause);
    if (Array.isArray(current.errors)) causes.push(...current.errors);
  }
  let code = 'SYNC_NETWORK_UNAVAILABLE';
  let message = '无法连接云端，请检查网络、代理或服务地址后重试。';
  if (failure?.name === 'TimeoutError' || codes.has('ETIMEDOUT') || codes.has('UND_ERR_CONNECT_TIMEOUT')) {
    code = 'SYNC_NETWORK_TIMEOUT';
    message = '连接云端超时，请检查网络后重试。';
  } else if (codes.has('ENOTFOUND') || codes.has('EAI_AGAIN')) {
    code = 'SYNC_NETWORK_DNS';
    message = '无法解析云端服务地址，请检查网络、DNS 或服务地址后重试。';
  } else if ([...codes].some(value => value.startsWith('CERT_') || value.startsWith('ERR_TLS_CERT_') || ['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN'].includes(value))) {
    code = 'SYNC_NETWORK_TLS';
    message = '无法验证云端安全证书，请检查系统时间或云端证书。';
  } else if (codes.has('ECONNREFUSED')) {
    code = 'SYNC_CONNECTION_REFUSED';
    message = '云端服务拒绝连接，请检查服务是否可用后重试。';
  } else if (codes.has('ECONNRESET')) {
    code = 'SYNC_CONNECTION_INTERRUPTED';
    message = '云端连接中断，请检查网络后重试。';
  }
  const error = new Error(message);
  error.code = code;
  return error;
}

export function createSyncEngine(store, { fetcher = fetch, intervalMs = 15000, noteService, autoSync = true, entityTransfer = null, clock } = {}) {
  let authorization = '';
  const full = Boolean(entityTransfer);
  let closed = false;
  let phase = 'not-configured';
  let error = null;
  let failures = 0;
  let retryAt = 0;
  let lastCheckedAt = null;
  let changed = false;
  let more = false;
  let missingAttachments = { revision: -1, entries: [] };
  const meta = key => store.readSync(db => readMeta(db, key));
  async function fetchSync(url, options) {
    try { return await fetcher(url, options); }
    catch (failure) { throw syncTransportError(failure); }
  }
  async function request(route, body, serverUrl = meta('serverUrl')) {
    const response = await fetchSync(`${serverUrl}/api/sync/${route}`, {
      method: body === undefined ? 'GET' : 'POST', redirect: 'error',
      headers: { ...(authorization ? { Authorization: authorization } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const authRequired = response.status === 401 || response.status === 403;
      const deviceNotEnabled = data.error?.code === 'SYNC_DEVICE_NOT_ENABLED';
      const failure = new Error(deviceNotEnabled ? data.error?.message ?? '此设备尚未获准同步。'
        : authRequired ? '云端登录凭据无效或已失效，请重新输入。'
        : data.error?.message ?? (response.status >= 500 ? `云端服务暂不可用（${response.status}），请稍后重试。` : `云端请求失败（${response.status}）。`));
      failure.code = deviceNotEnabled ? data.error.code : authRequired ? 'AUTH_REQUIRED'
        : data.error?.code ?? (response.status >= 500 ? 'CLOUD_SERVICE_UNAVAILABLE' : 'CLOUD_REQUEST_FAILED');
      failure.status = response.status;
      const retryAfter = response.headers.get('retry-after');
      failure.retryAfterMs = retryAfter ? Math.max(0, /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : Date.parse(retryAfter) - Date.now()) : 0;
      throw failure;
    }
    if (!data.data) { const failure = new Error('云端返回了无法识别的同步响应，请稍后重试。'); failure.code = 'SYNC_INVALID_RESPONSE'; throw failure; }
    return data.data;
  }
  async function receive(entries, cursor, epoch, reset = false) {
    if (!full) { applyRemote(store, entries, cursor, epoch, { reset }); return true; }
    const revision = store.getEntityCacheKey();
    if (missingAttachments.revision !== revision) missingAttachments = { revision, entries: store.readSync((db, state) => state.attachments.filter(item => ['missing', 'corrupt', 'failed'].includes(item.status)).flatMap(item => {
      const row = db.prepare("SELECT * FROM sync_base WHERE collection = 'attachments' AND id = ?").get(item.id);
      return row ? [{ collection: 'attachments', id: item.id, revision: row.server_revision, value: JSON.parse(row.payload) }] : [];
    })) };
    for (const entry of [...entries, ...missingAttachments.entries]) if (entry.collection === 'attachments' && entry.value?.status === 'ready') {
      try { entityTransfer.verify(entry.value); }
      catch {
        store.metadataTransaction(db => writeMeta(db, 'attachmentPending', entry.id));
        const response = await fetchSync(`${meta('serverUrl')}/api/storage/attachments/${encodeURIComponent(entry.id)}/content`, {
          headers: authorization ? { Authorization: authorization } : {}, redirect: 'error', signal: AbortSignal.timeout(30000)
        });
        if (!response.ok) {
          const failure = new Error(`附件下载失败（${response.status}），已保留待传输任务。`);
          if ([401, 403].includes(response.status)) failure.code = 'AUTH_REQUIRED'; throw failure;
        }
        const reader = response.body.getReader(); const chunks = []; let total = 0;
        for (;;) {
          const { done, value } = await reader.read(); if (done) break;
          total += value.byteLength;
          if (total > 6 * 1024 * 1024) { await reader.cancel(); throw new Error('附件下载超过支持的体积，已停止传输。'); }
          chunks.push(value);
        }
        const bytes = Buffer.concat(chunks, total);
        entityTransfer.put({ attachment: entry.value, contentBase64: bytes.toString('base64') });
        store.syncTransaction((db, state) => {
          writeMeta(db, 'attachmentPending', null);
          const local = state.attachments.find(item => item.id === entry.id);
          if (local?.sha256 === entry.value.sha256 && ['missing', 'corrupt', 'failed'].includes(local.status)) {
            local.status = 'ready'; local.verifiedAt = new Date().toISOString();
          }
        });
      }
    }
    return applyEntityRemote(store, entries, cursor, epoch, { reset });
  }
  async function bootstrap() {
    let download = meta('bootstrap');
    if (!download) {
      const start = await request('bootstrap', {});
      download = { ...start, entries: [], offset: 0, ...(full ? { pages: [] } : {}) };
      store.metadataTransaction(db => writeMeta(db, 'bootstrap', download));
    }
    while (download.offset !== null) {
      const page = await request(`snapshot?snapshotId=${encodeURIComponent(download.snapshotId)}&offset=${download.offset}`);
      const offset = download.offset;
      if (download.pages) download.pages.push(offset); else download.entries.push(...page.entries);
      download.offset = page.nextOffset;
      store.metadataTransaction(db => {
        if (download.pages) writeMeta(db, `bootstrapPage:${offset}`, page.entries);
        writeMeta(db, 'bootstrap', download);
      });
    }
    if (download.pages) download.entries = store.readSync(db => download.pages.flatMap(offset => readMeta(db, `bootstrapPage:${offset}`) ?? []));
    if (download.entries.length !== download.count) throw new Error('云端快照不完整，请重试。');
    const applied = await receive(download.entries, download.cursor, download.datasetEpoch, true);
    if (download.pages) store.metadataTransaction(db => db.prepare("DELETE FROM metadata WHERE key LIKE 'sync:bootstrapPage:%'").run());
    if (full) await request('snapshot-release', { snapshotId: download.snapshotId }).catch(() => undefined);
    return applied;
  }
  async function pull() {
    for (;;) {
      const page = await request(`changes?cursor=${encodeURIComponent(meta('cursor'))}`);
      if (!await receive(page.groups.flatMap(group => group.items), page.cursor, page.datasetEpoch)) return false;
      if (!page.hasMore) return true;
    }
  }
  async function sendOperation(operation) {
      try { acknowledge(store, operation, await request('push', operation)); }
      catch (failure) {
        if (['DEPENDENCY_MISSING', 'NOTE_DELETED', 'SIBLING_NAME_CONFLICT'].includes(failure.code) || [400, 413, 415, 422].includes(failure.status)) {
          store.metadataTransaction(db => {
            const blocked = meta('blocked') ?? {};
            blocked[operation.noteId] = { noteId: operation.noteId, title: operation.value.title, value: JSON.stringify(operation.value), message: failure.message };
            writeMeta(db, 'blocked', blocked);
            db.prepare('DELETE FROM sync_uploads WHERE note_id = ?').run(operation.noteId);
          });
        } else throw failure;
      }
  }
  async function uploadEntities() {
    for (let count = 0; count < 20; count++) {
      const knowledgeSupported = meta('capabilities')?.includes(KNOWLEDGE_SYNC_CAPABILITY) ?? false;
      const operation = nextEntityUpload(store, { knowledgeSupported });
      if (!operation) return;
      if (!knowledgeSupported && operation.changes.some(entry => KNOWLEDGE_COLLECTIONS.includes(entry.collection))) {
        const failure = new Error('云端尚不支持知识同步，知识已保存在本机；请升级云端后重试。');
        failure.code = 'SYNC_KNOWLEDGE_UNSUPPORTED'; throw failure;
      }
      for (const entry of operation.changes) if (entry.collection === 'attachments' && entry.value) {
        const content = entityTransfer.read(entry.value);
        await request('blobs', { deviceId: operation.deviceId, attachment: entry.value, contentBase64: content.toString('base64') });
      }
      let result;
      try { result = await request('batch', operation); }
      catch (failure) {
        if ([400, 413, 415, 422].includes(failure.status) || ['DEPENDENCY_MISSING', 'ENTITY_DELETED', 'SYNC_OPERATION_EXPIRED', 'SIBLING_NAME_CONFLICT'].includes(failure.code)) {
          store.metadataTransaction(db => writeMeta(db, 'entityUpload', null));
        }
        throw failure;
      }
      acknowledgeEntityUpload(store, operation, result);
      if (result.status === 'conflict') return;
    }
    more = true;
  }
  async function upload() {
    // 一轮有界，编辑中产生的后继修改下一轮继续。
    for (let count = 0; count < 100; count++) {
      if (!getSyncState(store).pendingNotes) return;
      const operation = nextUpload(store);
      if (!operation) return;
      await sendOperation(operation);
    }
    more = true;
  }
  async function cycle() {
    changed = false; more = false;
    if (!meta('serverUrl') || closed) return;
    if (meta('clientPaused')) { phase = 'disconnected'; return; }
    phase = 'syncing'; error = null;
    const startKey = store.getSyncCacheKey();
    const hadPending = full ? getEntitySyncState(store).pendingEntities : getSyncState(store).pendingNotes;
    try {
      const info = await request('status');
      if (info.protocolVersion !== 1 || info.scope !== 'notes' || (full && (info.entitySchemaVersion !== 6 || !info.capabilities?.includes('atomic-entities-v2')))) {
        const failure = new Error('同步格式已升级，请更新应用。'); failure.code = 'PROTOCOL_UNSUPPORTED'; throw failure;
      }
      if (meta('ownerId') && info.ownerId !== meta('ownerId')) throw new Error('云端所属资料库已改变，请使用独立本地资料目录。');
      store.metadataTransaction(db => { writeMeta(db, 'ownerId', info.ownerId); writeMeta(db, 'capabilities', info.capabilities ?? []); });
      if (full) {
        const device = await request(`device?deviceId=${encodeURIComponent(store.getStatus().deviceId)}`);
        store.metadataTransaction(db => writeMeta(db, 'entitySequence', Math.max(meta('entitySequence') ?? 0, device.sequence)));
      }
      if (meta('epoch') && meta('epoch') !== info.datasetEpoch && !await bootstrap()) { phase = 'conflict'; return; }
      // 先确认上次断线前已发送的不可变请求，再进行常规拉取。
      const frozen = store.readSync(db => db.prepare('SELECT request FROM sync_uploads').all());
      for (const row of frozen) {
        const operation = JSON.parse(row.request);
        await sendOperation(operation);
      }
      if (!meta('cursor') && !await bootstrap() && full) { phase = 'conflict'; return; }
      if (full && meta('entityUpload')) await uploadEntities();
      if (!await pull()) { if (full) await uploadEntities(); phase = 'conflict'; return; }
      if (full) await uploadEntities(); else await upload();
      if (!await pull()) { if (full) await uploadEntities(); phase = 'conflict'; return; }
      const pending = full ? getEntitySyncState(store).pendingEntities : getSyncState(store).pendingNotes;
      changed = startKey !== store.getSyncCacheKey();
      lastCheckedAt = new Date().toISOString();
      if (!pending && !meta('attachmentPending') && !getSyncState(store).conflicts.length && !(full && getEntitySyncState(store).entityConflict)
        && (changed || hadPending || !meta('lastSyncedAt'))) store.metadataTransaction(db => writeMeta(db, 'lastSyncedAt', lastCheckedAt));
      if (full && getEntitySyncState(store).pendingKnowledgeEntities && !info.capabilities?.includes(KNOWLEDGE_SYNC_CAPABILITY)) {
        error = { code: 'SYNC_KNOWLEDGE_UNSUPPORTED', message: '云端尚不支持知识同步，知识已保存在本机；请升级云端后重试。' };
      }
      failures = 0; retryAt = 0;
      phase = (getSyncState(store).conflicts.length || (full && getEntitySyncState(store).entityConflict)) ? 'conflict' : pending ? 'pending' : 'synced';
    } catch (failure) {
      error = { code: failure.code ?? 'NETWORK_ERROR', message: failure.message };
      if (['CURSOR_EXPIRED', 'DATASET_CHANGED'].includes(failure.code)) {
        store.metadataTransaction(db => { writeMeta(db, 'cursor', null); writeMeta(db, 'bootstrap', null); });
      }
      phase = failure.code === 'AUTH_REQUIRED' ? 'auth-required' : 'paused';
      failures++;
      retryAt = (clock?.now() ?? Date.now()) + Math.max(Math.min(300000, 1000 * 2 ** Math.min(failures, 8)) + Math.random() * 1000, failure.retryAfterMs || 0);
    }
  }
  const scheduler = createSyncScheduler({ run: cycle, autoSync, intervalMs, clock, policy: () => ({
    stopped: closed || !meta('serverUrl') || meta('clientPaused') || phase === 'auth-required' || error?.code === 'PROTOCOL_UNSUPPORTED',
    retryAt, changed, more
  }) });
  const sync = () => scheduler.sync();
  const unsubscribe = store.onLocalCommit(() => scheduler.wake('local'));
  scheduler.start();
  return {
    async budgetRequest(route, body) {
      const serverUrl = meta('serverUrl');
      if (!serverUrl || meta('clientPaused') || closed) {
        const failure = new Error('云端预算权威不可用，已阻止模型调用。'); failure.code = 'AI_BUDGET_UNAVAILABLE'; throw failure;
      }
      const response = await fetcher(`${serverUrl}/api/ai/budget/${route}`, {
        method: body === undefined ? 'GET' : 'POST', redirect: 'error',
        headers: { ...(authorization ? { Authorization: authorization } : {}),
          'X-Knowra-AI-Budget': '1', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.data) {
        const failure = new Error(data.error?.message ?? '云端预算权威不可用，已阻止模型调用。');
        failure.code = data.error?.code ?? 'AI_BUDGET_UNAVAILABLE'; throw failure;
      }
      return data.data;
    },
    status: () => ({ ...getSyncState(store), ...(full ? getEntitySyncState(store) : {}), lastCheckedAt, knowledgeSyncSupported: meta('capabilities')?.includes(KNOWLEDGE_SYNC_CAPABILITY) ?? null, attachmentPending: meta('attachmentPending'), deviceId: store.getStatus().deviceId, phase, error }),
    async configure({ serverUrl, username = '', password = '' }) {
      await scheduler.wait();
      const url = new URL(serverUrl);
      if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('请输入不含账号、路径或参数的云端服务地址。');
      if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))) throw new Error('云端地址必须使用 HTTPS。');
      if (meta('serverUrl') && meta('serverUrl') !== url.origin) throw new Error('此本地资料库已绑定其他服务，请新建独立资料目录。');
      authorization = username ? `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}` : '';
      let info;
      try { info = await request('status', undefined, url.origin); }
      catch (failure) {
        if (meta('serverUrl')) {
          error = { code: failure.code ?? 'SYNC_ACTION_FAILED', message: failure.message };
          phase = failure.code === 'AUTH_REQUIRED' ? 'auth-required' : 'paused';
        }
        throw failure;
      }
      if (info.protocolVersion !== 1 || info.scope !== 'notes' || (full && (info.entitySchemaVersion !== 6 || !info.capabilities?.includes('atomic-entities-v2')))) throw new Error('同步格式已升级，请更新应用。');
      if (meta('ownerId') && info.ownerId !== meta('ownerId')) throw new Error('云端所属资料库已改变，请使用独立本地资料目录。');
      store.metadataTransaction(db => { writeMeta(db, 'serverUrl', url.origin); writeMeta(db, 'clientPaused', false); });
      await sync();
      return this.status();
    },
    async disconnect() {
      scheduler.pause();
      await scheduler.wait();
      authorization = ''; store.metadataTransaction(db => writeMeta(db, 'clientPaused', true));
      scheduler.pause();
      phase = 'disconnected'; error = null; return this.status();
    },
    sync,
    wake: reason => scheduler.wake(reason),
    recovery: () => store.readSync((db, state) => [
      ...(full ? [{ kind: 'pending-local-data', exportedAt: new Date().toISOString(), snapshot: structuredClone(state), conflict: readMeta(db, 'entityConflict'), upload: readMeta(db, 'entityUpload') }] : []),
      ...db.prepare('SELECT payload FROM sync_recovery ORDER BY rowid DESC').all().map(row => JSON.parse(row.payload))
    ]),
    async retry() { store.metadataTransaction(db => writeMeta(db, 'blocked', {})); await sync(); return this.status(); },
    async resolve(input) {
      await scheduler.wait();
      if (full && input.conflictId) resolveEntityConflict(store, input, noteService, entityTransfer);
      else resolveConflict(store, input, noteService);
      await sync();
      return this.status();
    },
    async close() { closed = true; unsubscribe(); await scheduler.close(); }
  };
}
