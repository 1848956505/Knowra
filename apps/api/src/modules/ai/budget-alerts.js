import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const ALERT_RULES = ['daily', 'monthly'];
const ID_PATTERN = /^(daily|monthly):(\d{4}-\d{2}(?:-\d{2})?):(\d{1,3})$/;
const KEEP_DAYS = 70;
const invalid = message => Object.assign(new Error(message), { code: 'AI_BUDGET_ALERT_INVALID' });

export const periodOf = (rule, day) => rule === 'daily' ? day : day.slice(0, 7);

/**
 * 计算当前周期内已越过的提醒阈值。只看“每日”“每月”两条规则，且规则不是“关闭”时才提醒；
 * 已用额度 = 已结算 + 仍占用的预留（与拦截口径一致）。金额与阈值均为整数，按乘法比较避免浮点误差。
 */
export function evaluateAlerts({ settings, status, marks = {}, overrides = {}, day }) {
  const alerts = [];
  const rows = { daily: { used: status.spentMicrounits + status.heldMicrounits },
    monthly: { used: status.monthSpentMicrounits + status.monthHeldMicrounits } };
  for (const rule of ALERT_RULES) {
    const config = settings.rules[rule];
    if (config.mode === 'off') continue;
    const period = periodOf(rule, day);
    for (const threshold of settings.alerts.thresholds) {
      if (rows[rule].used * 100 < threshold * config.limitMicrounits) continue;
      const id = `${rule}:${period}:${threshold}`;
      alerts.push({ id, rule, threshold, period, mode: config.mode, usedMicrounits: rows[rule].used,
        limitMicrounits: config.limitMicrounits, notified: Boolean(marks[id]?.notified), dismissed: Boolean(marks[id]?.dismissed) });
    }
  }
  const allowed = ALERT_RULES.filter(rule => overrides[rule] === periodOf(rule, day)).map(rule => ({ rule, period: overrides[rule] }));
  return { day, alerts, overrides: allowed };
}

/**
 * 提醒状态：每个周期每个阈值只提醒一次（notified），用户可关闭横幅（dismissed），
 * 并可对当前周期放行被“达到即停”拦截的规则（overrides，周期结束自动失效）。
 * 这些只是提示与便利，文件缺失或损坏时按“没有记录”处理，不影响任何拦截。
 */
export function createBudgetAlertStore({ filePath }) {
  if (!path.isAbsolute(filePath ?? '')) throw new TypeError('预算提醒需要绝对路径。');
  let queue = Promise.resolve();
  async function load() {
    try {
      const parsed = JSON.parse(await fs.readFile(filePath, 'utf8'));
      const marks = parsed?.marks && typeof parsed.marks === 'object' && !Array.isArray(parsed.marks) ? parsed.marks : {};
      const overrides = parsed?.overrides && typeof parsed.overrides === 'object' && !Array.isArray(parsed.overrides) ? parsed.overrides : {};
      return { marks, overrides };
    } catch { return { marks: {}, overrides: {} }; }
  }
  async function save(state, today) {
    // 只保留近期周期的标记，避免文件无限增长。
    const cutoff = new Date(Date.parse(`${today}T00:00:00Z`) - KEEP_DAYS * 24 * 3600_000).toISOString().slice(0, 10);
    const marks = Object.fromEntries(Object.entries(state.marks).filter(([id]) => {
      const period = ID_PATTERN.exec(id)?.[2];
      return period && `${period}${period.length === 7 ? '-31' : ''}` >= cutoff;
    }));
    await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
    const temp = `${filePath}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temp, JSON.stringify({ marks, overrides: state.overrides }), { mode: 0o600, flag: 'wx' });
      await fs.rename(temp, filePath);
    } finally { await fs.rm(temp, { force: true }).catch(() => undefined); }
  }
  const serial = work => { const run = queue.then(work); queue = run.catch(() => undefined); return run; };
  return {
    get: () => serial(load),
    /** 标记提醒：kind 为 notified（已推送系统通知）或 dismissed（已关闭横幅）。 */
    mark: (ids, kind, today) => serial(async () => {
      if (!Array.isArray(ids) || ids.length === 0 || ids.length > 24 || !ids.every(id => typeof id === 'string' && ID_PATTERN.test(id))
        || !['notified', 'dismissed'].includes(kind)) throw invalid('提醒标记无效。');
      const state = await load();
      for (const id of ids) state.marks[id] = { ...state.marks[id], [kind]: true };
      await save(state, today);
    }),
    /** 放行：当前周期内不再因该规则拦截。 */
    allow: (rule, period, today) => serial(async () => {
      if (!ALERT_RULES.includes(rule) || period !== periodOf(rule, today)) throw invalid('放行请求无效。');
      const state = await load();
      state.overrides[rule] = period;
      await save(state, today);
    })
  };
}
