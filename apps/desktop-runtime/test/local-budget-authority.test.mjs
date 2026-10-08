import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { createLocalBudgetAuthority } from '../src/local-budget-authority.mjs';
import { startLocalRuntime } from '../src/runtime-server.mjs';
import { temporaryDirectory } from './helpers.mjs';

const ACCOUNT = 'deepseek-primary';
const reserve = (authority, n, amount = 1_000_000, jobId = `job-${n}`) => authority.reserve({ accountRef: ACCOUNT, jobId, attemptId: `attempt-${n}`, priceVersion: 'price-v1', reservedMicrounits: amount });
const code = promise => promise.then(() => 'ok', error => error.code);

test('预算规则与云端一致：每日 20 元、单任务 2 元、预留—结算、未知费用继续占用，幂等与冲突', async t => {
  const authority = createLocalBudgetAuthority({ filePath: path.join(temporaryDirectory(t), 'ai-budget.json') });
  assert.equal((await authority.status(ACCOUNT)).availableMicrounits, 20_000_000);
  for (let n = 0; n < 10; n += 1) await reserve(authority, n, 2_000_000);
  assert.equal(await code(reserve(authority, 99, 1_000_000)), 'AI_DAILY_BUDGET_EXCEEDED');
  assert.deepEqual(await authority.status(ACCOUNT).then(({ heldMicrounits, availableMicrounits }) => ({ heldMicrounits, availableMicrounits })), { heldMicrounits: 20_000_000, availableMicrounits: 0 });
  await authority.settle({ accountRef: ACCOUNT, attemptId: 'attempt-0', disposition: 'settled', actualMicrounits: 1_500_000 });
  await authority.settle({ accountRef: ACCOUNT, attemptId: 'attempt-1', disposition: 'unknown' });
  const status = await authority.status(ACCOUNT);
  assert.equal(status.spentMicrounits, 1_500_000); assert.equal(status.heldMicrounits, 18_000_000, '未知费用的预留继续占用预算');
  assert.equal(await code(reserve(authority, 100, 2_000_000, 'job-big')), 'AI_DAILY_BUDGET_EXCEEDED');
  assert.equal(await code(reserve(authority, 101, 500_000)), 'ok', '结算释放出的 0.5 元可再预留');
  // 单任务上限与幂等。
  assert.equal(await code(authority.reserve({ accountRef: ACCOUNT, jobId: 'job-2', attemptId: 'attempt-extra', priceVersion: 'price-v1', reservedMicrounits: 1 })), 'AI_JOB_BUDGET_EXCEEDED');
  assert.equal((await reserve(authority, 2, 2_000_000)).attemptId, 'attempt-2', '同一尝试同参数重复预留返回原记录');
  assert.equal(await code(reserve(authority, 2, 1_000_000)), 'AI_BUDGET_CONFLICT');
  assert.equal(await code(authority.reserve({ accountRef: ACCOUNT, jobId: 'x', attemptId: 'bad', priceVersion: 'p', reservedMicrounits: 0 })), 'AI_BUDGET_REQUEST_INVALID');
});

test('账本落盘（0600、无临时文件），新实例读到相同状态', async t => {
  const filePath = path.join(temporaryDirectory(t), 'nested', 'ai-budget.json');
  const first = createLocalBudgetAuthority({ filePath });
  await reserve(first, 1, 2_000_000);
  await first.settle({ accountRef: ACCOUNT, attemptId: 'attempt-1', disposition: 'settled', actualMicrounits: 700_000 });
  await reserve(first, 2, 1_000_000);
  assert.equal(fs.statSync(filePath).mode & 0o777, 0o600);
  assert.deepEqual(fs.readdirSync(path.dirname(filePath)), ['ai-budget.json']);
  const second = createLocalBudgetAuthority({ filePath });
  const status = await second.status(ACCOUNT);
  assert.equal(status.spentMicrounits, 700_000); assert.equal(status.heldMicrounits, 1_000_000);
  assert.equal(await code(reserve(second, 2, 1_000_000)), 'ok', '重启后同一尝试仍是幂等的');
});

test('并发预留依次执行：30 个并发的 1 元预留恰好通过 20 个，账本保持一致', async t => {
  const filePath = path.join(temporaryDirectory(t), 'ai-budget.json');
  const authority = createLocalBudgetAuthority({ filePath });
  const outcomes = await Promise.all(Array.from({ length: 30 }, (_, n) => code(reserve(authority, n))));
  assert.equal(outcomes.filter(value => value === 'ok').length, 20);
  assert.equal(outcomes.filter(value => value === 'AI_DAILY_BUDGET_EXCEEDED').length, 10);
  assert.equal((await createLocalBudgetAuthority({ filePath }).status(ACCOUNT)).heldMicrounits, 20_000_000);
});

