import { useEffect, useState } from 'react';
import { Button } from '../../components/ui/button/Button';
import { assistantApi, type AssistantUsage, type UsageTotals } from '../assistant/assistantApi';
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
                <td>{row.status === 'settled' ? '成功' : '结果未知'}</td>
              </tr>)}</tbody>
            </table>
          </div>}
        </> : null}
      </div>
    </div>
  </section>;
}
