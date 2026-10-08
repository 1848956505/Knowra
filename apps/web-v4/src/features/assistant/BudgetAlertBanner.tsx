import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui/button/Button';
import { useNavigate } from '../../app/router';
import { assistantApi, type BudgetAlert, type BudgetAlerts } from './assistantApi';
import { notifyAssistantStatusChanged } from './assistantEvents';
import styles from './BudgetAlertBanner.module.css';

const POLL_MS = 60_000;
const RULE_LABEL = { daily: '今日', monthly: '本月' } as const;
const yuan = (microunits: number) => `¥${(microunits / 1_000_000).toFixed(2)}`;

/** 每条规则只展示已越过的最高阈值；同规则更低的阈值一并视为已看过。 */
function visible(data: BudgetAlerts): Array<{ top: BudgetAlert; ids: string[]; allowed: boolean }> {
  const result: Array<{ top: BudgetAlert; ids: string[]; allowed: boolean }> = [];
  for (const rule of ['daily', 'monthly'] as const) {
    const list = data.alerts.filter(item => item.rule === rule).sort((a, b) => a.threshold - b.threshold);
    const top = list.at(-1);
    if (top && !top.dismissed) result.push({ top, ids: list.map(item => item.id), allowed: data.overrides.some(item => item.rule === rule) });
  }
  return result;
}

function systemNotify(alert: BudgetAlert) {
  try {
    if (!window.knowraDesktop || typeof Notification === 'undefined' || Notification.permission === 'denied') return;
    const blocked = alert.threshold >= 100 && alert.mode === 'stop';
    new Notification(blocked ? `知境 AI 已达${RULE_LABEL[alert.rule]}上限` : `知境 AI 用量已达${RULE_LABEL[alert.rule]}上限的 ${alert.threshold}%`, {
      body: `${RULE_LABEL[alert.rule]}已用 ${yuan(alert.usedMicrounits)} / ${yuan(alert.limitMicrounits)}。` });
  } catch { /* 系统通知不可用时仍有界面横幅。 */ }
}

export function BudgetAlertBanner() {
  const navigate = useNavigate();
  const [data, setData] = useState<BudgetAlerts | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const notifying = useRef(new Set<string>());

  const refresh = useCallback(async () => {
    try { setData(await assistantApi.alerts()); }
    catch { /* 未启用 AI 或暂时读不到时不打扰用户。 */ }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), POLL_MS);
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', onFocus); };
  }, [refresh]);

  // Mac 版：每个新越过的阈值发一次系统通知，然后记为已通知，不会重复。
  useEffect(() => {
    if (!data || !window.knowraDesktop) return;
    const fresh = data.alerts.filter(item => !item.notified && !notifying.current.has(item.id));
    if (!fresh.length) return;
    fresh.forEach(item => notifying.current.add(item.id));
    // 同一规则一次只通知最高的阈值，较低的直接记为已通知。
    for (const rule of ['daily', 'monthly'] as const) {
      const top = fresh.filter(item => item.rule === rule).sort((a, b) => b.threshold - a.threshold)[0];
      if (top) systemNotify(top);
    }
    void assistantApi.markAlerts(fresh.map(item => item.id), 'notified').then(setData).catch(() => undefined);
  }, [data]);

  /** statusChanged：该操作改变了助手能否发起调用（暂停/恢复/放行/重置），需要通知助手视图重新读取状态。 */
  async function run(action: () => Promise<BudgetAlerts | void>, statusChanged = false) {
    setBusy(true); setError('');
    try {
      const next = await action();
      if (next) setData(next); else await refresh();
      if (statusChanged) notifyAssistantStatusChanged();
    }
    catch (failure) { setError(failure instanceof Error && failure.message ? failure.message : '操作失败，请重试。'); }
    finally { setBusy(false); }
  }
  const dismiss = (ids: string[]) => run(() => assistantApi.markAlerts(ids, 'dismissed'));
  // 暂停只记录“本周期暂停”，不改写预算设置；周期结束自动恢复，也可随时提前恢复。
  const pause = (item: BudgetAlert, ids: string[]) => run(async () => {
    await assistantApi.pauseRule(item.rule);
    return assistantApi.markAlerts(ids, 'dismissed');
  }, true);

  const items = data ? visible(data).filter(({ top }) => !data.pauses.some(item => item.rule === top.rule)) : [];
  const pauses = data?.pauses ?? [];
  if (!items.length && !pauses.length && !data?.stateInvalid) return null;
  return <div className={styles.stack} role="region" aria-label="AI 费用提醒">
    {data?.stateInvalid ? <div className={`${styles.banner} ${styles.blocked}`} role="alert">
      <p>暂停/提醒状态文件已损坏，AI 已被阻止<span>（为避免误放行，不会自动忽略；重置后恢复正常）</span></p>
      <div className={styles.actions}>
        <Button size="compact" variant="primary" isDisabled={busy} onPress={() => void run(() => assistantApi.resumeRule('daily'), true)}>重置并恢复</Button>
      </div>
      {error ? <p role="alert" className={styles.error}>{error}</p> : null}
    </div> : null}
    {pauses.map(item => <div key={`pause:${item.rule}`} className={`${styles.banner} ${styles.blocked}`} role="status">
      <p>AI 已暂停至{item.rule === 'daily' ? '明天' : '下月'}<span>（按您的操作暂停，周期结束自动恢复）</span></p>
      <div className={styles.actions}>
        <Button size="compact" variant="primary" isDisabled={busy} onPress={() => void run(() => assistantApi.resumeRule(item.rule), true)}>立即恢复</Button>
      </div>
      {error ? <p role="alert" className={styles.error}>{error}</p> : null}
    </div>)}
    {items.map(({ top, ids, allowed }) => {
      const blocked = top.threshold >= 100 && top.mode === 'stop' && !allowed;
      const name = RULE_LABEL[top.rule];
      return <div key={top.id} className={`${styles.banner} ${blocked ? styles.blocked : ''}`} role={blocked ? 'alert' : 'status'}>
        <p>{blocked ? `${name}费用已达上限，AI 已暂停` : `${name} AI 费用已达上限的 ${top.threshold}%`}
          <span>（已用 {yuan(top.usedMicrounits)} / {yuan(top.limitMicrounits)}{allowed ? `，${name}已放行` : ''}）</span></p>
        <div className={styles.actions}>
          {blocked ? <Button size="compact" variant="primary" isDisabled={busy}
            onPress={() => void run(() => assistantApi.allowRule(top.rule), true)}>{name}放行</Button> : null}
          <Button size="compact" isDisabled={busy} onPress={() => navigate('/settings')}>提高上限</Button>
          {!blocked && !allowed
            ? <Button size="compact" isDisabled={busy} onPress={() => void pause(top, ids)}>暂停 AI 至{top.rule === 'daily' ? '明天' : '下月'}</Button> : null}
          <Button size="compact" variant="ghost" isDisabled={busy} onPress={() => void dismiss(ids)}>{blocked ? '关闭提示' : '继续'}</Button>
        </div>
        {error ? <p role="alert" className={styles.error}>{error}</p> : null}
      </div>;
    })}
  </div>;
}
