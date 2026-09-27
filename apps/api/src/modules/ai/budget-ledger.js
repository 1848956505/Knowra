import { randomUUID } from 'node:crypto';

export const DAILY_LIMIT_MICROUNITS = 10_000_000;
export const JOB_LIMIT_MICROUNITS = 2_000_000;

function fail(code, message) { const error = new Error(message); error.code = code; throw error; }
function amount(value) { return Number.isSafeInteger(value) && value >= 0; }
function day(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value); }

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

export function budgetStatus(state, accountRef, date = beijingDay()) {
  const row = state.budgetDays.find(item => item.accountRef === accountRef && item.day === date);
  const spentMicrounits = row?.spentMicrounits ?? 0;
  const heldMicrounits = row?.heldMicrounits ?? 0;
  return { accountRef, day: date, limitMicrounits: DAILY_LIMIT_MICROUNITS, spentMicrounits, heldMicrounits,
    availableMicrounits: Math.max(0, DAILY_LIMIT_MICROUNITS - spentMicrounits - heldMicrounits) };
}

export function reserveBudget(state, input) {
  const { accountRef, jobId, attemptId, priceVersion, reservedMicrounits } = input ?? {};
  const date = input?.day ?? beijingDay();
  if (![accountRef, jobId, attemptId, priceVersion].every(value => typeof value === 'string' && /^[a-zA-Z0-9_.:-]{1,128}$/.test(value))
    || !day(date) || !amount(reservedMicrounits) || reservedMicrounits < 1 || reservedMicrounits > JOB_LIMIT_MICROUNITS) {
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
  if (jobTotal + reservedMicrounits > JOB_LIMIT_MICROUNITS) fail('AI_JOB_BUDGET_EXCEEDED', '任务预留超过 2 元。');
  let daily = state.budgetDays.find(row => row.accountRef === accountRef && row.day === date);
  if (!daily) { daily = { accountRef, day: date, spentMicrounits: 0, heldMicrounits: 0 }; state.budgetDays.push(daily); }
  if (daily.spentMicrounits + daily.heldMicrounits + reservedMicrounits > DAILY_LIMIT_MICROUNITS) {
    fail('AI_DAILY_BUDGET_EXCEEDED', '北京时间当日预算不足。');
  }
  daily.heldMicrounits += reservedMicrounits;
  const record = { reservationId: randomUUID(), accountRef, day: date, jobId, attemptId, priceVersion,
    reservedMicrounits, actualMicrounits: null, status: 'held', createdAt: new Date().toISOString(), settledAt: null };
  state.budgetReservations.push(record);
  return structuredClone(record);
}

export function settleBudget(state, { accountRef, attemptId, actualMicrounits = null, disposition = 'unknown' } = {}) {
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
  row.settledAt = new Date().toISOString();
  return structuredClone(row);
}

export function createJsonBudgetAuthority({ getState, runTransaction, onChange }) {
  return {
    status: (accountRef, date) => budgetStatus(getState(), accountRef, date),
    reserve: input => runTransaction(() => { const result = reserveBudget(getState(), input); onChange(); return result; }),
    settle: input => runTransaction(() => { const result = settleBudget(getState(), input); onChange(); return result; })
  };
}
