import { randomUUID } from 'node:crypto';

export const DAILY_LIMIT_MICROUNITS = 20_000_000;
export const JOB_LIMIT_MICROUNITS = 2_000_000;

function fail(code, message) { const error = new Error(message); error.code = code; throw error; }
function amount(value) { return Number.isSafeInteger(value) && value >= 0; }
function day(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value); }
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
// 模型名与会话 ID 只做长度和控制字符检查：会话 ID 可能含中文等字符（如“会话/已导入”），不能因此拒绝结算。
const label = value => typeof value === 'string' && value.length >= 1 && value.length <= 128 && !/[\u0000-\u001f\u007f]/.test(value) ? value : null;

/**
 * 用量明细只含模型名、token 数和所属对话 ID，不含任何对话内容；旧账本没有该字段，视为未记录。
 * 明细只用于展示，所以这里只清洗、不拒绝：付费调用已经发生，明细异常绝不能让结算失败而继续占用预算。
 */
export function normalizeUsage(usage) {
  if (!usage || typeof usage !== 'object' || Array.isArray(usage)) return null;
  const inputTokens = count(usage.inputTokens);
  const cacheHitTokens = count(usage.cacheHitTokens);
  return { modelId: label(usage.modelId), inputTokens, outputTokens: count(usage.outputTokens),
    cacheHitTokens: cacheHitTokens !== null && inputTokens !== null && cacheHitTokens > inputTokens ? null : cacheHitTokens,
    conversationId: label(usage.conversationId) };
}

