import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSyncTransport } from '../src/sync-transport.mjs';
import { createLegacySyncTransport } from './fixtures/sync-transport-before-refactor.mjs';

const network = (...codes) => new AggregateError(codes.map(code => Object.assign(new Error('private detail'), { code })), 'fetch failed');
const response = (status = 200, payload = { data: { ok: true } }, retryAfter = null) => ({
  ok: status < 400, status, headers: new Headers(retryAfter === null ? {} : { 'retry-after': retryAfter }),
  json: async () => payload
});

async function observe(create, scenario) {
  const trace = [];
  let authorization = '', serverUrl = 'https://first.example';
  let controller;
  const timeout = AbortSignal.timeout;
  AbortSignal.timeout = milliseconds => {
    trace.push(['timeout', milliseconds]);
    controller = new AbortController();
    return controller.signal;
  };
  try {
    const transport = create({
      getServerUrl: () => { trace.push(['server', serverUrl]); return serverUrl; },
      getAuthorization: () => { trace.push(['authorization', authorization]); return authorization; },
      fetcher: async (url, options) => {
        trace.push(['fetch', url, { ...options, signal: options.signal ? { aborted: options.signal.aborted } : undefined }]);
        if (scenario.failure) throw scenario.failure();
        if (scenario.jsonFailure) return { ...response(scenario.status), json: () => {
          if (scenario.abort) controller.abort(scenario.abort());
          if (scenario.syncJsonFailure) throw scenario.jsonFailure();
          return Promise.reject(scenario.jsonFailure());
        } };
        return response(scenario.status, scenario.payload, scenario.retryAfter);
      }
    });
    const results = [];
    for (const input of scenario.calls ?? [{ route: 'status' }]) {
      if ('authorization' in input) authorization = input.authorization;
      if ('serverUrl' in input) serverUrl = input.serverUrl;
      try {
        const value = input.raw
          ? await transport.fetchSync(input.raw.url, input.raw.options, input.upload, input.bootstrap)
          : await transport.request(input.route, input.body, input.override, input.method);
        results.push({ value: input.raw ? { ok: value.ok, status: value.status } : value });
      } catch (error) {
        results.push({ error: { name: error.name, message: error.message, code: error.code, status: error.status, retryAfterMs: error.retryAfterMs } });
      }
    }
    return { trace, results };
  } finally { AbortSignal.timeout = timeout; }
}

