import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { budgetStatus, reserveBudget, settleBudget } from '../src/modules/ai/budget-ledger.js';
import { createBudgetPolicy } from '../src/modules/ai/budget-policy.js';
import { createBudgetSettingsStore, DEFAULT_BUDGET_SETTINGS, effectivePriceProfile, enforcedLimits, normalizeBudgetSettings } from '../src/modules/ai/budget-settings.js';
import { actualCostMicrounits } from '../src/modules/ai/worker.js';
import { createBudgetAlertStore, evaluateAlerts } from '../src/modules/ai/budget-alerts.js';
import { createIsolatedAiWorker } from '../src/modules/ai/isolated-worker.js';

const account = 'deepseek-primary';
const reserve = (state, n, amount, extra = {}) => reserveBudget(state, { accountRef: account, jobId: `job-${extra.job ?? n}`, attemptId: `a-${n}`,
  priceVersion: 'p1', reservedMicrounits: amount, day: extra.day ?? '2026-10-08', limits: extra.limits });
const base = { version: 'base-v1', modelId: 'deepseek-flash', expiresAt: '2026-10-09T00:00:00.000Z', inputMicrounitsPerMillion: 2_000_000, outputMicrounitsPerMillion: 8_000_000 };
const settings = (rules = {}, price = null) => ({ rules: { ...structuredClone(DEFAULT_BUDGET_SETTINGS.rules), ...rules }, price });
const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'knowra-budget-settings-'));

