import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../../components/ui/button/Button';
import { Select, TextAreaField } from '../../components/ui/input';
import { WorkspacePanel, WorkspacePanelBody, WorkspacePanelHeader } from '../../components/workspace/WorkspacePanel';
import { useNavigate } from '../../app/router';
import { useAppStore } from '../../store/AppStoreProvider';
import { SparkIcon } from '../../shell/icons';
import { PathTrail } from '../../shell/PathTrail';
import { assistantApi, type AssistantJob, type AssistantPreview, type AssistantStatus, type AssistantSource } from './assistantApi';
import styles from './AssistantView.module.css';

const active = (status: AssistantJob['status']) => ['pending', 'running', 'retrying', 'cancelling'].includes(status);
const statusLabel: Record<AssistantJob['status'], string> = {
  pending: '等待执行', running: '生成中', retrying: '重试中', cancelling: '取消中',
  cancelled: '已取消', succeeded: '已完成', failed: '失败'
};

export function AssistantView({ pathname, onOpenNote }: { pathname: string; onOpenNote(noteId: string): void }) {
  const navigate = useNavigate();
  const serverData = useAppStore(state => state.serverData);
  const getNoteVersion = useAppStore(state => state.getNoteVersion);
  const spaceId = serverData.currentSpaceId;
  const currentSpaceRef = useRef(spaceId);
  currentSpaceRef.current = spaceId;
  const initialNoteId = useMemo(() => new URLSearchParams(pathname.split('?')[1] ?? '').get('noteId'), [pathname]);
  const notes = useMemo(() => serverData.notes.filter(note => !note.deleted && (!note.spaceId || note.spaceId === spaceId)), [serverData.notes, spaceId]);
  const folders = useMemo(() => serverData.folderTree.filter(folder => !folder.deletedAt && (!folder.spaceId || folder.spaceId === spaceId)), [serverData.folderTree, spaceId]);
  const [scopeKind, setScopeKind] = useState<'note' | 'folder'>('note');
  const [noteId, setNoteId] = useState<string | null>(initialNoteId);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [preview, setPreview] = useState<AssistantPreview | null>(null);
  const [requestKey, setRequestKey] = useState<string | null>(null);
  const [status, setStatus] = useState<AssistantStatus | null>(null);
  const [jobs, setJobs] = useState<AssistantJob[]>([]);
  const [selectedJob, setSelectedJob] = useState<AssistantJob | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sourceView, setSourceView] = useState<{ source: AssistantSource; content: string } | null>(null);

  useEffect(() => { if (initialNoteId && notes.some(note => note.id === initialNoteId)) setNoteId(initialNoteId); }, [initialNoteId, notes]);
  useEffect(() => { if (!notes.some(note => note.id === noteId)) setNoteId(notes[0]?.id ?? null); }, [noteId, notes]);
  useEffect(() => { if (!folders.some(folder => folder.id === folderId)) setFolderId(folders[0]?.id ?? null); }, [folderId, folders]);
  useEffect(() => {
    if (!spaceId) return;
    let cancelled = false;
    setJobs([]); setSelectedJob(null); setPreview(null); setRequestKey(null); setSourceView(null);
    void Promise.all([assistantApi.status(), assistantApi.list(spaceId)]).then(([nextStatus, nextJobs]) => {
      if (cancelled) return;
      setStatus(nextStatus);
      setJobs(nextJobs);
      if (nextJobs[0]) void assistantApi.get(nextJobs[0].jobId).then(job => { if (!cancelled) setSelectedJob(job); })
        .catch(cause => { if (!cancelled) setError(cause.message); });
    }).catch(cause => { if (!cancelled) setError(cause.message); });
    return () => { cancelled = true; };
  }, [spaceId]);

  useEffect(() => {
    if (!selectedJob || !active(selectedJob.status)) return;
    let cancelled = false;
    const timer = window.setInterval(() => {
      void assistantApi.get(selectedJob.jobId).then(job => {
        if (cancelled) return;
        setSelectedJob(job);
        setJobs(previous => previous.map(item => item.jobId === job.jobId ? job : item));
      }).catch(cause => { if (!cancelled) setError(cause.message); });
    }, 2000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [selectedJob?.jobId, selectedJob?.status]);

  const noteName = (id: string) => notes.find(note => note.id === id)?.title || '已移除的笔记';
  const resetPreview = () => { setPreview(null); setRequestKey(null); setNotice(null); };

  async function reloadStatus() {
    setError(null);
    try { setStatus(await assistantApi.status()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '无法读取模型状态。'); }
  }

  async function prepare() {
    if (!spaceId || !question.trim()) return;
    const scope = scopeKind === 'note' && noteId ? { kind: 'note' as const, noteId }
      : scopeKind === 'folder' && folderId ? { kind: 'folder' as const, folderId } : null;
    if (!scope) { setError('请选择笔记或目录。'); return; }
    setPending(true); setError(null); setNotice(null); setPreview(null);
    try {
      const prepared = await assistantApi.preview({ spaceId, scope, question: question.trim() });
      if (spaceId === currentSpaceRef.current) { setPreview(prepared); setRequestKey(crypto.randomUUID()); }
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : '无法预览发送范围。'); }
    finally { setPending(false); }
  }

  async function start() {
    if (!preview || !requestKey) return;
    setPending(true); setError(null);
    try {
      const job = await assistantApi.start(preview, requestKey);
      if (job.spaceId === currentSpaceRef.current) {
        setSelectedJob(job);
        setJobs(previous => [job, ...previous.filter(item => item.jobId !== job.jobId)]);
        setPreview(null);
        setRequestKey(null);
        setNotice('任务已创建，状态会自动更新。');
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : '无法创建任务。'); }
    finally { setPending(false); }
  }

  async function cancel() {
    if (!selectedJob) return;
    setPending(true); setError(null);
    try {
      const job = await assistantApi.cancel(selectedJob.jobId);
      setSelectedJob(job);
      setJobs(previous => previous.map(item => item.jobId === job.jobId ? job : item));
    } catch (cause) { setError(cause instanceof Error ? cause.message : '无法取消任务。'); }
    finally { setPending(false); }
  }

  async function openSource(source: AssistantSource) {
    setError(null);
    const requestedSpace = selectedJob?.spaceId;
    try {
      const version = await getNoteVersion(source.noteId, source.noteVersionId);
      if (version.content.length < source.end || source.contentHash && version.contentHash !== source.contentHash) {
        throw new Error('原文版本与引用范围不一致。');
      }
      if (requestedSpace === currentSpaceRef.current) setSourceView({ source, content: version.content });
    } catch (cause) { setError(cause instanceof Error ? cause.message : '无法打开引用原文。'); }
  }

  function sourceButton(source: AssistantSource, label: string) {
    return <Button key={source.sourceId + source.start} variant="ghost" size="compact" onPress={() => void openSource(source)}>
      {label} · {noteName(source.noteId)} · {source.start + 1}–{source.end}
    </Button>;
  }

  return <WorkspacePanel as="main" aria-labelledby="assistant-title">
    <WorkspacePanelHeader title="AI 助手" code="AI" titleId="assistant-title" icon={<SparkIcon size={14} />}
      breadcrumb={<PathTrail path={[{ id: 'assistant', label: 'AI 助手', current: true }]} variant="top" />}
      actionsLabel="执行位置" actions={<span className={styles.location}>{status?.executionLocation === 'local' ? '本机执行' : status?.executionLocation === 'server' ? '服务器执行' : '正在读取状态'}</span>} />
    <WorkspacePanelBody grid className={styles.body} aria-label="AI 助手工作区">
      <aside className={styles.history} aria-label="历史任务">
        <h2>最近任务</h2>
        {jobs.length ? jobs.map(job => <button key={job.jobId} type="button" className={styles.historyItem}
          aria-current={selectedJob?.jobId === job.jobId ? 'true' : undefined}
          onClick={() => { setError(null); setSourceView(null); void assistantApi.get(job.jobId)
            .then(detail => { if (detail.spaceId === currentSpaceRef.current) setSelectedJob(detail); })
            .catch(cause => setError(cause.message)); }}>
          <span>{job.question || '只读问答'}</span><small>{statusLabel[job.status]}</small>
        </button>) : <p className={styles.empty}>当前知识空间还没有助手任务。</p>}
      </aside>
      <div className={styles.content}>
        <div className={styles.banner} role="status">
          <strong>{!status ? '正在读取模型状态' : status.modelId ? `DeepSeek · ${status.modelId}` : '模型未配置'}</strong>
          <span>{status?.unavailableReason ?? (status ? '当前可在确认来源范围后创建只读问答任务。' : '请稍候…')}</span>
          {status?.budget ? <span>北京时间 {status.budget.day} · 今日剩余额度 {(status.budget.availableMicrounits / 1_000_000).toFixed(2)} 元</span> : null}
          {status && !status.configured ? <Button variant="ghost" size="compact" onPress={() => navigate('/settings')}>打开模型设置</Button> : null}
          {!status && error ? <Button variant="ghost" size="compact" onPress={() => void reloadStatus()}>重试读取状态</Button> : null}
        </div>
        <section className={styles.card} aria-label="提出问题">
          <h2>向笔记提问</h2>
          <p className={styles.hint}>仅选中的笔记或目录片段会进入发送预览；确认前不会发送给 DeepSeek。</p>
          <div className={styles.scopeRow}>
            <Select label="读取范围" selectedKey={scopeKind} onSelectionChange={key => { setScopeKind(String(key) as 'note' | 'folder'); resetPreview(); }}
              options={[{ id: 'note', label: '一篇笔记' }, { id: 'folder', label: '一个目录' }]} />
            {scopeKind === 'note' ? <Select label="笔记" selectedKey={noteId} onSelectionChange={key => { setNoteId(String(key)); resetPreview(); }}
              options={notes.map(note => ({ id: note.id, label: note.title || '无标题笔记' }))} />
              : <Select label="目录" selectedKey={folderId} onSelectionChange={key => { setFolderId(String(key)); resetPreview(); }}
                options={folders.map(folder => ({ id: folder.id, label: folder.name }))} />}
          </div>
          <TextAreaField label="问题" value={question} onChange={value => { setQuestion(value); resetPreview(); }}
            placeholder="请基于选中的资料回答…" rows={3} />
          <div className={styles.actions}><Button variant="accent" isDisabled={pending || !spaceId || !question.trim()}
            onPress={() => void prepare()}>预览发送范围</Button></div>
        </section>
        {preview ? <section className={styles.card} aria-label="发送预览">
          <h2>发送预览</h2>
          <p className={styles.hint}>接收方：DeepSeek · {preview.sources.length} 个片段 · 输入上界约 {preview.estimatedInputTokens} 字节。预览将在 {new Date(preview.expiresAt).toLocaleTimeString('zh-CN')} 失效。</p>
          <div className={styles.sources}>{preview.sources.map(source => <article key={source.sourceId} className={styles.source}>
            <strong>{noteName(source.noteId)} · {source.start + 1}–{source.end}</strong>
            <pre>{source.text}</pre>
          </article>)}</div>
          {preview.omissions.length ? <p className={styles.hint}>未发送：{preview.omissions.length} 个片段。请缩小范围或调整问题后重新预览。</p> : null}
          <div className={styles.actions}><Button variant="primary" isDisabled={pending || !status?.generationAvailable}
            onPress={() => void start()}>确认范围并提问</Button>
            <Button variant="ghost" onPress={resetPreview}>取消预览</Button></div>
          {!status?.generationAvailable ? <p className={styles.hint}>{status?.unavailableReason ?? '当前仅可核对发送范围。'}</p> : null}
        </section> : null}
        {selectedJob ? <section className={styles.card} aria-label="任务详情">
          <div className={styles.jobHeader}><h2>{selectedJob.question || '只读问答'}</h2><span>{statusLabel[selectedJob.status]}</span></div>
          {selectedJob.status === 'succeeded' && selectedJob.result ? <>
            <p className={styles.answer}>{selectedJob.result.answer || '已核对来源，但未找到足够依据。'}</p>
            <h3>来源</h3>
            <div className={styles.citations}>{selectedJob.result.citations.map((citation, index) => sourceButton(citation, `引用 ${index + 1}`))}</div>
          </> : <p className={styles.hint}>{selectedJob.status === 'failed' ? '任务未完成，可重新预览资料并提问。' : `当前阶段：${selectedJob.phase}`}</p>}
          {sourceView && selectedJob.result?.citations.some(citation => citation.sourceId === sourceView.source.sourceId) ? <div className={styles.sourceDetail} aria-label="引用原文定位">
            <h3>{noteName(sourceView.source.noteId)} · 历史版本 {sourceView.source.noteVersionId}</h3>
            <p>{sourceView.content.slice(Math.max(0, sourceView.source.start - 80), sourceView.source.start)}
              <mark>{sourceView.content.slice(sourceView.source.start, sourceView.source.end)}</mark>
              {sourceView.content.slice(sourceView.source.end, sourceView.source.end + 80)}</p>
            <Button variant="default" size="compact" onPress={() => onOpenNote(sourceView.source.noteId)}>打开笔记</Button>
            <Button variant="ghost" size="compact" onPress={() => setSourceView(null)}>关闭原文</Button>
          </div> : null}
          {active(selectedJob.status) ? <Button variant="ghost" isDisabled={pending} onPress={() => void cancel()}>取消任务</Button> : null}
        </section> : null}
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
        {notice ? <p className={styles.hint} role="status">{notice}</p> : null}
      </div>
    </WorkspacePanelBody>
  </WorkspacePanel>;
}