test('账本损坏或不一致时一律拒绝付费调用并保留原文件，不会当成空账本', async t => {
  const filePath = path.join(temporaryDirectory(t), 'ai-budget.json');
  const good = createLocalBudgetAuthority({ filePath });
  await reserve(good, 1, 1_000_000);
  const valid = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const inconsistent = JSON.stringify({ ...valid, budgetDays: valid.budgetDays.map(row => ({ ...row, heldMicrounits: 0 })) });
  const days = JSON.stringify(valid.budgetDays), reservations = JSON.stringify(valid.budgetReservations);
  // 不完整的账本（缺集合、集合为 null、空对象）不能被共享校验函数“补全”成满额空账本。
  const incomplete = ['{}', '{"budgetDays":null,"budgetReservations":null}', `{"budgetDays":${days}}`, `{"budgetReservations":${reservations}}`,
    `{"budgetDays":${days},"budgetReservations":null}`, `{"budgetDays":{},"budgetReservations":${reservations}}`];
  for (const broken of ['{ 不是 json', '[]', inconsistent, ...incomplete]) {
    fs.writeFileSync(filePath, broken, { mode: 0o600 });
    const authority = createLocalBudgetAuthority({ filePath });
    assert.equal(await code(authority.status(ACCOUNT)), 'AI_BUDGET_UNAVAILABLE', broken.slice(0, 20));
    assert.equal(await code(reserve(authority, 2)), 'AI_BUDGET_UNAVAILABLE');
    assert.equal(await code(authority.settle({ accountRef: ACCOUNT, attemptId: 'attempt-1', disposition: 'released' })), 'AI_BUDGET_UNAVAILABLE');
    assert.equal(fs.readFileSync(filePath, 'utf8'), broken, '损坏的账本没有被覆盖');
  }
});

test('写盘失败时拒绝预留，内存里也没有半成品；恢复后继续可用', { skip: process.getuid?.() === 0 }, async t => {
  const directory = temporaryDirectory(t), filePath = path.join(directory, 'ai-budget.json');
  const authority = createLocalBudgetAuthority({ filePath });
  await reserve(authority, 1, 1_000_000);
  fs.chmodSync(directory, 0o500);
  try {
    assert.equal(await code(reserve(authority, 2, 1_000_000)), 'AI_BUDGET_UNAVAILABLE');
    assert.equal((await authority.status(ACCOUNT)).heldMicrounits, 1_000_000, '失败的预留没有占用额度');
  } finally { fs.chmodSync(directory, 0o700); }
  assert.equal(await code(reserve(authority, 2, 1_000_000)), 'ok');
  assert.equal((await authority.status(ACCOUNT)).heldMicrounits, 2_000_000);
});

test('桌面运行端：没有连接任何云端也能使用预算，账本在数据目录根，重启后保留', async t => {
  const root = temporaryDirectory(t), distRoot = path.join(root, 'dist'), dataDirectory = path.join(root, 'data');
  fs.mkdirSync(distRoot); fs.writeFileSync(path.join(distRoot, 'index.html'), '<html><head></head></html>');
  let captured;
  const start = () => startLocalRuntime({ dataDirectory, distRoot, syncOptions: { autoSync: false }, logger: { warn() {}, error() {} },
    aiRuntimeFactory(options) { captured = options; return { ...options, unavailableReason: '测试' }; } });
  let runtime = await start();
  assert.equal(runtime.store.getStatus().datasetId.length > 0, true);
  assert.equal((await captured.budgetAuthority.status(ACCOUNT)).availableMicrounits, 20_000_000, '未配置云端，状态正常');
  await reserve(captured.budgetAuthority, 1, 1_500_000);
  assert.equal(fs.existsSync(path.join(dataDirectory, 'ai-budget.json')), true);
  await runtime.close();
  runtime = await start();
  t.after(() => runtime.close());
  assert.equal((await captured.budgetAuthority.status(ACCOUNT)).heldMicrounits, 1_500_000);
});

test('用量明细随结算落盘，新实例可查询汇总', async t => {
  const filePath = path.join(temporaryDirectory(t), 'ai-budget.json');
  const first = createLocalBudgetAuthority({ filePath });
  await reserve(first, 1, 1_000_000);
  await first.settle({ accountRef: ACCOUNT, attemptId: 'attempt-1', disposition: 'settled', actualMicrounits: 250_000,
    usage: { modelId: 'deepseek-flash', inputTokens: 500, outputTokens: 40, cacheHitTokens: 100, conversationId: 'conv-1' } });
  const summary = await createLocalBudgetAuthority({ filePath }).usage(ACCOUNT);
  assert.equal(summary.total.spentMicrounits, 250_000);
  assert.equal(summary.total.cacheHitTokens, 100);
  assert.equal(summary.recent[0].conversationId, 'conv-1');
  assert.equal(await code(first.settle({ accountRef: ACCOUNT, attemptId: 'attempt-1', disposition: 'settled', actualMicrounits: 250_000, usage: { bogus: 1 } })), 'AI_BUDGET_SETTLEMENT_INVALID');
});
