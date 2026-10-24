import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { USAGE_CSV_HEADER, usageExportContractCases } from './usage-export.contract-support.js';

// 普通入口不执行 Git；显式旧叶子模式只接受准确实际父对象，缺失即失败，不回退当前实现。
const baseline = process.env.KNOWRA_USAGE_EXPORT_BASELINE === '1';
const parent = '9bbd2b04716d0ff44e250036f508697ac1ae9f18';
const root = new URL('../../../', import.meta.url);
const helper = 'apps/api/src/modules/ai/usage-export.js';
const sourceUrl = baseline
  ? `data:text/javascript;base64,${Buffer.from(execFileSync('git', ['show', `${parent}:${helper}`], { cwd: root, encoding: 'utf8' })).toString('base64')}`
  : new URL(helper, root).href;
const api = await import(sourceUrl);

for (const entry of usageExportContractCases(api)) test(entry.name, entry.run);

test('JS bridge exports only the identical synchronous TS usageCsv function', { skip: baseline }, async () => {
  const ts = await import(new URL(helper.replace(/\.js$/, '.ts'), root));
  assert.deepEqual(Object.keys(api), ['usageCsv']);
  assert.deepEqual(Object.keys(ts), ['usageCsv']);
  assert.equal(api.usageCsv, ts.usageCsv);
});

