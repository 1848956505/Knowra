import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createProviderInvoker, MAX_PROVIDER_CALLS } from '../experiments/knowledge-incremental/provider.mjs';
import { main } from '../experiments/knowledge-incremental/run.mjs';

const temp = () => mkdtemp(path.join(os.tmpdir(), 'knowra-provider-contract-'));
const request = { systemPrompt: 'synthetic system', request: { note: { markdown: 'synthetic note' } } };
const reply = content => ({ ok: true, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content } }], usage: { prompt_tokens: 3, completion_tokens: 2, secret: 'not-copied' } }) });

test('固定endpoint禁止重定向，凭据只进鉴权头，fetch前预算已落盘', async () => {
  const budgetDir = await temp(); let calls = 0;
  const invoke = createProviderInvoker({ apiKey: 'FAKE_TEST_ONLY', budgetDir, fetchImpl: async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.deepseek.com/chat/completions');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.authorization, 'Bearer FAKE_TEST_ONLY');
    assert.equal(options.body.includes('FAKE_TEST_ONLY'), false);
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal((await readdir(budgetDir)).filter(x => x.startsWith('attempt-')).length, 1);
    return reply('{"links":[]}');
  } });
  const result = await invoke(request);
  assert.equal(calls, 1); assert.equal(result.status, 'complete');
  assert.equal(result.rawText, '{"links":[]}');
  assert.deepEqual(result.usage, { prompt_tokens: 3, completion_tokens: 2 });
  assert.equal(JSON.stringify(result).includes('FAKE_TEST_ONLY'), false);
});

test('网络失败占预算；适配器重建不能复原额度；21次不会发fetch', async () => {
  const budgetDir = await temp(); let calls = 0;
  for (let i = 0; i < MAX_PROVIDER_CALLS; i++) {
    const invoke = createProviderInvoker({ apiKey: 'FAKE', budgetDir, fetchImpl: async () => { calls++; throw Error('offline'); } });
    await assert.rejects(invoke(request), /offline/);
  }
  await assert.rejects(createProviderInvoker({ apiKey: 'FAKE', budgetDir, fetchImpl: async () => { calls++; } })(request), /budget-exhausted/);
  assert.equal(calls, MAX_PROVIDER_CALLS);
});

test('并发调用共享同一预算，最多20次进入fetch', async () => {
  const budgetDir = await temp();
  // 先完成一次，避免测试依赖首次manifest文件写入的调度时机。
  let calls = 0;
  const invoke = createProviderInvoker({ apiKey: 'FAKE', budgetDir, fetchImpl: async () => { calls++; return reply('{}'); } });
  await invoke(request);
  const results = await Promise.allSettled(Array.from({ length: 24 }, () => invoke(request)));
  assert.equal(calls, MAX_PROVIDER_CALLS);
  assert.equal(results.filter(x => x.status === 'fulfilled').length, 19);
});

test('无效JSON和截断保留原输出但不修复不重试', async () => {
  const budgetDir = await temp(); let calls = 0;
  const invoke = createProviderInvoker({ apiKey: 'FAKE', budgetDir, fetchImpl: async () => { calls++; return reply('{oops'); } });
  const result = await invoke(request);
  assert.equal(result.status, 'invalid-json'); assert.equal(result.rawText, '{oops'); assert.equal(calls, 1);
  const truncated = createProviderInvoker({ apiKey: 'FAKE', budgetDir, fetchImpl: async () => ({ ok: true, json: async () => ({ choices: [{ finish_reason: 'length', message: { content: '{' } }] }) }) });
  assert.equal((await truncated(request)).status, 'incomplete-response');
});

test('离线CLI不读取密钥；live必须明确固定预算目录；无凭据不开网络', async () => {
  const out = await temp(); let reads = 0, calls = 0;
  const env = { get DEEPSEEK_API_KEY() { reads++; return undefined; } };
  const fetchImpl = async () => { calls++; };
  await main(['--out', out], { env, fetchImpl });
  assert.equal(reads, 0); assert.equal(calls, 0);
  await assert.rejects(main(['--live-model'], { env, fetchImpl }), /requires-fixed-budget/);
  await assert.rejects(main(['--live-model', '--budget-dir', await temp()], { env, fetchImpl }), /configuration-missing/);
  assert.equal(calls, 0);
});

test('显式模式仅使用fake fetch验收；跨输出目录共用预算且不泄漏鉴权', async () => {
  const budgetDir = await temp(); let calls = 0;
  const env = { DEEPSEEK_API_KEY: 'FAKE_SECRET_TEST_ONLY' };
  const fetchImpl = async () => { calls++; return reply('{oops'); };
  const firstOut = await temp();
  const first = await main(['--live-model', '--budget-dir', budgetDir, '--out', firstOut], { env, fetchImpl });
  assert.equal(calls, 18); assert.ok(first.rows.every(x => x.status === 'invalid-json' && !x.evaluation));
  await main(['--live-model', '--budget-dir', budgetDir, '--out', await temp()], { env, fetchImpl });
  assert.equal(calls, MAX_PROVIDER_CALLS);
  assert.equal((await readFile(path.join(firstOut, 'result.json'), 'utf8')).includes('FAKE_SECRET_TEST_ONLY'), false);
});
