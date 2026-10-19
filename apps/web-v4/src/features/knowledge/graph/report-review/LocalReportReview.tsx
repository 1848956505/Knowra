import { useRef, useState } from 'react';
import { decideReview, parseReviewEnvelope, serializeReviewDraft, undoReview, REVIEW_LIMITS,
  type ReviewDecision, type ReviewEnvelope, type ReviewSession } from '@study-accelerator/shared/incremental-review';
import { Button, Dialog, DialogBody, DialogFooter } from '../../../../components/ui';
import { ReviewRowDetail, responseLabels } from './ReviewRowDetail';
import { useLocalFile } from './useLocalFile';
import { downloadReview } from './downloadReview';
import styles from './ReportReview.module.css';

type Pending = { kind: 'replace'; report: ReviewEnvelope } | { kind: 'reset' } | { kind: 'close' } | { kind: 'download' };

/** 独立内存会话。不会读写应用 store、API 或浏览器持久化。 */
export function LocalReportReview({ onClose }: { onClose(): void }) {
  const [report, setReport] = useState<ReviewEnvelope | null>(null);
  const [session, setSession] = useState<ReviewSession>({});
  const [rowIndex, setRowIndex] = useState(0);
  const [revision, setRevision] = useState(0);
  const [pending, setPending] = useState<Pending | null>(null);
  const [actionError, setActionError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const status = useRef<HTMLParagraphElement>(null);
  const hasDecisions = Object.keys(session).length > 0;
  const install = (next: ReviewEnvelope | null) => { setReport(next); setRevision(value => value + 1); setSession({}); setRowIndex(0); setPending(null); setActionError(''); };
  const loader = useLocalFile(parseReviewEnvelope, REVIEW_LIMITS.bytes, next => {
    if (hasDecisions) setPending({ kind: 'replace', report: next }); else install(next);
  });
  const request = (kind: 'reset' | 'close') => {
    loader.invalidate(); setPending(null);
    if (hasDecisions) setPending({ kind });
    else if (kind === 'close') onClose(); else install(null);
  };
  const change = (id: string, decision?: ReviewDecision) => {
    if (!report) return;
    try { setSession(decision ? decideReview(report, session, id, decision) : undoReview(report, session, id)); setActionError(''); }
    catch { setActionError('这项选择未通过内部一致性检查，未写入知识库。'); }
  };
  const cancelPending = () => { setPending(null); status.current?.focus(); };
  const confirm = () => {
    if (!pending) return;
    if (pending.kind === 'download') {
      try { if (report) downloadReview(serializeReviewDraft(report, session)); setPending(null); }
      catch { setPending(null); setActionError('无法生成草稿：完整草稿可能超过大小上限，或内部一致性检查失败。报告与选择已保留，内容不会截断。'); }
      return;
    }
    loader.invalidate();
    if (pending.kind === 'close') onClose();
    else install(pending.kind === 'replace' ? pending.report : null);
  };
  const decisions = Object.values(session);
  const total = report?.rows.reduce((sum, row) => sum + row.proposals.length, 0) ?? 0;
  const deferred = decisions.filter(item => item.kind === 'defer').length;
  const row = report?.rows[rowIndex];
  return <>
    <Dialog title="离线报告审阅（实验）" isOpen size="md" onOpenChange={open => { if (!open) request('close'); }}
      description="文件仅在本页内存读取，不上传；关闭或刷新清空。不会改变原图或知识库。">
      <DialogBody><div className={styles.content}>
        <p className={styles.notice}>仅检查结构与内部一致性，不认证文件来源。模型提案和候选均未核实；无警告也不代表事实可靠。选择仅形成未授权草稿，不是正式提交。</p>
        <div className={styles.toolbar}>
          <Button variant="primary" onPress={() => { loader.invalidate(); setPending(null); input.current?.click(); }}>{report ? '选择另一份报告' : '选择离线报告'}</Button>
          <input ref={input} hidden type="file" accept=".json,application/json" aria-label="选择离线审阅报告文件"
            onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; setPending(null); void loader.read(file); }} />
          {report ? <Button variant="ghost" onPress={() => request('reset')}>重置报告</Button> : null}
          {loader.busy ? <><span role="status">正在本地读取…</span><Button variant="ghost" onPress={loader.invalidate}>取消读取</Button></> : null}
        </div>
        {loader.error || actionError ? <p role="alert">{loader.error || actionError}</p> : null}
        <p ref={status} tabIndex={-1} className={styles.hint} aria-label="报告审阅统计">{report ? `报告标签：${report.reportId} · 快照标签：${report.snapshotRef}。${total} 条提案，未决定 ${total - decisions.length}，待定 ${deferred}，已选择 ${decisions.length - deferred}。` : '尚未导入报告。合成演示仍可从概念图的独立入口打开。'}</p>
        {report ? <>
          <nav className={styles.navigation} aria-label="报告笔记">{report.rows.map((item, i) => <Button key={item.rowId} size="compact" className={styles.bounded}
            variant={i === rowIndex ? 'primary' : 'ghost'} aria-current={i === rowIndex ? 'step' : undefined} onPress={() => setRowIndex(i)}>
            <span className={styles.buttonText}>{i + 1}. {item.note.id} · {responseLabels[item.responseState]}</span></Button>)}</nav>
          {row ? <ReviewRowDetail key={`${revision}/${row.rowId}`} row={row} session={session} onDecide={change} onUndo={id => change(id)} /> : <p>这份报告没有记录。</p>}
        </> : null}
      </div></DialogBody>
      <DialogFooter><Button variant="ghost" onPress={() => request('close')}>关闭审阅</Button>
        <Button isDisabled={!report} onPress={() => { loader.invalidate(); setPending({ kind: 'download' }); }}>下载未授权草稿</Button></DialogFooter>
    </Dialog>
    {pending ? <Dialog title={pending.kind === 'download' ? '下载包含原文的草稿？' : '清空当前内存选择？'} isOpen
      onOpenChange={open => { if (!open) cancelPending(); }}>
      <DialogBody>{pending.kind === 'download'
        ? <p>下载文件包含笔记原文、模型响应、候选旧内容，以及已选择、待定和未决定状态。仅保存到你的设备，不上传；这不是正式提交，也不授予执行授权。下载后当前选择仍保留。</p>
        : <p>{pending.kind === 'replace' ? '新报告已完成结构检查。替换' : pending.kind === 'reset' ? '重置' : '关闭'}会清空当前所有内存选择，未下载的决定将丢失。取消会保留当前报告与选择。</p>}</DialogBody>
      <DialogFooter><Button variant="ghost" onPress={cancelPending}>取消</Button><Button variant="primary" onPress={confirm}>
        {pending.kind === 'download' ? '确认下载（含原文）' : pending.kind === 'replace' ? '替换并清空选择' : pending.kind === 'reset' ? '确认重置' : '关闭并清空选择'}</Button></DialogFooter>
    </Dialog> : null}
  </>;
}
