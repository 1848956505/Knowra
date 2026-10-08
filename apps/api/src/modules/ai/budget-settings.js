import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const RULE_NAMES = ['daily', 'monthly', 'turn', 'balanceFloor'];
export const MODES = ['off', 'warn', 'stop'];
const MAX_LIMIT = 100_000_000_000; // 十万元，防止误输入
const MAX_PRICE = 1_000_000_000; // 每百万 token 一千元

/** 默认值与改造前的写死行为一致：每日 20 元、单次回合 2 元，均为“达到即停”。 */
export const DEFAULT_BUDGET_SETTINGS = Object.freeze({
  rules: Object.freeze({
    daily: Object.freeze({ mode: 'stop', limitMicrounits: 20_000_000 }),
    monthly: Object.freeze({ mode: 'off', limitMicrounits: null }),
    turn: Object.freeze({ mode: 'stop', limitMicrounits: 2_000_000 }),
    balanceFloor: Object.freeze({ mode: 'off', limitMicrounits: null })
  }),
  price: null,
  alerts: Object.freeze({ thresholds: Object.freeze([50, 80, 100]) })
});

const invalid = message => Object.assign(new Error(message), { code: 'AI_BUDGET_SETTINGS_INVALID' });
const money = value => Number.isSafeInteger(value) && value >= 1 && value <= MAX_LIMIT;
const price = value => Number.isSafeInteger(value) && value >= 0 && value <= MAX_PRICE;

/** 校验并规范化；未知字段、非法模式或金额一律拒绝。 */
export function normalizeBudgetSettings(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some(key => !['rules', 'price', 'alerts'].includes(key)) || !input.rules || typeof input.rules !== 'object') {
    throw invalid('预算设置格式无效。');
  }
  const rules = {};
  for (const name of RULE_NAMES) {
    const rule = input.rules[name];
    if (!rule || typeof rule !== 'object' || Object.keys(rule).some(key => !['mode', 'limitMicrounits'].includes(key))
      || !MODES.includes(rule.mode)) throw invalid('预算规则无效。');
    if (rule.mode === 'off') rules[name] = { mode: 'off', limitMicrounits: null };
    else if (money(rule.limitMicrounits)) rules[name] = { mode: rule.mode, limitMicrounits: rule.limitMicrounits };
    else throw invalid('预算金额无效。');
  }
  if (Object.keys(input.rules).some(key => !RULE_NAMES.includes(key))) throw invalid('预算规则无效。');
  let custom = null;
  if (input.price !== null && input.price !== undefined) {
    const { inputMicrounitsPerMillion, inputCacheHitMicrounitsPerMillion = null, outputMicrounitsPerMillion, updatedAt } = input.price;
    if (typeof input.price !== 'object' || Array.isArray(input.price)
      || Object.keys(input.price).some(key => !['inputMicrounitsPerMillion', 'inputCacheHitMicrounitsPerMillion', 'outputMicrounitsPerMillion', 'updatedAt'].includes(key))
      || !price(inputMicrounitsPerMillion) || !price(outputMicrounitsPerMillion)
      || inputCacheHitMicrounitsPerMillion !== null && (!price(inputCacheHitMicrounitsPerMillion) || inputCacheHitMicrounitsPerMillion > inputMicrounitsPerMillion)
      || updatedAt !== undefined && !Number.isFinite(Date.parse(updatedAt))) throw invalid('自定义单价无效。');
    custom = { inputMicrounitsPerMillion, inputCacheHitMicrounitsPerMillion, outputMicrounitsPerMillion,
      updatedAt: updatedAt ?? null };
  }
  // 提醒阈值：1–100 的整数百分比，去重排序，最多 6 个；缺省（旧文件、旧客户端）用默认值。
  let thresholds = [...DEFAULT_BUDGET_SETTINGS.alerts.thresholds];
  if (input.alerts !== undefined) {
    const list = input.alerts?.thresholds;
    if (!input.alerts || typeof input.alerts !== 'object' || Object.keys(input.alerts).some(key => key !== 'thresholds')
      || !Array.isArray(list) || list.length > 6 || !list.every(value => Number.isInteger(value) && value >= 1 && value <= 100)) {
      throw invalid('提醒阈值无效。');
    }
    thresholds = [...new Set(list)].sort((a, b) => a - b);
  }
  return { rules, price: custom, alerts: { thresholds } };
}

/** 把用户单价叠加到已核对的价格档案上；版本号带自定义标记，使账本能区分。 */
export function effectivePriceProfile(base, custom) {
  if (!custom) return base;
  const updated = custom.updatedAt ?? new Date(0).toISOString();
  return { ...base, version: `${base.version}+custom`, expiresAt: new Date(Date.parse(updated) + 30 * 24 * 3600_000).toISOString(),
    inputMicrounitsPerMillion: custom.inputMicrounitsPerMillion, outputMicrounitsPerMillion: custom.outputMicrounitsPerMillion,
    inputCacheHitMicrounitsPerMillion: custom.inputCacheHitMicrounitsPerMillion };
}

/** 账本实际执行的上限：只有“达到即停”的规则才限制预留，其余为 null。 */
export function enforcedLimits(settings) {
  const stop = name => settings.rules[name].mode === 'stop' ? settings.rules[name].limitMicrounits : null;
  return { daily: stop('daily'), monthly: stop('monthly'), turn: stop('turn') };
}

/**
 * 预算设置存储。文件缺失按默认值；文件损坏或无效时抛错（fail closed），不静默回到默认值，
 * 否则用户设置的更严格上限会被悄悄放宽。
 */
export function createBudgetSettingsStore({ filePath, now = () => new Date() }) {
  if (!path.isAbsolute(filePath ?? '')) throw new TypeError('预算设置需要绝对路径。');
  let writing = Promise.resolve();
  async function get() {
    let raw;
    try { raw = await fs.readFile(filePath, 'utf8'); }
    catch (error) {
      if (error?.code === 'ENOENT') return structuredClone(DEFAULT_BUDGET_SETTINGS);
      throw Object.assign(new Error('预算设置无法读取，已阻止模型调用。'), { code: 'AI_BUDGET_SETTINGS_INVALID' });
    }
    try { return normalizeBudgetSettings(JSON.parse(raw)); }
    catch { throw Object.assign(new Error('预算设置文件已损坏，已阻止模型调用；原文件已保留。'), { code: 'AI_BUDGET_SETTINGS_INVALID' }); }
  }
  async function set(input) {
    const next = normalizeBudgetSettings(input);
    if (next.price) next.price.updatedAt = now().toISOString();
    const run = writing.then(async () => {
      await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
      const temp = `${filePath}.${randomUUID()}.tmp`;
      try {
        await fs.writeFile(temp, JSON.stringify(next), { mode: 0o600, flag: 'wx' });
        await fs.rename(temp, filePath);
      } finally { await fs.rm(temp, { force: true }).catch(() => undefined); }
      return next;
    });
    writing = run.catch(() => undefined);
    return run;
  }
  return { get, set };
}