// 旧叶子模式保留所有直接合同，不冒称历史消费者链验收。以下真实链仅使用当前检出和合成内存数据。
if (!baseline) {
  const { usageRows, createJsonBudgetAuthority, reserveBudget, settleBudget } =
    await import('../src/modules/ai/budget-ledger.js');
  const { createAiAssistantService } = await import('../src/modules/ai/assistant-service.js');
  const { handleAssistantRoute } = await import('../src/modules/ai/assistant-routes.js');
  const { aiBudgetSettingsTests } = await import('./ai-budget-settings.test.js');

  for (const name of [
    'CSV 导出：含 BOM 与表头，只含数字和 ID；以公式符号开头的值加前缀；月汇总行附在末尾',
    '已有损坏的用量明细：折叠进月汇总与 CSV 导出前同样清洗，不产生 NaN 或字符串拼接',
    '明细保留 90 天：更早已结算的折叠为月汇总且累计不变；未知请求永不裁剪；基准取今天与账本最新日的较早者',
    'PostgreSQL 适配器的用量汇总、导出与状态在只给预留记录时可用（不依赖日账本或月汇总），损坏的明细按未记录处理'
  ]) {
    test(`existing budget contract actually runs: ${name}`, async () => {
      const matches = aiBudgetSettingsTests.filter(entry => entry.name === name);
      assert.equal(matches.length, 1, `Exact existing test missing or duplicated: ${name}`);
      await matches[0].run();
    });
  }

  const recorder = () => {
    const events = [];
    const headers = {};
    const response = {
      setHeader(name, value) {
        headers[name] = value;
      },
      writeHead(status, extra) {
        events.push(['status', status]);
        Object.assign(headers, extra);
      },
      end(value) {
        events.push(['body', value]);
      }
    };
    return { events, headers, response };
  };

  test('actual JSON ledger -> authority -> assistant -> HTTP recorder returns fixed CSV bytes without writes or sockets', async () => {
    const accountRef = 'deepseek-primary';
    const state = {
      budgetDays: [],
      budgetReservations: [],
      budgetMonths: [
        { accountRef: 'other-account', month: '2026-01', requests: 90, spentMicrounits: 9000000 },
        {
          accountRef,
          month: '2026-05',
          requests: 2,
          spentMicrounits: 500000,
          inputTokens: 150,
          outputTokens: 15,
          cacheHitTokens: 40
        }
      ]
    };
    for (const [attemptId, disposition] of [
      ['synthetic-settled', 'settled'],
      ['synthetic-unknown', 'unknown'],
      ['synthetic-held', 'held'],
      ['synthetic-released', 'released']
    ]) {
      reserveBudget(state, {
        accountRef,
        jobId: attemptId,
        attemptId,
        priceVersion: 'p1',
        reservedMicrounits: 1000000,
        day: '2026-10-08'
      });
      if (disposition !== 'held') {
        settleBudget(state, {
          accountRef,
          attemptId,
          disposition,
          actualMicrounits: disposition === 'settled' ? 123456 : null,
          usage:
            disposition === 'settled'
              ? {
                  modelId: 'synthetic-model',
                  inputTokens: 3,
                  outputTokens: 1,
                  cacheHitTokens: 1,
                  conversationId: '=synthetic'
                }
              : undefined
        });
      }
      const record = state.budgetReservations.at(-1);
      record.createdAt = '2026-10-08T00:00:00.000Z';
      if (disposition !== 'held')
        record.settledAt = disposition === 'unknown' ? '2026-10-08T01:00:00.000Z' : '2026-10-08T02:00:00.000Z';
    }
    const before = structuredClone(state);
    const projected = usageRows(state, accountRef);
    assert.deepEqual(
      projected.rows.map(row => row.attemptId),
      ['synthetic-unknown', 'synthetic-settled']
    );
    assert.equal(projected.months.length, 1);
    const expected =
      USAGE_CSV_HEADER +
      '2026-10-08T01:00:00.000Z,2026-10-08,结果未知(按预留占用),,,,,1.000000,,p1,synthetic-unknown\r\n' +
      "2026-10-08T02:00:00.000Z,2026-10-08,已结算,synthetic-model,3,1,1,0.123456,'=synthetic,p1,synthetic-settled\r\n" +
      '2026-05 月汇总(明细已折叠),2026-05,2 次请求,,150,15,40,0.500000,,,\r\n';
    assert.equal(api.usageCsv(projected), expected);
    const authority = createJsonBudgetAuthority({
      getState: () => state,
      runTransaction: () => {
        throw new Error('read-only export must not open a transaction');
      },
      onChange: () => {
        throw new Error('read-only export must not persist');
      }
    });
    const assistant = createAiAssistantService({
      getRuntime: () => ({ budgetAuthority: authority }),
      ownerId: 'synthetic-owner'
    });
    assert.equal(await assistant.usageExport(), expected);
    const { response, events, headers } = recorder();
    assert.equal(
      await handleAssistantRoute({
        request: { method: 'GET' },
        response,
        url: new URL('http://synthetic.invalid/api/ai/assistant/usage/export'),
        assistant
      }),
      true
    );
    assert.deepEqual(events, [
      ['status', 200],
      ['body', expected]
    ]);
    assert.deepEqual(headers, {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="knowra-ai-usage.csv"',
      'X-Content-Type-Options': 'nosniff'
    });
    assert.deepEqual(state, before);
  });

  test('actual assistant sanitizes malformed export data for local and server locations', async () => {
    for (const [location, message] of [
      ['local', '本机预算账本不可用。'],
      ['server', '云端预算服务不可用。']
    ]) {
      const accounts = [];
      const assistant = createAiAssistantService({
        getRuntime: () => ({
          budgetAuthority: {
            usageRows: async account => {
              accounts.push(account);
              return { rows: null, months: [] };
            }
          }
        }),
        ownerId: 'synthetic-owner',
        location
      });
      await assert.rejects(assistant.usageExport(), { code: 'AI_BUDGET_UNAVAILABLE', message });
      assert.deepEqual(accounts, ['deepseek-primary']);
    }
  });

  test('actual HTTP recorder maps sanitized export failure to 503 without a CSV body', async () => {
    const assistant = createAiAssistantService({
      getRuntime: () => ({
        budgetAuthority: {
          usageRows: async () => {
            throw new Error('synthetic private detail');
          }
        }
      }),
      ownerId: 'synthetic-owner',
      location: 'local'
    });
    const { response, events, headers } = recorder();
    await assert.rejects(
      handleAssistantRoute({
        request: { method: 'GET' },
        response,
        url: new URL('http://synthetic.invalid/api/ai/assistant/usage/export'),
        assistant
      }),
      { code: 'AI_BUDGET_UNAVAILABLE', message: '本机预算账本不可用。', statusCode: 503 }
    );
    assert.deepEqual(events, []);
    assert.deepEqual(headers, { 'Cache-Control': 'no-store' });
  });
}
