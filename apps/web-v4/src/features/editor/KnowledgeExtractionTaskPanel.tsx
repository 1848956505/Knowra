import { Button, Dialog, DialogBody, DialogClose, DialogFooter } from '../../components/ui';
import { ExtractionDemoNotice } from './ExtractionEnvironment';
import type { useKnowledgeExtractionTasks } from './useKnowledgeExtractionTasks';
import styles from './KnowledgeExtraction.module.css';

export const EXTRACTION_STATUS_LABELS = { pending: '等待开始', running: '正在提炼', succeeded: '候选已保存', failed: '提炼失败', retrying: '正在重试', cancelling: '正在停止', cancelled: '已停止' };
export function KnowledgeExtractionTaskPanel({ task, onOpenCandidate }: {
  task: ReturnType<typeof useKnowledgeExtractionTasks>; onOpenCandidate?(id: string): void;
}) {
  if (!task.open) return null;
  const { job } = task;
  return <Dialog title="知识提炼任务" size="md" isOpen onOpenChange={task.setOpen} description="关闭仅停止本地状态更新，不会停止任务。">
    <DialogBody><div className={styles.body}>
      <ExtractionDemoNotice />
      {task.recoveryWarning ? <p role="alert">{task.recoveryWarning}</p> : null}
      {!task.capability.canReadJobs ? <p>任务记录暂不可读取；已有候选和证据仍可在知识库查看。</p> : <>
        <div className={styles.actions}><Button isDisabled={task.pending} onPress={() => void task.refresh()}>刷新任务</Button></div>
        {task.pending ? <p role="status">正在读取或提交任务…</p> : null}
        {task.notice ? <p role="status">{task.notice}</p> : null}
        {task.error ? <p role="alert" className={styles.error}>{task.error}</p> : null}
        {task.intent && !job ? <section className={styles.body} aria-label="待开始的提炼范围">
          <p>已保存范围，任务只会读取已核对的笔记版本。</p>
          {task.intent.submitted ? <Button isDisabled={task.pending} onPress={() => void task.refresh()}>查询提交结果</Button> : null}
          {task.capability.canStart ? <Button variant="primary" isDisabled={task.pending || !task.canWrite} onPress={() => void task.start(task.intent!)}>{task.intent.submitted ? '重试提交' : '开始提炼'}</Button> : null}
        </section> : null}
        {job ? <section className={styles.body} aria-label="当前提炼任务">
          <h3>{EXTRACTION_STATUS_LABELS[job.status]}</h3>
          {job.error ? <p role="alert">{job.error.message}</p> : null}
          {job.status === 'failed' && job.actions.retryUnavailableReason ? <p>{job.actions.retryUnavailableReason.message} 请重新核对范围后再明确开始。</p> : null}
          <div className={styles.actions}>
            {job.actions.canCancel ? <Button isDisabled={task.pending || !task.canWrite} onPress={() => void task.action('cancel')}>停止任务</Button> : null}
            {job.actions.canRetry ? <Button isDisabled={task.pending || !task.canWrite} onPress={() => void task.action('retry')}>重试任务</Button> : null}
          </div>
          {job.status === 'succeeded' ? <>
            <p>{job.candidateIds.length ? `已保存 ${job.candidateIds.length} 条候选，尚未人工确认。` : '未发现可提炼内容，没有新增知识候选。'}</p>
            <div className={styles.actions}>{job.candidateIds.map((id, index) => <Button key={id} isDisabled={!onOpenCandidate} onPress={() => { task.setOpen(false); onOpenCandidate?.(id); }}>查看候选 {index + 1}</Button>)}</div>
          </> : null}
        </section> : null}
        <h3>当前空间的任务</h3>
        {!task.items.length && !task.pending ? <p>暂无提炼任务。</p> : null}
        <ul className={styles.list}>{task.items.map(item => <li key={item.jobId}><Button variant="ghost" isDisabled={task.pending} onPress={() => void task.select(item.jobId)} aria-label={`查看任务 ${item.jobId}`}>{EXTRACTION_STATUS_LABELS[item.status]} · {new Date(item.createdAt).toLocaleString('zh-CN')}</Button></li>)}</ul>
        {task.nextCursor ? <Button isDisabled={task.pending} onPress={() => void task.refresh(task.nextCursor!)}>加载更多任务</Button> : null}
      </>}
    </div></DialogBody>
    <DialogFooter><DialogClose variant="ghost">关闭</DialogClose></DialogFooter>
  </Dialog>;
}
