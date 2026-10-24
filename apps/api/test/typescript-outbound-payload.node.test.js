import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import {
  fixedPayloadOracles,
  outboundPayloadContractCases,
  syntheticRequest,
  syntheticTool
} from './outbound-payload.contract-support.js';

// 普通模式只读当前检出。显式旧叶子模式要求准确实际父对象，缺失即失败，不回退当前实现。
const baseline = process.env.KNOWRA_OUTBOUND_PAYLOAD_BASELINE === '1';
const parent = 'baf9bdd1bfd4aa751354d1b1a27b7d64375326e9';
const root = new URL('../../../', import.meta.url);
const helper = 'apps/api/src/modules/ai/outbound-payload.js';
const sourceUrl = baseline
  ? `data:text/javascript;base64,${Buffer.from(execFileSync('git', ['show', `${parent}:${helper}`], { cwd: root, encoding: 'utf8' })).toString('base64')}`
  : new URL(helper, root).href;
const api = await import(sourceUrl);

for (const entry of outboundPayloadContractCases(api)) test(entry.name, entry.run);

test('JS bridge exports only identical TS functions', { skip: baseline }, async () => {
  const ts = await import(new URL(helper.replace(/\.js$/, '.ts'), root));
  assert.deepEqual(Object.keys(api), Object.keys(ts));
  for (const key of Object.keys(api)) assert.equal(api[key], ts[key]);
});

// 旧叶子模式不冒称历史消费者链验收；真实消费者及既有测试只在当前检出执行。
if (!baseline) {
  const { normalizeAiRequest, createAiGateway } = await import('../src/modules/ai/gateway.js');
  const { quoteWorstCase } = await import('../src/modules/ai/worker.js');
  const { createDeepSeekAdapter } = await import('../src/modules/ai/infrastructure/providers/deepseek-adapter.js');
  const { aiGatewayTests } = await import('./ai-gateway.test.js');
  const { aiReadContextTests } = await import('./ai-read-context.test.js');

  test('actual normalizer and budget quote match fixed Unicode tool body and hash', () => {
    const request = syntheticRequest({ format: 'json', tools: [syntheticTool()] });
    const normalized = { ...normalizeAiRequest(request), modelId: request.modelId };
    const oracle = fixedPayloadOracles[5];
    assert.equal(api.serializedDeepSeekPayload(normalized), oracle.body);
    const quote = quoteWorstCase({
      request,
      priceProfile: {
        version: 'synthetic',
        modelId: 'synthetic-model',
        expiresAt: '2030-01-01T00:00:00.000Z',
        inputMicrounitsPerMillion: 1,
        outputMicrounitsPerMillion: 1
      },
      now: new Date('2026-01-01T00:00:00.000Z')
    });
    assert.equal(quote.inputUpperBound, 297);
    assert.equal(quote.payloadHash, 'cdc407a98946d7836d66da77e08ec3ade74b935fdda932f2182a5dcc7e118e28');
    assert.equal(quote.reservedMicrounits, 2);
    assert.equal(quote.priceStale, false);
  });

  test('actual gateway and adapter complete sends exact fixed body via synthetic fetch only', async () => {
    const calls = [];
    const trace = [];
    const adapter = createDeepSeekAdapter({
      fetchImpl: async (url, options) => {
        trace.push('fetch');
        calls.push({ url, options });
        return new Response(
          '{"model":"synthetic-model","choices":[{"finish_reason":"stop","message":{"content":"synthetic"}}]}'
        );
      }
    });
    const gateway = createAiGateway({
      adapter,
      authorizePaidCall: () => {
        trace.push('authorize');
        return true;
      },
      resolveCredential: () => {
        trace.push('credential');
        return { apiKey: 'synthetic-unused-key', modelId: 'synthetic-model' };
      }
    });
    const result = await gateway.complete(syntheticRequest({ credentialRef: 'synthetic-ref' }));
    assert.equal(result.content, 'synthetic');
    assert.deepEqual(trace, ['authorize', 'credential', 'fetch']);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://api.deepseek.com/chat/completions');
    assert.equal(calls[0].options.method, 'POST');
    assert.equal(calls[0].options.redirect, 'error');
    assert.equal(calls[0].options.body, fixedPayloadOracles[1].body);
    assert.equal(calls[0].options.headers.Authorization, 'Bearer synthetic-unused-key');
    assert.equal(calls[0].options.body.includes('synthetic-unused-key'), false);
    assert.equal(calls[0].options.body.includes('synthetic-ref'), false);
  });

  test('actual streaming gateway sends distinct fixed body with usage and preserves response flow', async () => {
    const bodies = [];
    const adapter = createDeepSeekAdapter({
      fetchImpl: async (_url, options) => {
        bodies.push(options.body);
        return new Response(
          'data: {"model":"synthetic-model","choices":[{"delta":{"content":"中"},"finish_reason":null}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: {"choices":[],"usage":{"prompt_tokens":3,"completion_tokens":2}}\n\ndata: [DONE]\n\n'
        );
      }
    });
    const gateway = createAiGateway({
      adapter,
      authorizePaidCall: () => true,
      resolveCredential: () => ({ apiKey: 'synthetic-unused-key', modelId: 'synthetic-model' })
    });
    const events = [];
    for await (const event of gateway.stream(syntheticRequest({ credentialRef: 'synthetic-ref' }))) events.push(event);
    assert.deepEqual(bodies, [fixedPayloadOracles[3].body]);
    assert.notEqual(bodies[0], fixedPayloadOracles[1].body);
    assert.deepEqual(
      events.map(event => event.type),
      ['delta', 'result']
    );
    assert.equal(events[1].result.content, '中');
    assert.equal(events[1].result.usage.inputTokens, 3);
    assert.equal(events[1].result.usage.outputTokens, 2);
  });

  for (const name of [
    'AI Gateway：JSON 解析容忍围栏与说明文字，带工具时不强制 json_object 且纯文本回答按无引用处理',
    'DeepSeek adapter：预算授权先于凭据读取，固定端点且请求不携带额外字段',
    'DeepSeek adapter：SSE 增量、工具片段、用量与 DONE 完整性'
  ]) {
    test(`existing gateway contract actually runs: ${name}`, async () => {
      const selected = aiGatewayTests.find(entry => entry.name === name);
      assert.ok(selected, `Exact existing test missing: ${name}`);
      await selected.run();
    });
  }
  test('existing manifest range/hash/budget/refusal and authorized worker contract actually runs', async () => {
    const name = 'AI 选区只发送指定版本偏移，完整 payload 与预留和确认哈希一致';
    const selected = aiReadContextTests.find(entry => entry.name === name);
    assert.ok(selected, `Exact existing test missing: ${name}`);
    await selected.run();
  });
}