const scenarios = [
  { name: '动态连接、认证、清空及首次连接 override', calls: [
    { route: 'status', override: 'https://override.example' },
    { route: 'changes?cursor=x%2Fy', serverUrl: 'https://second.example', authorization: 'Basic synthetic-a' },
    { route: '/api/knowledge/items/id/purge', body: { expectedUpdatedAt: 'v1' }, method: 'DELETE', authorization: 'Basic synthetic-b' },
    { route: 'status', authorization: '' }
  ] },
  ...['batch', 'blobs', 'push', 'bootstrap', 'status', 'batch?query=1', '/api/sync/batch'].map(route => ({ name: `路由 ${route}`, calls: [{ route, body: {} }] })),
  { name: 'null 正文与显式 method', calls: [{ route: 'status', body: null, method: 'PATCH' }] },
  { name: '无正文但显式 POST', calls: [{ route: 'status', method: 'POST' }] },
  { name: '原始附件响应不解释 envelope', status: 403, payload: {}, calls: [{ raw: { url: 'https://first.example/file', options: { redirect: 'error', headers: { Authorization: 'Basic synthetic' } } } }] },
  ...[
    [['ETIMEDOUT', 'ENOTFOUND', 'CERT_EXPIRED', 'ECONNREFUSED'], 'SYNC_NETWORK_TIMEOUT'],
    [['UND_ERR_CONNECT_TIMEOUT'], 'SYNC_NETWORK_TIMEOUT'],
    [['ENOTFOUND', 'CERT_EXPIRED', 'ECONNREFUSED'], 'SYNC_NETWORK_DNS'],
    [['EAI_AGAIN'], 'SYNC_NETWORK_DNS'],
    [['CERT_EXPIRED', 'ECONNREFUSED', 'ECONNRESET'], 'SYNC_NETWORK_TLS'],
    [['ERR_TLS_CERT_ALTNAME_INVALID'], 'SYNC_NETWORK_TLS'],
    [['UNABLE_TO_VERIFY_LEAF_SIGNATURE'], 'SYNC_NETWORK_TLS'],
    [['DEPTH_ZERO_SELF_SIGNED_CERT'], 'SYNC_NETWORK_TLS'],
    [['SELF_SIGNED_CERT_IN_CHAIN'], 'SYNC_NETWORK_TLS'],
    [['ECONNREFUSED', 'ECONNRESET'], 'SYNC_CONNECTION_REFUSED'],
    [['ECONNRESET'], 'SYNC_CONNECTION_INTERRUPTED'],
    [[], 'SYNC_NETWORK_UNAVAILABLE']
  ].map(([codes, code]) => ({ name: `网络优先级 ${codes.join('/')}`, failure: () => network(...codes), code })),
  { name: '循环 cause/errors', failure: () => { const error = network('EAI_AGAIN'); error.cause = error; error.errors.push(error); return error; }, code: 'SYNC_NETWORK_DNS' },
  { name: '嵌套 cause', failure: () => new Error('private detail', { cause: network('ECONNRESET') }), code: 'SYNC_CONNECTION_INTERRUPTED' },
  ...['status', 'batch', 'bootstrap'].map(route => ({ name: `fetch 超时 ${route}`, calls: [{ route }], failure: () => new DOMException('timed out', 'TimeoutError'), code: route === 'batch' ? 'SYNC_UPLOAD_TIMEOUT' : route === 'bootstrap' ? 'SYNC_BOOTSTRAP_TIMEOUT' : 'SYNC_NETWORK_TIMEOUT' })),
  ...['status', 'batch', 'bootstrap'].map(route => ({ name: `正文读取超时 ${route}`, calls: [{ route }], jsonFailure: () => new DOMException('timed out', 'TimeoutError'), code: route === 'batch' ? 'SYNC_UPLOAD_TIMEOUT' : route === 'bootstrap' ? 'SYNC_BOOTSTRAP_TIMEOUT' : 'SYNC_NETWORK_TIMEOUT' })),
  { name: 'signal reason 优先于正文异常', abort: () => network('ENOTFOUND'), jsonFailure: () => new Error('body failed'), code: 'SYNC_NETWORK_DNS' },
  { name: '损坏 JSON 的成功响应', jsonFailure: () => new SyntaxError('bad json'), code: 'SYNC_INVALID_RESPONSE' },
  { name: '损坏 JSON 的认证响应', status: 401, jsonFailure: () => new SyntaxError('bad json'), code: 'AUTH_REQUIRED' },
  { name: '同步 json throw 不改写', syncJsonFailure: true, jsonFailure: () => new Error('sync-json') },
  ...[{}, { data: null }, { data: false }, { data: 0 }, { data: '' }].map(payload => ({ name: `无有效 data ${JSON.stringify(payload)}`, payload, code: 'SYNC_INVALID_RESPONSE' })),
  { name: '数组 data 保留', payload: { data: [] } },
  { name: '现有 null payload TypeError 保留', payload: null },
  { name: '401 固定文案优先服务端错误', status: 401, payload: { error: { code: 'OTHER', message: 'private detail' } }, code: 'AUTH_REQUIRED' },
  { name: '403 设备错误优先认证', status: 403, payload: { error: { code: 'SYNC_DEVICE_NOT_ENABLED', message: '设备待启用' } }, code: 'SYNC_DEVICE_NOT_ENABLED' },
  { name: '设备缺省文案', status: 403, payload: { error: { code: 'SYNC_DEVICE_NOT_ENABLED' } }, code: 'SYNC_DEVICE_NOT_ENABLED' },
  { name: '服务端错误保留', status: 422, payload: { error: { code: 'DOMAIN_ERROR', message: '合成错误' } }, code: 'DOMAIN_ERROR' },
  ...[404, 503].map(status => ({ name: `HTTP ${status}`, status, payload: {}, code: status >= 500 ? 'CLOUD_SERVICE_UNAVAILABLE' : 'CLOUD_REQUEST_FAILED' })),
  ...['12', 'Sun, 11 Oct 2026 00:00:05 GMT', 'Sun, 11 Oct 2020 00:00:00 GMT', 'invalid'].map(retryAfter => ({ name: `Retry-After ${retryAfter}`, status: 429, payload: {}, retryAfter, code: 'CLOUD_REQUEST_FAILED' }))
];

