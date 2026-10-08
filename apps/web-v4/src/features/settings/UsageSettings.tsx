import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui/button/Button';
import { assistantApi, type AssistantBalance, type AssistantUsage, type UsageTotals } from '../assistant/assistantApi';
import { CREDENTIAL_CHANGED_EVENT } from './credentialEvents';
import styles from './SettingsView.module.css';

const yuan = (microunits: number) => `¥${(microunits / 1_000_000).toFixed(microunits > 0 && microunits < 10_000 ? 4 : 2)}`;
const tokens = (value: number | null) => value === null ? '—' : value.toLocaleString('zh-CN');
const time = (iso: string) => new Date(iso).toLocaleString('zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

function Summary({ label, totals }: { label: string; totals: UsageTotals }) {
  return <div className={styles.usageCell}>
    <span>{label}</span>
    <strong>{yuan(totals.spentMicrounits)}</strong>
    <small>{totals.requests} 次请求{totals.unknownRequests > 0 ? `，其中 ${totals.unknownRequests} 次结果未知` : ''}</small>
  </div>;
}

const symbol = (currency: string) => currency === 'USD' ? '$' : '¥';
const money = (currency: string, microunits: number) => `${symbol(currency)}${(microunits / 1_000_000).toFixed(2)}`;
const day = (iso: string) => new Date(iso).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });

function BalanceBlock() {
  const [balance, setBalance] = useState<AssistantBalance | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // 账户代际：更换 Key 后加一，更早发出的读取结果一律丢弃，不能把旧账户的余额显示成当前余额。
  const epoch = useRef(0);

  /** 只读已保存的快照（服务端按当前凭据过滤，换账户后为空）。 */
  const loadCached = useCallback(() => {
    const mine = epoch.current;
    assistantApi.balance().then(value => { if (mine === epoch.current) setBalance(value); })
      .catch(() => { if (mine === epoch.current) setBalance(null); });
  }, []);

  async function refresh() {
    const mine = epoch.current;
    setBusy(true); setError('');
    try {
      const value = await assistantApi.refreshBalance();
      if (mine === epoch.current) setBalance(value);
    } catch (failure) {
      if (mine !== epoch.current) return;
      if ((failure as { code?: string | null })?.code === 'AI_BALANCE_STALE') { setBalance(null); loadCached(); }
      // 如实显示服务端给出的原因（不支持、网络故障、限流、密钥被拒等），不统一解释成“不支持”。
      setError(failure instanceof Error && failure.message ? failure.message : '读取余额失败，请稍后重试。');
    } finally { if (mine === epoch.current) setBusy(false); }
  }
  useEffect(() => {
    loadCached();
    const onCredentialChanged = () => { epoch.current += 1; setBalance(null); setError(''); setBusy(false); loadCached(); };
    window.addEventListener(CREDENTIAL_CHANGED_EVENT, onCredentialChanged);
    return () => { epoch.current += 1; window.removeEventListener(CREDENTIAL_CHANGED_EVENT, onCredentialChanged); };
  }, [loadCached]);

  return <div className={styles.usageBalance}>
    <div className={styles.settingCopy}>
      <h4>DeepSeek 账户余额</h4>
      <p>点击读取时才会联网，请求只带 API Key，不包含任何笔记或对话。DeepSeek 不提供累计消费接口，下方“推算消耗”由余额的变化推算。</p>
    </div>
    <div className={styles.modelActions}>
      <Button size="compact" isDisabled={busy} onPress={() => void refresh()}>{busy ? '正在读取…' : '读取余额'}</Button>
    </div>
    {error ? <p role="alert" className={styles.modelError}>{error}</p> : null}
    {balance?.saved === false ? <p className={styles.modelHint}>本次余额未能保存为快照，推算可能不完整。</p> : null}
    {balance?.latest ? <>
      <div className={styles.usageSummary}>
        {balance.latest.balances.map(row => <div key={row.currency} className={styles.usageCell}>
          <span>当前余额（{row.currency}）</span>
          <strong>{money(row.currency, row.totalMicrounits)}</strong>
          <small>充值 {money(row.currency, row.toppedUpMicrounits)}，赠送 {money(row.currency, row.grantedMicrounits)}</small>
        </div>)}
        <div className={styles.usageCell}>
          <span>账户状态</span>
          <strong>{balance.latest.isAvailable ? '可调用' : '余额不足'}</strong>
          <small>读取于 {time(balance.latest.at)}</small>
        </div>
      </div>
      {balance.inferred.map(row => <p key={row.currency} className={styles.modelHint}>
        {row.snapshots < 2
          ? `${row.currency}：余额快照不足两次，暂无法推算消耗；之后每次读取都会增加一个快照。`
          : `${row.currency}：自 ${day(row.sinceAt)} 起推算消耗 ${money(row.currency, row.consumedMicrounits)}（共 ${row.snapshots} 个快照，余额增加 ${money(row.currency, row.addedMicrounits)} 视为充值）。这是由余额变化推算的，同一 Key 在别处的用量也会计入，两次读取之间同时充值会使消耗偏低。`}
      </p>)}
    </> : <p className={styles.modelState}>尚未读取余额。</p>}
  </div>;
}

