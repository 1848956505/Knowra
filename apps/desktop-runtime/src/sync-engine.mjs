import { applyEntityRemote, nextEntityUpload, acknowledgeEntityUpload, getEntitySyncState, resolveEntityConflict } from './entity-sync-state.mjs';
import { applyRemote, nextUpload, acknowledge, getSyncState, resolveConflict, readMeta, writeMeta } from './sync-state.mjs';

export function createSyncEngine(store, { fetcher = fetch, intervalMs = 15000, noteService, autoSync = true, entityTransfer = null } = {}) {
  let authorization = '';
  const full = Boolean(entityTransfer);
  let running = null;
  let closed = false;
  let phase = 'not-configured';
  let error = null;
  let failures = 0;
  let retryAt = 0;
  let wakeTimer;
  const meta = key => store.readSync(db => readMeta(db, key));
  async function request(route, body, serverUrl = meta('serverUrl')) {
    const response = await fetcher(`${serverUrl}/api/sync/${route}`, {
      method: body === undefined ? 'GET' : 'POST', redirect: 'error',
      headers: { ...(authorization ? { Authorization: authorization } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const failure = new Error(data.error?.message ?? (response.status === 401 ? '请重新输入云端登录凭据。' : `云端请求失败（${response.status}）。`));
      failure.code = data.error?.code === 'SYNC_DEVICE_NOT_ENABLED' ? data.error.code : response.status === 401 || response.status === 403 ? 'AUTH_REQUIRED' : data.error?.code ?? 'NETWORK_ERROR';
      failure.status = response.status;
      const retryAfter = response.headers.get('retry-after');
      failure.retryAfterMs = retryAfter ? Math.max(0, /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : Date.parse(retryAfter) - Date.now()) : 0;
      throw failure;
    }
    if (!data.data) throw new Error('云端返回了无法识别的同步响应。');
    return data.data;
  }
  async function receive(entries, cursor, epoch, reset = false) {
    if (!full) { applyRemote(store, entries, cursor, epoch, { reset }); return true; }
    const missing = store.readSync((db, state) => state.attachments.filter(item => ['missing', 'corrupt', 'failed'].includes(item.status)).flatMap(item => {
      const row = db.prepare("SELECT * FROM sync_base WHERE collection = 'attachments' AND id = ?").get(item.id);
      return row ? [{ collection: 'attachments', id: item.id, revision: row.server_revision, value: JSON.parse(row.payload) }] : [];
    }));
    for (const entry of [...entries, ...missing]) if (entry.collection === 'attachments' && entry.value?.status === 'ready') {
      try { entityTransfer.verify(entry.value); }
      catch {
        store.syncTransaction(db => writeMeta(db, 'attachmentPending', entry.id));
        const response = await fetcher(`${meta('serverUrl')}/api/storage/attachments/${encodeURIComponent(entry.id)}/content`, {
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
      store.syncTransaction(db => writeMeta(db, 'bootstrap', download));
    }
    while (download.offset !== null) {
      const page = await request(`snapshot?snapshotId=${encodeURIComponent(download.snapshotId)}&offset=${download.offset}`);
      const offset = download.offset;
      if (download.pages) download.pages.push(offset); else download.entries.push(...page.entries);
      download.offset = page.nextOffset;
      store.syncTransaction(db => {
        if (download.pages) writeMeta(db, `bootstrapPage:${offset}`, page.entries);
        writeMeta(db, 'bootstrap', download);
      });
    }
    if (download.pages) download.entries = store.readSync(db => download.pages.flatMap(offset => readMeta(db, `bootstrapPage:${offset}`) ?? []));
    if (download.entries.length !== download.count) throw new Error('云端快照不完整，请重试。');
    const applied = await receive(download.entries, download.cursor, download.datasetEpoch, true);
    if (download.pages) store.syncTransaction(db => db.prepare("DELETE FROM metadata WHERE key LIKE 'sync:bootstrapPage:%'").run());
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
          store.syncTransaction(db => {
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
      const operation = nextEntityUpload(store);
      if (!operation) return;
      for (const entry of operation.changes) if (entry.collection === 'attachments' && entry.value) {
        const content = entityTransfer.read(entry.value);
        await request('blobs', { deviceId: operation.deviceId, attachment: entry.value, contentBase64: content.toString('base64') });
      }
      let result;
      try { result = await request('batch', operation); }
      catch (failure) {
        if ([400, 413, 415, 422].includes(failure.status) || ['DEPENDENCY_MISSING', 'ENTITY_DELETED', 'SYNC_OPERATION_EXPIRED', 'SIBLING_NAME_CONFLICT'].includes(failure.code)) {
          store.syncTransaction(db => writeMeta(db, 'entityUpload', null));
        }
        throw failure;
      }
      acknowledgeEntityUpload(store, operation, result);
      if (result.status === 'conflict') return;
    }
  }
  async function upload() {
    // 一轮有界，编辑中产生的后继修改下一轮继续。
    for (let count = 0; count < 100; count++) {
      const operation = nextUpload(store);
      if (!operation) return;
      await sendOperation(operation);
    }
  }
  async function cycle() {
    if (!meta('serverUrl') || closed) return;
    if (meta('clientPaused')) { phase = 'disconnected'; return; }
    phase = 'syncing'; error = null;
    try {
      const info = await request('status');
      if (info.protocolVersion !== 1 || info.scope !== 'notes' || (full && (info.entitySchemaVersion !== 5 || !info.capabilities?.includes('atomic-entities-v2')))) {
        const failure = new Error('云端同步协议不兼容，请升级应用。'); failure.code = 'PROTOCOL_UNSUPPORTED'; throw failure;
      }
      if (meta('ownerId') && info.ownerId !== meta('ownerId')) throw new Error('云端所属资料库已改变，请使用独立本地资料目录。');
      store.syncTransaction(db => writeMeta(db, 'ownerId', info.ownerId));
      if (full) {
        const device = await request(`device?deviceId=${encodeURIComponent(store.getStatus().deviceId)}`);
        store.syncTransaction(db => writeMeta(db, 'entitySequence', Math.max(meta('entitySequence') ?? 0, device.sequence)));
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
      if (!pending && !meta('attachmentPending')) store.syncTransaction(db => writeMeta(db, 'lastSyncedAt', new Date().toISOString()));
      failures = 0; retryAt = 0;
      phase = (getSyncState(store).conflicts.length || (full && getEntitySyncState(store).entityConflict)) ? 'conflict' : pending ? 'pending' : 'synced';
    } catch (failure) {
      error = { code: failure.code ?? 'NETWORK_ERROR', message: failure.message };
      if (['CURSOR_EXPIRED', 'DATASET_CHANGED'].includes(failure.code)) {
        store.syncTransaction(db => { writeMeta(db, 'cursor', null); writeMeta(db, 'bootstrap', null); });
      }
      phase = failure.code === 'AUTH_REQUIRED' ? 'auth-required' : 'paused';
      failures++;
      retryAt = Date.now() + Math.max(Math.min(300000, 1000 * 2 ** Math.min(failures, 8)) + Math.random() * 1000, failure.retryAfterMs || 0);
    }
  }
  function sync() {
    if (!running) running = cycle().finally(() => { running = null; });
    return running;
  }
  const timer = autoSync ? setInterval(() => {
    if (phase !== 'auth-required' && error?.code !== 'PROTOCOL_UNSUPPORTED' && Date.now() >= retryAt) void sync();
  }, intervalMs) : null;
  timer?.unref();
  if (autoSync) queueMicrotask(() => { void sync(); });
  return {
    status: () => ({ ...getSyncState(store), ...(full ? getEntitySyncState(store) : {}), attachmentPending: meta('attachmentPending'), deviceId: store.getStatus().deviceId, phase, error }),
    async configure({ serverUrl, username = '', password = '' }) {
      if (running) await running;
      const url = new URL(serverUrl);
      if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('请输入不含账号、路径或参数的云端服务地址。');
      if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))) throw new Error('云端地址必须使用 HTTPS。');
      if (meta('serverUrl') && meta('serverUrl') !== url.origin) throw new Error('此本地资料库已绑定其他服务，请新建独立资料目录。');
      authorization = username ? `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}` : '';
      const info = await request('status', undefined, url.origin);
      if (info.protocolVersion !== 1 || info.scope !== 'notes' || (full && (info.entitySchemaVersion !== 5 || !info.capabilities?.includes('atomic-entities-v2')))) throw new Error('云端同步协议不兼容，请升级应用。');
      if (meta('ownerId') && info.ownerId !== meta('ownerId')) throw new Error('云端所属资料库已改变，请使用独立本地资料目录。');
      store.syncTransaction(db => { writeMeta(db, 'serverUrl', url.origin); writeMeta(db, 'clientPaused', false); });
      await sync();
      return this.status();
    },
    async disconnect() {
      if (running) await running;
      authorization = ''; store.syncTransaction(db => writeMeta(db, 'clientPaused', true));
      phase = 'disconnected'; error = null; return this.status();
    },
    sync,
    wake() {
      if (!autoSync || closed || phase === 'auth-required' || error?.code === 'PROTOCOL_UNSUPPORTED') return;
      clearTimeout(wakeTimer);
      wakeTimer = setTimeout(() => { void sync(); }, 500);
      wakeTimer.unref();
    },
    recovery: () => store.readSync((db, state) => [
      ...(full ? [{ kind: 'pending-local-data', exportedAt: new Date().toISOString(), snapshot: structuredClone(state), conflict: readMeta(db, 'entityConflict'), upload: readMeta(db, 'entityUpload') }] : []),
      ...db.prepare('SELECT payload FROM sync_recovery ORDER BY rowid DESC').all().map(row => JSON.parse(row.payload))
    ]),
    async retry() { store.syncTransaction(db => writeMeta(db, 'blocked', {})); await sync(); return this.status(); },
    async resolve(input) {
      if (running) await running;
      if (full && input.conflictId) resolveEntityConflict(store, input, noteService);
      else resolveConflict(store, input, noteService);
      await sync();
      return this.status();
    },
    async close() { closed = true; clearInterval(timer); clearTimeout(wakeTimer); if (running) await running; }
  };
}