test('同步传输与冻结旧实现的调用轨迹和结果完全一致', async t => {
  t.mock.method(Date, 'now', () => Date.parse('2026-10-11T00:00:00Z'));
  for (const scenario of scenarios) await t.test(scenario.name, async () => {
    const before = await observe(createLegacySyncTransport, scenario);
    const after = await observe(createSyncTransport, scenario);
    assert.deepEqual(after, before);
    if (scenario.code) assert.equal(after.results[0].error.code, scenario.code);
  });
});

test('传输公开入口的请求合同独立断言', async () => {
  const result = await observe(createSyncTransport, scenarios[0]);
  const requests = result.trace.filter(entry => entry[0] === 'fetch');
  assert.deepEqual(result.trace.filter(entry => entry[0] === 'server'), [
    ['server', 'https://second.example'], ['server', 'https://second.example'], ['server', 'https://second.example']
  ]);
  assert.equal(requests[0][1], 'https://override.example/api/sync/status');
  assert.equal(requests[0][2].method, 'GET');
  assert.deepEqual(requests[0][2].headers, {});
  assert.equal('body' in requests[0][2], false);
  assert.equal(requests[1][2].headers.Authorization, 'Basic synthetic-a');
  assert.equal(requests[2][1], 'https://second.example/api/knowledge/items/id/purge');
  assert.equal(requests[2][2].method, 'DELETE');
  assert.equal(requests[2][2].body, '{"expectedUpdatedAt":"v1"}');
  assert.equal(requests[2][2].headers.Authorization, 'Basic synthetic-b');
  assert.equal(requests[2][2].headers['Content-Type'], 'application/json');
  assert.deepEqual(requests[3][2].headers, {});
  for (const request of requests) assert.equal(request[2].redirect, 'error');
  for (const route of ['batch', 'blobs', 'push', 'bootstrap', 'status']) {
    const observed = await observe(createSyncTransport, { calls: [{ route }] });
    assert.deepEqual(observed.trace.find(entry => entry[0] === 'timeout'), ['timeout', route === 'status' ? 15000 : 90000]);
  }
});

test('准备请求的失败不触发 fetch，原始附件传输不改写请求或响应', async () => {
  for (const failureAt of ['server', 'authorization', 'body']) {
    const failure = new Error(`synthetic-${failureAt}`);
    const trace = [];
    const transport = createSyncTransport({
      getServerUrl() { trace.push('server'); if (failureAt === 'server') throw failure; return 'https://example.test'; },
      getAuthorization() { trace.push('authorization'); if (failureAt === 'authorization') throw failure; return ''; },
      fetcher() { assert.fail('准备失败不能请求网络'); }
    });
    const body = { toJSON() { trace.push('body'); throw failure; } };
    await assert.rejects(transport.request('batch', body), error => error === failure);
    assert.deepEqual(trace, failureAt === 'server' ? ['server'] : failureAt === 'authorization' ? ['server', 'authorization'] : ['server', 'authorization', 'body']);
  }
  const options = { method: 'GET', signal: new AbortController().signal, headers: { Authorization: 'Basic synthetic' } };
  const raw = response(403, {});
  const transport = createSyncTransport({
    getServerUrl() { assert.fail('原始附件请求不读取默认地址'); },
    getAuthorization() { assert.fail('原始附件请求保留调用方认证头'); },
    async fetcher(url, actualOptions) { assert.equal(url, 'https://example.test/file'); assert.equal(actualOptions, options); return raw; }
  });
  assert.equal(await transport.fetchSync('https://example.test/file', options), raw);
});

test('Retry-After 保持秒数、HTTP 日期和无效值的既有行为', async t => {
  t.mock.method(Date, 'now', () => Date.parse('2026-10-11T00:00:00Z'));
  for (const [retryAfter, expected] of [['12', 12000], ['Sun, 11 Oct 2026 00:00:05 GMT', 5000], ['Sun, 11 Oct 2020 00:00:00 GMT', 0], ['invalid', NaN], [null, 0]]) {
    const result = await observe(createSyncTransport, { status: 429, payload: {}, retryAfter });
    assert.equal(result.results[0].error.retryAfterMs, expected);
  }
});