export function UsageSettings() {
  const [usage, setUsage] = useState<AssistantUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true); setFailed(false);
    assistantApi.usage().then(value => { if (active) setUsage(value); })
      .catch(() => { if (active) { setUsage(null); setFailed(true); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);

  return <section className={styles.group} aria-labelledby="settings-usage-heading">
    <h3 id="settings-usage-heading">用量</h3>
    <div className={styles.settingList}>
      <div className={styles.modelContent}>
        <div className={styles.settingCopy}>
          <h4>知境的 AI 用量</h4>
          <p>{usage ? `这是${usage.location === 'local' ? '本机' : '云端'}记录的数据，仅含知境发出的请求；费用按价格档案估算，与 DeepSeek 账单可能略有差异。` : '仅统计知境发出的模型请求，不包含对话内容。'}</p>
        </div>
        {loading ? <p className={styles.modelState}>正在读取用量…</p> : null}
        {failed ? <div>
          <p role="alert" className={styles.modelError}>暂时无法读取用量记录，请稍后重试。</p>
          <div className={styles.modelActions}><Button size="compact" onPress={() => setAttempt(value => value + 1)}>重试读取</Button></div>
        </div> : null}
        {usage ? <>
          <div className={styles.usageSummary}>
            <Summary label="今日" totals={usage.today} />
            <Summary label="本月" totals={usage.month} />
            <Summary label="累计" totals={usage.total} />
          </div>
          {usage.total.unknownRequests > 0
            ? <p className={styles.modelHint}>{usage.total.unknownRequests} 次请求结果未知，按最坏情况共占用 {yuan(usage.total.unknownMicrounits)} 额度，未计入上方已花费金额。</p> : null}
          <p className={styles.modelHint}>累计 token：输入 {tokens(usage.total.inputTokens)}（其中缓存命中 {tokens(usage.total.cacheHitTokens)}），输出 {tokens(usage.total.outputTokens)}。</p>
          {usage.recent.length === 0 ? <p className={styles.modelState}>还没有请求记录。</p> : <div className={styles.usageTableWrap}>
            <table className={styles.usageTable}>
              <caption>最近请求</caption>
              <thead><tr><th scope="col">时间</th><th scope="col">模型</th><th scope="col">输入</th><th scope="col">输出</th><th scope="col">费用</th><th scope="col">状态</th></tr></thead>
              <tbody>{usage.recent.map(row => <tr key={row.attemptId}>
                <td>{time(row.at)}</td><td>{row.modelId ?? '—'}</td>
                <td>{tokens(row.inputTokens)}</td><td>{tokens(row.outputTokens)}</td>
                <td>{row.status === 'settled' ? yuan(row.costMicrounits) : `≤ ${yuan(row.costMicrounits)}`}</td>
                <td>{row.status === 'settled' ? '已结算' : '结果未知'}</td>
              </tr>)}</tbody>
            </table>
          </div>}
        </> : null}
        <BalanceBlock />
      </div>
    </div>
  </section>;
}
