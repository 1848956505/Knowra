import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { mcpError } from './mcp-error.mjs';

const defaults = Object.freeze({ concurrent: 1, maxPending: 8, maxQueuedBytes: 131072, maxRequestBytes: 16384, maxRequests: 256, maxDeadlineMs: 15000 });
const keys = ['version', 'requestId', 'deviceId', 'grantId', 'grantRevision', 'datasetEpoch', 'sessionGeneration', 'deadline', 'tool', 'input'];
const textKeys = ['requestId', 'deviceId', 'grantId', 'sessionGeneration', 'datasetEpoch', 'tool'];
const fail = code => mcpError(code, '远程只读请求被拒绝或已终止。', { status: 403 });
const object = value => value && typeof value === 'object' && !Array.isArray(value);

/** 每个实例属于一个由宿主认证的连接。不监听、不联网、不签发 handle；默认关闭。
 * deliver 是宿主的同步接收端，不能异步或缓存待发送正文。调用成功只表示已交给该端，不代表网络送达。
 * 宿主后续还须限制连接总数/总预算；本模块的有限资源边界是单个实例。
 */
export function createRemoteReadBridge({ gate, handle, enabled = false, deliver, limits = {}, wallNow = Date.now, monotonicNow = () => performance.now() } = {}) {
  const cap = { ...defaults, ...limits };
  if (Object.values(cap).some(value => !Number.isSafeInteger(value) || value < 1 || value > 1000000)) throw new TypeError('远程桥限额无效。');
  if (typeof deliver !== 'function' || deliver.constructor?.name === 'AsyncFunction') throw new TypeError('发送端必须为同步函数。');
  let connected = true, active = 0, queuedBytes = 0;
  const queue = [], records = new Map();
  const open = () => { if (enabled !== true || !connected) throw fail('MCP_REMOTE_DISABLED'); };
  function parse(raw) {
    if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > cap.maxRequestBytes) throw fail('MCP_REMOTE_REQUEST_INVALID');
    let request;
    try { request = JSON.parse(raw); } catch { throw fail('MCP_REMOTE_REQUEST_INVALID'); }
    if (!object(request) || Object.keys(request).length !== keys.length || Object.keys(request).some(key => !keys.includes(key))
      || request.version !== 1 || textKeys.some(key => typeof request[key] !== 'string' || !/^[a-zA-Z0-9_.:-]{1,128}$/.test(request[key]))
      || ['grantRevision', 'deadline'].some(key => !Number.isSafeInteger(request[key]) || request[key] < 0)
      || !object(request.input)) throw fail('MCP_REMOTE_REQUEST_INVALID');
    return request;
  }
  const guard = record => {
    open();
    if (!['queued', 'running'].includes(record.status)) throw fail(record.code ?? 'MCP_REMOTE_DENIED');
    if (monotonicNow() >= record.until || wallNow() >= record.request.deadline) throw fail('MCP_REMOTE_EXPIRED');
    gate.assertRemoteRead(handle, record.request);
    return true;
  };
  function stop(record, status, code) {
    if (!['queued', 'running'].includes(record.status)) return;
    const queued = record.status === 'queued';
    record.status = status; record.code = code; clearTimeout(record.timer);
    if (queued) {
      queue.splice(queue.indexOf(record), 1); queuedBytes -= record.bytes;
      record.request = null;
    }
    record.reject(fail(code));
    if (queued) { record.resolve = null; record.reject = null; }
  }
  function pump() {
    while (connected && active < cap.concurrent && queue.length) {
      const record = queue.shift(); queuedBytes -= record.bytes;
      record.status = 'running'; active++;
      const work = []; // 超时响应与底层工作结束分开，取消不提前释放真实并发槽。
      Promise.resolve().then(() => {
        guard(record);
        return gate.callRemoteRead(handle, record.request, { guard: () => guard(record), track: completion => work.push(completion), deliver: result => {
          guard(record);
          gate.assertResult(result);
          const returned = deliver({ requestId: record.id, result });
          if (returned !== undefined) throw fail('MCP_REMOTE_DELIVERY_INVALID');
        } });
      }).then(() => {
        if (record.status !== 'running') return;
        record.status = 'completed'; record.resolve({ requestId: record.id, status: 'completed' });
      }, error => {
        if (record.status !== 'running') return;
        record.status = error?.code === 'MCP_REMOTE_EXPIRED' ? 'expired' : 'rejected';
        record.code = /^MCP_[A-Z_]+$/.test(error?.code ?? '') ? error.code : 'MCP_REMOTE_DENIED';
        record.reject(fail(record.code));
      }).finally(async () => {
        await Promise.allSettled(work);
        clearTimeout(record.timer); record.request = null; record.resolve = null; record.reject = null;
        active--; pump();
      });
    }
  }
  return {
    submit(raw) {
      try {
        open();
        const request = parse(raw), bytes = Buffer.byteLength(raw, 'utf8');
        gate.assertRemoteRead(handle, request);
        const ttl = request.deadline - wallNow();
        if (ttl <= 0 || ttl > cap.maxDeadlineMs) throw fail('MCP_REMOTE_EXPIRED');
        const digest = createHash('sha256').update(raw).digest('hex'), old = records.get(request.requestId);
        if (old) throw fail(old.digest === digest ? 'MCP_REMOTE_DUPLICATE' : 'MCP_REMOTE_REQUEST_CONFLICT');
        if (records.size >= cap.maxRequests || queue.length >= cap.maxPending || queuedBytes + bytes > cap.maxQueuedBytes) throw fail('MCP_REMOTE_BUSY');
        return new Promise((resolve, reject) => {
          const record = { id: request.requestId, digest, request, bytes, until: monotonicNow() + ttl, status: 'queued', resolve, reject };
          records.set(record.id, record); queue.push(record); queuedBytes += bytes;
          record.timer = setTimeout(() => { stop(record, 'expired', 'MCP_REMOTE_EXPIRED'); pump(); }, ttl);
          pump();
        });
      } catch (error) { return Promise.reject(fail(/^MCP_[A-Z_]+$/.test(error?.code ?? '') ? error.code : 'MCP_REMOTE_DENIED')); }
    },
    cancel(requestId) { const record = records.get(requestId); if (record) stop(record, 'cancelled', 'MCP_REMOTE_CANCELLED'); pump(); },
    disconnect() { connected = false; for (const record of records.values()) stop(record, 'disconnected', 'MCP_REMOTE_DISCONNECTED'); },
    status(requestId) { return records.get(requestId)?.status ?? null; },
    stats() { return { active, queued: queue.length, queuedBytes, retainedIds: records.size, connected, enabled: enabled === true }; }
  };
}