export function beijingDay(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function validateBudgetState(state) {
  state.budgetDays ??= [];
  state.budgetReservations ??= [];
  if (!Array.isArray(state.budgetDays) || !Array.isArray(state.budgetReservations)) fail('AI_BUDGET_INVALID', '预算账本结构无效。');
  const keys = new Set();
  for (const row of state.budgetDays) {
    if (!row.accountRef || !day(row.day) || !amount(row.spentMicrounits) || !amount(row.heldMicrounits)
      || keys.has(`${row.accountRef}:${row.day}`)) fail('AI_BUDGET_INVALID', '预算日账本无效。');
    keys.add(`${row.accountRef}:${row.day}`);
  }
  const attempts = new Set();
  const reservationIds = new Set();
  for (const row of state.budgetReservations) {
    if (!row.reservationId || !row.accountRef || !day(row.day) || !row.jobId || !row.attemptId
      || !amount(row.reservedMicrounits) || !['held', 'settled', 'unknown', 'released'].includes(row.status)
      || row.status === 'settled' && (!amount(row.actualMicrounits) || row.actualMicrounits > row.reservedMicrounits)
      || row.status !== 'settled' && row.actualMicrounits !== null
      || row.usage !== undefined && row.usage !== null && (typeof row.usage !== 'object' || Array.isArray(row.usage))
      || !keys.has(`${row.accountRef}:${row.day}`)
      || attempts.has(`${row.accountRef}:${row.attemptId}`) || reservationIds.has(row.reservationId)) {
      fail('AI_BUDGET_INVALID', '预算预留记录无效。');
    }
    attempts.add(`${row.accountRef}:${row.attemptId}`);
    reservationIds.add(row.reservationId);
  }
  for (const row of state.budgetDays) {
    const entries = state.budgetReservations.filter(item => item.accountRef === row.accountRef && item.day === row.day);
    if (row.heldMicrounits !== entries.filter(item => ['held', 'unknown'].includes(item.status)).reduce((sum, item) => sum + item.reservedMicrounits, 0)
      || row.spentMicrounits !== entries.filter(item => item.status === 'settled').reduce((sum, item) => sum + item.actualMicrounits, 0)) {
      fail('AI_BUDGET_INVALID', '预算日账本与预留记录不一致。');
    }
  }
  return state;
}

/** 未传 limits 时沿用改造前的默认：每日 20 元、单回合 2 元、无月上限；传入的 null 表示该规则不限制预留。 */
export const DEFAULT_LIMITS = Object.freeze({ daily: DAILY_LIMIT_MICROUNITS, monthly: null, turn: JOB_LIMIT_MICROUNITS });

function checkLimits(limits) {
  if (limits === undefined) return DEFAULT_LIMITS;
  if (!limits || typeof limits !== 'object' || Object.keys(limits).some(key => !['daily', 'monthly', 'turn'].includes(key))
    || !['daily', 'monthly', 'turn'].every(key => limits[key] === null || Number.isSafeInteger(limits[key]) && limits[key] >= 1)) {
    fail('AI_BUDGET_REQUEST_INVALID', '预算上限参数无效。');
  }
  return limits;
}

const monthTotals = (state, accountRef, date) => state.budgetDays
  .filter(row => row.accountRef === accountRef && row.day.startsWith(date.slice(0, 7)))
  .reduce((sum, row) => ({ spent: sum.spent + row.spentMicrounits, held: sum.held + row.heldMicrounits }), { spent: 0, held: 0 });

/** limitMicrounits / availableMicrounits 为 null 表示当日规则不是“达到即停”，不限制调用。 */
export function budgetStatus(state, accountRef, date = beijingDay(), limits) {
  const { daily, monthly } = checkLimits(limits);
  const row = state.budgetDays.find(item => item.accountRef === accountRef && item.day === date);
  const spentMicrounits = row?.spentMicrounits ?? 0;
  const heldMicrounits = row?.heldMicrounits ?? 0;
  const month = monthTotals(state, accountRef, date);
  return { accountRef, day: date, limitMicrounits: daily, spentMicrounits, heldMicrounits,
    availableMicrounits: daily === null ? null : Math.max(0, daily - spentMicrounits - heldMicrounits),
    monthLimitMicrounits: monthly, monthSpentMicrounits: month.spent, monthHeldMicrounits: month.held,
    monthAvailableMicrounits: monthly === null ? null : Math.max(0, monthly - month.spent - month.held) };
}

export function reserveBudget(state, input) {
  const { accountRef, jobId, attemptId, priceVersion, reservedMicrounits } = input ?? {};
  const { daily: dailyLimit, monthly: monthlyLimit, turn: turnLimit } = checkLimits(input?.limits);
  const date = input?.day ?? beijingDay();
  if (![accountRef, jobId, attemptId, priceVersion].every(value => typeof value === 'string' && /^[a-zA-Z0-9_.:-]{1,128}$/.test(value))
    || !day(date) || !amount(reservedMicrounits) || reservedMicrounits < 1 || reservedMicrounits > JOB_LIMIT_MICROUNITS) { // 单次请求最坏费用上限是始终保留的技术护栏
    fail('AI_BUDGET_REQUEST_INVALID', '预算预留参数无效。');
  }
  const existing = state.budgetReservations.find(row => row.accountRef === accountRef && row.attemptId === attemptId);
  if (existing) {
    if (existing.jobId !== jobId || existing.priceVersion !== priceVersion || existing.reservedMicrounits !== reservedMicrounits) {
      fail('AI_BUDGET_CONFLICT', '尝试 ID 已绑定其他预算请求。');
    }
    return structuredClone(existing);
  }
  const jobTotal = state.budgetReservations.filter(row => row.accountRef === accountRef && row.jobId === jobId)
    .reduce((sum, row) => sum + row.reservedMicrounits, 0);
  if (turnLimit !== null && jobTotal + reservedMicrounits > turnLimit) fail('AI_JOB_BUDGET_EXCEEDED', `单次回合预留超过 ${(turnLimit / 1_000_000).toFixed(2)} 元上限。`);
  let daily = state.budgetDays.find(row => row.accountRef === accountRef && row.day === date);
  if (!daily) { daily = { accountRef, day: date, spentMicrounits: 0, heldMicrounits: 0 }; state.budgetDays.push(daily); }
  if (dailyLimit !== null && daily.spentMicrounits + daily.heldMicrounits + reservedMicrounits > dailyLimit) {
    fail('AI_DAILY_BUDGET_EXCEEDED', '北京时间当日预算不足。');
  }
  if (monthlyLimit !== null) {
    const month = monthTotals(state, accountRef, date);
    if (month.spent + month.held + reservedMicrounits > monthlyLimit) fail('AI_MONTHLY_BUDGET_EXCEEDED', '本月预算不足。');
  }
  daily.heldMicrounits += reservedMicrounits;
  const record = { reservationId: randomUUID(), accountRef, day: date, jobId, attemptId, priceVersion,
    reservedMicrounits, actualMicrounits: null, status: 'held', createdAt: new Date().toISOString(), settledAt: null };
  state.budgetReservations.push(record);
  return structuredClone(record);
}

export function settleBudget(state, { accountRef, attemptId, actualMicrounits = null, disposition = 'unknown', usage } = {}) {
  const detail = normalizeUsage(usage);
  const row = state.budgetReservations.find(item => item.accountRef === accountRef && item.attemptId === attemptId);
  if (!row) fail('AI_BUDGET_NOT_FOUND', '预算预留不存在。');
  if (row.status !== 'held' && !(row.status === 'unknown' && ['settled', 'released'].includes(disposition))) {
    if (row.status === disposition && row.actualMicrounits === actualMicrounits) return structuredClone(row);
    fail('AI_BUDGET_CONFLICT', '预算预留已结算。');
  }
  if (!['settled', 'unknown', 'released'].includes(disposition)
    || disposition === 'settled' && !amount(actualMicrounits)
    || disposition !== 'settled' && actualMicrounits !== null
    || disposition === 'settled' && actualMicrounits > row.reservedMicrounits) {
    fail('AI_BUDGET_SETTLEMENT_INVALID', '预算结算无效或超过预留额。');
  }
  const daily = state.budgetDays.find(item => item.accountRef === row.accountRef && item.day === row.day);
  if (disposition !== 'unknown') daily.heldMicrounits -= row.reservedMicrounits;
  if (disposition === 'settled') daily.spentMicrounits += actualMicrounits;
  row.status = disposition;
  row.actualMicrounits = actualMicrounits;
  if (detail) row.usage = detail;
  row.settledAt = new Date().toISOString();
  return structuredClone(row);
}

const RECENT_LIMIT = 50;
const emptyTotals = () => ({ requests: 0, spentMicrounits: 0, unknownRequests: 0, unknownMicrounits: 0,
  inputTokens: 0, outputTokens: 0, cacheHitTokens: 0 });

/**
 * 用量汇总：只读，不拦截任何请求。今日/本月按北京时间自然日归属，累计覆盖账本内全部记录。
 * 已结算的请求按实际费用计入；结果未知的请求单独计数，其预留额仍占用额度，不计入“已花费”。
 */
export function usageSummary(state, accountRef, date = beijingDay(), limit = RECENT_LIMIT) {
  const month = date.slice(0, 7);
  const periods = { today: emptyTotals(), month: emptyTotals(), total: emptyTotals() };
  const rows = state.budgetReservations.filter(row => row.accountRef === accountRef && row.status !== 'held' && row.status !== 'released');
  for (const row of rows) {
    // 读取时统一清洗：账本里已有的明细字段可能被损坏或旧版写入，汇总与展示不能因此出现字符串拼接、NaN 或崩溃。
    const detail = normalizeUsage(row.usage);
    const targets = [periods.total];
    if (row.day === date) targets.push(periods.today);
    if (row.day.startsWith(month)) targets.push(periods.month);
    for (const totals of targets) {
      totals.requests += 1;
      if (row.status === 'settled') totals.spentMicrounits += row.actualMicrounits;
      else { totals.unknownRequests += 1; totals.unknownMicrounits += row.reservedMicrounits; }
      totals.inputTokens += detail?.inputTokens ?? 0;
      totals.outputTokens += detail?.outputTokens ?? 0;
      totals.cacheHitTokens += detail?.cacheHitTokens ?? 0;
    }
  }
  // 先倒序再稳定排序：同一毫秒内结算的请求，后写入的排前面。
  const recent = rows.toReversed().toSorted((a, b) => (b.settledAt ?? b.createdAt).localeCompare(a.settledAt ?? a.createdAt)).slice(0, limit)
    .map(row => {
      const detail = normalizeUsage(row.usage);
      return { attemptId: row.attemptId, day: row.day, at: row.settledAt ?? row.createdAt, status: row.status,
        costMicrounits: row.status === 'settled' ? row.actualMicrounits : row.reservedMicrounits,
        modelId: detail?.modelId ?? null, inputTokens: detail?.inputTokens ?? null,
        outputTokens: detail?.outputTokens ?? null, cacheHitTokens: detail?.cacheHitTokens ?? null,
        conversationId: detail?.conversationId ?? null, priceVersion: row.priceVersion };
    });
  return { accountRef, currency: 'CNY', day: date, ...periods, recent };
}

export function createJsonBudgetAuthority({ getState, runTransaction, onChange }) {
  return {
    status: (accountRef, date, limits) => budgetStatus(getState(), accountRef, date, limits),
    usage: (accountRef, date) => usageSummary(getState(), accountRef, date),
    reserve: input => runTransaction(() => { const result = reserveBudget(getState(), input); onChange(); return result; }),
    settle: input => runTransaction(() => { const result = settleBudget(getState(), input); onChange(); return result; })
  };
}