export const aiBudgetSettingsTests = [
  { name: '预算设置：默认等同改造前的规则；非法模式、金额与未知字段被拒，关闭时清空金额', run() {
    assert.deepEqual(enforcedLimits(DEFAULT_BUDGET_SETTINGS), { daily: 20_000_000, monthly: null, turn: 2_000_000 });
    const off = normalizeBudgetSettings(settings({ daily: { mode: 'off', limitMicrounits: 5 } }));
    assert.deepEqual(off.rules.daily, { mode: 'off', limitMicrounits: null });
    assert.equal(enforcedLimits(off).daily, null);
    assert.equal(enforcedLimits(normalizeBudgetSettings(settings({ daily: { mode: 'warn', limitMicrounits: 5_000_000 } }))).daily, null, '仅提醒不限制预留');
    for (const bad of [settings({ daily: { mode: 'kill', limitMicrounits: 1 } }), settings({ daily: { mode: 'stop', limitMicrounits: 0 } }),
      settings({ daily: { mode: 'stop', limitMicrounits: 1.5 } }), settings({ daily: { mode: 'stop' } }), { rules: {}, price: null },
      { ...settings(), extra: 1 }, settings({}, { inputMicrounitsPerMillion: -1, outputMicrounitsPerMillion: 1 }),
      settings({}, { inputMicrounitsPerMillion: 1_000_000, inputCacheHitMicrounitsPerMillion: 2_000_000, outputMicrounitsPerMillion: 1 })]) {
      assert.throws(() => normalizeBudgetSettings(bad), { code: 'AI_BUDGET_SETTINGS_INVALID' });
    }
  } },
  { name: '账本按设置执行：每日/月/回合上限只在“达到即停”时限制预留；单次请求最坏上限始终保留', run() {
    const state = { budgetDays: [], budgetReservations: [] };
    reserve(state, 1, 2_000_000, { limits: { daily: 3_000_000, monthly: null, turn: null } });
    assert.throws(() => reserve(state, 2, 2_000_000, { limits: { daily: 3_000_000, monthly: null, turn: null } }), { code: 'AI_DAILY_BUDGET_EXCEEDED' });
    // 日上限关闭后可继续超过原 3 元
    reserve(state, 3, 2_000_000, { limits: { daily: null, monthly: null, turn: null } });
    // 回合上限：同一任务多次预留累计
    assert.throws(() => reserve(state, 4, 1_500_000, { job: 3, limits: { daily: null, monthly: null, turn: 3_000_000 } }), { code: 'AI_JOB_BUDGET_EXCEEDED' });
    reserve(state, 5, 1_500_000, { job: 3, limits: { daily: null, monthly: null, turn: null } });
    // 月上限跨天累计
    assert.throws(() => reserve(state, 6, 1_000_000, { day: '2026-10-20', limits: { daily: null, monthly: 6_000_000, turn: null } }), { code: 'AI_MONTHLY_BUDGET_EXCEEDED' });
    reserve(state, 7, 1_000_000, { day: '2026-11-01', limits: { daily: null, monthly: 6_000_000, turn: null } });
    assert.throws(() => reserve(state, 8, 2_000_001, { limits: { daily: null, monthly: null, turn: null } }), { code: 'AI_BUDGET_REQUEST_INVALID' });
    assert.throws(() => reserve(state, 9, 1, { limits: { daily: 0, monthly: null, turn: null } }), { code: 'AI_BUDGET_REQUEST_INVALID' });
    assert.throws(() => reserve(state, 9, 1, { limits: { daily: 1, extra: 1 } }), { code: 'AI_BUDGET_REQUEST_INVALID' });
    const status = budgetStatus(state, account, '2026-10-08', { daily: null, monthly: 6_000_000, turn: null });
    assert.equal(status.limitMicrounits, null);
    assert.equal(status.availableMicrounits, null);
    assert.equal(status.monthSpentMicrounits + status.monthHeldMicrounits, 5_500_000);
    assert.equal(status.monthAvailableMicrounits, 500_000);
    assert.equal(budgetStatus(state, account, '2026-10-08').limitMicrounits, 20_000_000, '未传 limits 沿用默认');
  } },
  { name: '自定义单价叠加在档案上：版本带 +custom，命中价按命中 token 结算，实际费用不超过按未命中价的预留', run() {
    const custom = { inputMicrounitsPerMillion: 1_000_000, inputCacheHitMicrounitsPerMillion: 100_000, outputMicrounitsPerMillion: 4_000_000, updatedAt: '2026-10-08T00:00:00.000Z' };
    const profile = effectivePriceProfile(base, custom);
    assert.equal(profile.version, 'base-v1+custom');
    assert.equal(profile.modelId, 'deepseek-flash');
    assert.equal(effectivePriceProfile(base, null), base);
    // 1000 输入（600 命中）、50 输出：400*1 + 600*0.1 + 50*4 = 660 微元
    assert.equal(actualCostMicrounits({ inputTokens: 1000, outputTokens: 50, cacheHitTokens: 600 }, profile), 660);
    assert.equal(actualCostMicrounits({ inputTokens: 1000, outputTokens: 50, cacheHitTokens: null }, profile), 1000 + 200, '命中数未知按未命中价');
    assert.equal(actualCostMicrounits({ inputTokens: 1000, outputTokens: 50, cacheHitTokens: 600 }, base), 2000 + 400, '无命中价的档案不分命中');
  } },
  { name: '设置存储：缺失用默认；保存后读回；损坏或越界时拒绝而不是回到默认；文件 0600', async run() {
    const dir = temp();
    try {
      const file = path.join(dir, 'ai-budget-settings.json');
      const store = createBudgetSettingsStore({ filePath: file, now: () => new Date('2026-10-08T01:00:00.000Z') });
      assert.deepEqual(await store.get(), DEFAULT_BUDGET_SETTINGS);
      const saved = await store.set(settings({ monthly: { mode: 'warn', limitMicrounits: 100_000_000 } },
        { inputMicrounitsPerMillion: 1_000_000, outputMicrounitsPerMillion: 2_000_000 }));
      assert.equal(saved.price.updatedAt, '2026-10-08T01:00:00.000Z');
      assert.deepEqual(await store.get(), saved);
      assert.equal(fs.statSync(file).mode & 0o777, 0o600);
      await assert.rejects(store.set({ rules: {} }), { code: 'AI_BUDGET_SETTINGS_INVALID' });
      assert.deepEqual(await store.get(), saved, '无效保存不改动原设置');
      fs.writeFileSync(file, '{"rules":{"daily":{"mode":"stop","limitMicrounits":-5}}}');
      await assert.rejects(store.get(), { code: 'AI_BUDGET_SETTINGS_INVALID' });
      assert.match(fs.readFileSync(file, 'utf8'), /-5/, '原文件保留');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  } },
  { name: '余额下限为“达到即停”时：低于下限拒绝；读不到余额且无新快照拒绝；仅提醒不拦截', async run() {
    const dir = temp();
    try {
      const store = createBudgetSettingsStore({ filePath: path.join(dir, 's.json') });
      let clock = Date.parse('2026-10-08T00:00:00.000Z');
      const view = (total, at) => ({ checkedAt: at, latest: { at, isAvailable: true, balances: [{ currency: 'CNY', totalMicrounits: total, grantedMicrounits: 0, toppedUpMicrounits: total }] } });
      let live = view(50_000_000, new Date(clock).toISOString()); let refreshError = null;
      const balance = { view: async () => live, refresh: async () => { if (refreshError) throw refreshError; return live; } };
      const policy = createBudgetPolicy({ settings: store, balance, basePriceProfile: base, now: () => new Date(clock) });
      await policy.snapshot(); // 默认下限关闭
      await store.set(settings({ balanceFloor: { mode: 'stop', limitMicrounits: 10_000_000 } }));
      assert.equal((await policy.snapshot()).limits.daily, 20_000_000);
      live = view(9_000_000, new Date(clock).toISOString());
      await assert.rejects(policy.snapshot(), { code: 'AI_BALANCE_BELOW_FLOOR' });
      assert.equal(await policy.balanceBelowFloor((await store.get())), true);
      clock += 10 * 60_000; refreshError = new Error('offline'); live = view(50_000_000, new Date(clock - 10 * 60_000).toISOString());
      assert.equal((await policy.snapshot()).settings.rules.balanceFloor.mode, 'stop', '快照一小时内且读不到新余额时凭旧快照放行');
      clock += 2 * 3600_000;
      await assert.rejects(policy.snapshot(), { code: 'AI_BALANCE_FLOOR_UNVERIFIED' });
      await store.set(settings({ balanceFloor: { mode: 'warn', limitMicrounits: 10_000_000 } }));
      await policy.snapshot();
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  } },
  { name: '预算快照随自定义单价变化，设置损坏时整体拒绝付费调用', async run() {
    const dir = temp();
    try {
      const file = path.join(dir, 's.json');
      const store = createBudgetSettingsStore({ filePath: file });
      const policy = createBudgetPolicy({ settings: store, basePriceProfile: base });
      assert.equal((await policy.snapshot()).profile, base);
      await store.set(settings({}, { inputMicrounitsPerMillion: 1_000_000, outputMicrounitsPerMillion: 2_000_000 }));
      assert.equal((await policy.snapshot()).profile.version, 'base-v1+custom');
      fs.writeFileSync(file, 'not json');
      await assert.rejects(policy.snapshot(), { code: 'AI_BUDGET_SETTINGS_INVALID' });
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  } },
  { name: '提醒阈值：默认 50/80/100，去重排序，非法值被拒；旧设置缺省阈值时用默认', run() {
    assert.deepEqual(normalizeBudgetSettings(settings()).alerts.thresholds, [50, 80, 100]);
    assert.deepEqual(normalizeBudgetSettings({ ...settings(), alerts: { thresholds: [90, 30, 90] } }).alerts.thresholds, [30, 90]);
    for (const bad of [[0], [101], [1.5], ['50'], [1, 2, 3, 4, 5, 6, 7], 'x']) {
      assert.throws(() => normalizeBudgetSettings({ ...settings(), alerts: { thresholds: bad } }), { code: 'AI_BUDGET_SETTINGS_INVALID' });
    }
    assert.throws(() => normalizeBudgetSettings({ ...settings(), alerts: { thresholds: [50], extra: 1 } }), { code: 'AI_BUDGET_SETTINGS_INVALID' });
  } },
  { name: '提醒评估：只看每日/每月且规则未关闭，已用含占用的预留，整数比较；每个周期每个阈值一个标识', run() {
    const cfg = normalizeBudgetSettings(settings({ daily: { mode: 'warn', limitMicrounits: 10_000_000 }, monthly: { mode: 'stop', limitMicrounits: 100_000_000 } }));
    const status = { spentMicrounits: 4_000_000, heldMicrounits: 1_000_000, monthSpentMicrounits: 79_000_000, monthHeldMicrounits: 0 };
    const result = evaluateAlerts({ settings: cfg, status, day: '2026-10-08' });
    assert.deepEqual(result.alerts.map(item => item.id), ['daily:2026-10-08:50', 'monthly:2026-10:50']);
    const hundred = evaluateAlerts({ settings: cfg, status: { ...status, spentMicrounits: 10_000_000, heldMicrounits: 0 }, day: '2026-10-08' });
    assert.deepEqual(hundred.alerts.filter(item => item.rule === 'daily').map(item => item.threshold), [50, 80, 100]);
    const off = normalizeBudgetSettings(settings({ daily: { mode: 'off', limitMicrounits: null } }));
    assert.equal(evaluateAlerts({ settings: off, status, day: '2026-10-08' }).alerts.some(item => item.rule === 'daily'), false);
  } },
  { name: '提醒状态：标记通知/关闭只记一次，放行只在当月/当日有效，无效输入被拒，损坏文件按无记录处理', async run() {
    const dir = temp();
    try {
      const file = path.join(dir, 'a.json');
      const store = createBudgetAlertStore({ filePath: file });
      await store.mark(['daily:2026-10-08:80'], 'notified', '2026-10-08');
      await store.mark(['daily:2026-10-08:80'], 'dismissed', '2026-10-08');
      assert.deepEqual((await store.get()).marks['daily:2026-10-08:80'], { notified: true, dismissed: true });
      for (const bad of [[], ['x'], ['daily:2026-10-08:80'], Array(25).fill('daily:2026-10-08:80')]) {
        if (Array.isArray(bad) && bad.length === 1 && bad[0] === 'daily:2026-10-08:80') await assert.rejects(store.mark(bad, 'seen', '2026-10-08'), { code: 'AI_BUDGET_ALERT_INVALID' });
        else await assert.rejects(store.mark(bad, 'notified', '2026-10-08'), { code: 'AI_BUDGET_ALERT_INVALID' });
      }
      await assert.rejects(store.allow('daily', '2026-10-07', '2026-10-08'), { code: 'AI_BUDGET_ALERT_INVALID' });
      await assert.rejects(store.allow('turn', '2026-10-08', '2026-10-08'), { code: 'AI_BUDGET_ALERT_INVALID' });
      await store.allow('monthly', '2026-10', '2026-10-08');
      const cfg = normalizeBudgetSettings(settings());
      const status = { spentMicrounits: 0, heldMicrounits: 0, monthSpentMicrounits: 0, monthHeldMicrounits: 0 };
      assert.deepEqual(evaluateAlerts({ settings: cfg, status, overrides: (await store.get()).overrides, day: '2026-10-20' }).overrides, [{ rule: 'monthly', period: '2026-10' }]);
      assert.deepEqual(evaluateAlerts({ settings: cfg, status, overrides: (await store.get()).overrides, day: '2026-11-01' }).overrides, [], '下个月放行自动失效');
      fs.writeFileSync(file, 'garbage');
      assert.deepEqual(await store.get(), { marks: {}, overrides: {}, pauses: {}, invalid: true }, '损坏必须被识别，不能当作没有记录');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  } },
  { name: '放行让“达到即停”的规则在当前周期内不再限制预留，周期之外不影响', async run() {
    const dir = temp();
    try {
      const settingsStore = createBudgetSettingsStore({ filePath: path.join(dir, 's.json') });
      const alerts = createBudgetAlertStore({ filePath: path.join(dir, 'a.json') });
      let clock = Date.parse('2026-10-08T04:00:00.000Z');
      const policy = createBudgetPolicy({ settings: settingsStore, alerts, basePriceProfile: base, now: () => new Date(clock) });
      assert.equal((await policy.snapshot()).limits.daily, 20_000_000);
      await alerts.allow('daily', '2026-10-08', '2026-10-08');
      assert.equal((await policy.snapshot()).limits.daily, null);
      assert.equal((await policy.view()).limits.turn, 2_000_000, '单次回合上限不受放行影响');
      clock += 24 * 3600_000;
      assert.equal((await policy.snapshot()).limits.daily, 20_000_000, '第二天恢复拦截');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  } },
  { name: '余额下限状态判断只凭新鲜快照：过期的低余额快照不封锁助手，调用前检查才联网刷新', async run() {
    const dir = temp();
    try {
      const store = createBudgetSettingsStore({ filePath: path.join(dir, 's.json') });
      await store.set(settings({ balanceFloor: { mode: 'stop', limitMicrounits: 10_000_000 } }));
      let clock = Date.parse('2026-10-08T05:00:00.000Z');
      const at = ms => new Date(clock - ms).toISOString();
      const view = (total, checkedAt) => ({ checkedAt, latest: { at: checkedAt, isAvailable: true,
        balances: [{ currency: 'CNY', totalMicrounits: total, grantedMicrounits: 0, toppedUpMicrounits: total }] } });
      let live = view(9_000_000, at(2 * 3600_000)); // 两小时前的低余额，其后用户可能已充值
      let refreshed = 0;
      const balance = { view: async () => live, refresh: async () => { refreshed += 1; live = view(50_000_000, at(0)); return live; } };
      const policy = createBudgetPolicy({ settings: store, balance, basePriceProfile: base, now: () => new Date(clock) });
      const current = await store.get();
      assert.equal(await policy.balanceBelowFloor(current), false, '过期快照不作为封锁依据');
      await policy.snapshot(); // 调用前检查联网刷新到 ¥50，放行
      assert.equal(refreshed, 1);
      live = view(9_000_000, at(60_000));
      assert.equal(await policy.balanceBelowFloor(current), true, '新鲜的低余额快照仍如实提示');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  } },
  { name: '执行器在等待预算策略期间被关闭：不再启动任务进程', async run() {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    let spawned = 0;
    const worker = createIsolatedAiWorker({ repository: {}, budget: {}, gateway: {}, modelSettings: {}, readContext: null,
      priceProfile: base, allowExternal: true, policy: { snapshot: async () => { await gate; return { profile: base, limits: { daily: 1, monthly: null, turn: null } }; } },
      spawn: () => { spawned += 1; throw new Error('must not spawn'); } });
    const running = worker.run('job-1', { mode: 'hang' });
    await new Promise(resolve => setTimeout(resolve, 10));
    await worker.close();
    release();
    await assert.rejects(running, { code: 'AI_GENERATION_UNAVAILABLE' });
    assert.equal(spawned, 0);
  } },
  { name: '暂停只在当前周期有效且不改写设置：暂停后付费调用被拒，放行或恢复可解除，次日自动恢复', async run() {
    const dir = temp();
    try {
      const settingsStore = createBudgetSettingsStore({ filePath: path.join(dir, 's.json') });
      const alerts = createBudgetAlertStore({ filePath: path.join(dir, 'a.json') });
      let clock = Date.parse('2026-10-08T04:00:00.000Z');
      const policy = createBudgetPolicy({ settings: settingsStore, alerts, basePriceProfile: base, now: () => new Date(clock) });
      const before = JSON.stringify(await settingsStore.get());
      await policy.snapshot();
      await alerts.pause('daily', '2026-10-08', '2026-10-08');
      await assert.rejects(policy.snapshot(), { code: 'AI_PAUSED_BY_USER' });
      assert.deepEqual((await policy.view()).paused, ['daily']);
      assert.equal(JSON.stringify(await settingsStore.get()), before, '暂停不改写预算设置');
      await assert.rejects(alerts.pause('daily', '2026-10-07', '2026-10-08'), { code: 'AI_BUDGET_ALERT_INVALID' });
      await alerts.resume('daily', '2026-10-08', '2026-10-08');
      await policy.snapshot();
      await alerts.pause('daily', '2026-10-08', '2026-10-08');
      await alerts.allow('daily', '2026-10-08', '2026-10-08'); // 放行同时解除暂停
      assert.equal((await policy.snapshot()).limits.daily, null);
      await alerts.pause('daily', '2026-10-08', '2026-10-08'); // 再次暂停会取消放行
      assert.deepEqual((await alerts.get()).overrides, {});
      clock += 24 * 3600_000;
      await policy.snapshot(); // 第二天自动恢复
      const status = { spentMicrounits: 0, heldMicrounits: 0, monthSpentMicrounits: 0, monthHeldMicrounits: 0 };
      assert.deepEqual(evaluateAlerts({ settings: normalizeBudgetSettings(settings()), status, pauses: { daily: '2026-10-08' }, day: '2026-10-08' }).pauses, [{ rule: 'daily', period: '2026-10-08' }]);
      assert.deepEqual(evaluateAlerts({ settings: normalizeBudgetSettings(settings()), status, pauses: { daily: '2026-10-08' }, day: '2026-10-09' }).pauses, []);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  } },
  { name: '暂停状态文件损坏时 fail closed：不能被当作“没有暂停”，只有显式重置才恢复；旧版文件缺 pauses 仍有效', async run() {
    const dir = temp();
    try {
      const file = path.join(dir, 'a.json');
      const settingsStore = createBudgetSettingsStore({ filePath: path.join(dir, 's.json') });
      const alerts = createBudgetAlertStore({ filePath: file });
      const policy = createBudgetPolicy({ settings: settingsStore, alerts, basePriceProfile: base, now: () => new Date('2026-10-08T04:00:00.000Z') });
      assert.equal((await alerts.get()).invalid, false, '文件不存在是正常的空状态');
      fs.writeFileSync(file, JSON.stringify({ marks: {}, overrides: {} })); // 旧版本没有 pauses 字段
      assert.equal((await alerts.get()).invalid, false);
      await policy.snapshot();
      for (const bad of ['{not json', '{"marks":{},"overrides":{},"pauses":null}', '{"pauses":{"daily":5}}', '{"overrides":[]}', '[]', 'null', '{"marks":{"a":1}}']) {
        fs.writeFileSync(file, bad);
        assert.equal((await alerts.get()).invalid, true, bad);
        await assert.rejects(policy.snapshot(), { code: 'AI_BUDGET_ALERTS_INVALID' }, `${bad} 时付费调用被拒`);
        await assert.rejects(alerts.mark(['daily:2026-10-08:50'], 'dismissed', '2026-10-08'), { code: 'AI_BUDGET_ALERTS_INVALID' }, '不能借关闭横幅覆盖损坏的文件');
        assert.equal(fs.readFileSync(file, 'utf8'), bad, '拒绝时保留原文件');
      }
      fs.writeFileSync(file, '{"pauses":{"daily":"2026-10-08"}}');
      await assert.rejects(policy.snapshot(), { code: 'AI_PAUSED_BY_USER' });
      fs.writeFileSync(file, '{not json');
      await alerts.resume('daily', '2026-10-08', '2026-10-08'); // 显式重置
      assert.equal((await alerts.get()).invalid, false);
      await policy.snapshot();
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  } }
];
