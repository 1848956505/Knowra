import { effectivePriceProfile, enforcedLimits } from './budget-settings.js';
import { beijingDay } from './budget-ledger.js';
import { periodOf } from './budget-alerts.js';

const FRESH_MS = 5 * 60_000;
const STALE_BLOCK_MS = 60 * 60_000;
const fail = (code, message) => Object.assign(new Error(message), { code });

/**
 * 把用户的预算设置落实到一次付费调用上：读取当前设置，给出这次调用实际使用的价格档案、预留上限，
 * 并在“余额下限”为“达到即停”时核对账户余额。设置损坏时抛错，调用被拒绝（fail closed）。
 * 每次调用取一份快照，同一次调用内的预留、发送、结算使用同一份价格，不受中途修改影响。
 */
export function createBudgetPolicy({ settings, balance = null, alerts = null, basePriceProfile, now = () => new Date() }) {
  if (!settings || !basePriceProfile) throw new TypeError('预算策略需要设置存储和价格档案。');

  async function assertBalance(current) {
    const rule = current.rules.balanceFloor;
    if (rule.mode !== 'stop') return;
    if (!balance) throw fail('AI_BALANCE_FLOOR_UNVERIFIED', '已设置账户余额下限，但当前运行端无法读取余额，已阻止模型调用。');
    let view = await balance.view();
    const checkedAt = view.checkedAt ? Date.parse(view.checkedAt) : 0;
    if (now().getTime() - checkedAt > FRESH_MS) {
      try { view = await balance.refresh(); }
      catch {
        // 读不到最新余额时，只有一小时内的快照才可凭借；否则拒绝，避免在无法确认的情况下继续花钱。
        if (now().getTime() - checkedAt > STALE_BLOCK_MS) {
          throw fail('AI_BALANCE_FLOOR_UNVERIFIED', '无法确认账户余额是否高于下限，已阻止模型调用。可在设置中改为“仅提醒”。');
        }
      }
    }
    const cny = view.latest?.balances.find(row => row.currency === 'CNY');
    if (!cny) throw fail('AI_BALANCE_FLOOR_UNVERIFIED', '账户没有人民币余额记录，已阻止模型调用。');
    if (cny.totalMicrounits < rule.limitMicrounits) throw fail('AI_BALANCE_BELOW_FLOOR', '账户余额低于设定的下限，已暂停模型调用。可在设置中调整下限。');
  }

  // 用户对当前周期的放行与暂停：放行使该规则本周期内不再限制预留；暂停使本周期内不再发起付费调用。周期结束自动失效。
  async function limitsFor(current) {
    const limits = enforcedLimits(current);
    if (!alerts) return { limits, paused: [] };
    const { overrides, pauses } = await alerts.get();
    const day = beijingDay(now());
    for (const rule of ['daily', 'monthly']) if (overrides[rule] === periodOf(rule, day)) limits[rule] = null;
    const paused = ['daily', 'monthly'].filter(rule => pauses?.[rule] === periodOf(rule, day));
    return { limits, paused };
  }

  return {
    /** 一次付费调用前取快照：设置、价格档案、账本上限；余额下限不满足时抛错。 */
    async snapshot() {
      const current = await settings.get();
      const { limits, paused } = await limitsFor(current);
      if (paused.length) {
        throw fail('AI_PAUSED_BY_USER', `AI 已按您的操作暂停至${paused.includes('monthly') ? '下月' : '明天'}，可在费用提醒处恢复。`);
      }
      await assertBalance(current);
      return { settings: current, profile: effectivePriceProfile(basePriceProfile, current.price), limits };
    },
    /** 只读视图，不联网：供状态接口使用。 */
    async view() {
      const current = await settings.get();
      const { limits, paused } = await limitsFor(current);
      return { settings: current, profile: effectivePriceProfile(basePriceProfile, current.price), limits, paused };
    },
    /** 状态接口用：仅凭已保存的余额快照判断是否已低于下限，不联网。 */
    async balanceBelowFloor(current) {
      const rule = current.rules.balanceFloor;
      if (rule.mode !== 'stop' || !balance) return false;
      const view = await balance.view().catch(() => null);
      // 只凭新鲜的快照判断：过期的低余额快照不能成为持续封锁的依据（用户可能已充值），
      // 过期时放行到调用前检查，那里会联网刷新真实余额。
      if (!view?.checkedAt || now().getTime() - Date.parse(view.checkedAt) > FRESH_MS) return false;
      const cny = view.latest?.balances.find(row => row.currency === 'CNY');
      return Boolean(cny) && cny.totalMicrounits < rule.limitMicrounits;
    }
  };
}
