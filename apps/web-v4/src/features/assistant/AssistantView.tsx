import { NoteActions } from './NoteActions';
import { ConversationAttachmentPicker } from './ConversationAttachmentPicker';
import { AIInbox } from './AIInbox';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../../components/ui/button/Button';
import { Select, TextAreaField } from '../../components/ui/input';
import { Dialog, DialogBody, DialogFooter } from '../../components/ui/overlay/Dialog';
import { WorkspacePanel, WorkspacePanelBody } from '../../components/workspace/WorkspacePanel';
import { useNavigate } from '../../app/router';
import { useAppStore } from '../../store/AppStoreProvider';
import { BookIcon, FolderIcon, HomeIcon, NoteIcon, SettingsIcon, SparkIcon } from '../../shell/icons';
import { assistantApi, type AssistantStatus } from './assistantApi';
import { conversationApi, type AccessPolicy, type Conversation, type ConversationMessage,
  type ConversationTurn, type SourceRef } from './conversationApi';
import type { NoteAction } from './noteActionApi';
import { LegacyAssistantView } from './LegacyAssistantView';
import { readConversationSnapshot } from './conversationSnapshot';
import { ReadableMarkdown } from './ReadableMarkdown';
import styles from './ConversationView.module.css';

const phaseName: Record<ConversationTurn['phase'], string> = {
  waiting: '等待执行', retrieving: '正在检索', generating: '正在生成',
  validating: '正在核对来源', finished: '已结束'
};
const statusName: Record<ConversationTurn['status'], string> = {
  staged: '等待执行', running: '处理中', interrupted: '已中断',
  succeeded: '已完成', failed: '失败', cancelled: '已停止'
};
const isActive = (turn: ConversationTurn | null) => turn?.status === 'staged' || turn?.status === 'running';
const blocked = (turn: ConversationTurn | null) => isActive(turn) || turn?.status === 'interrupted';
const errorText = (cause: unknown, fallback: string) => cause instanceof Error ? cause.message : fallback;
const formatTime = (value: string) => new Date(value).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

interface PendingSend { conversationId: string; idempotencyKey: string; content: string; requestedPolicyId: string | null }

interface AssistantViewProps { pathname: string; onOpenNote(noteId: string): void }

export function AssistantView(props: AssistantViewProps) {
  return new URLSearchParams(props.pathname.split('?')[1] ?? '').get('view') === 'legacy'
    ? <LegacyAssistantView {...props} readOnly /> : <ConversationAssistantView {...props} />;
}

function ConversationAssistantView({ pathname, onOpenNote }: AssistantViewProps) {
  const navigate = useNavigate();
  const serverData = useAppStore(state => state.serverData);
  const selectKnowledgeSpace = useAppStore(state => state.selectKnowledgeSpace);
  const getNoteVersion = useAppStore(state => state.getNoteVersion);
  const spaceId = serverData.currentSpaceId;
  const params = useMemo(() => new URLSearchParams(pathname.split('?')[1] ?? ''), [pathname]);
  const initialNoteId = params.get('noteId');
  const requestedId = params.get('conversationId');
  const newConversation = params.get('new') === '1';
  const notes = useMemo(() => serverData.notes.filter(note => !note.deleted && (!note.spaceId || note.spaceId === spaceId)), [serverData.notes, spaceId]);
  const folders = useMemo(() => serverData.folderTree.filter(folder => !folder.deletedAt && (!folder.spaceId || folder.spaceId === spaceId)), [serverData.folderTree, spaceId]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [policies, setPolicies] = useState<AccessPolicy[]>([]);
  const [status, setStatus] = useState<AssistantStatus | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [turns, setTurns] = useState<Record<string, ConversationTurn>>({});
  const [scopeChoice, setScopeChoice] = useState('plain');
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [grantOpen, setGrantOpen] = useState(false);
  const [grantKind, setGrantKind] = useState<'library' | 'folder' | 'fixed'>('library');
  const [grantNoteId, setGrantNoteId] = useState(initialNoteId ?? '');
  const [grantFolderId, setGrantFolderId] = useState('');
  const [grantDays, setGrantDays] = useState('7');
  const [recordMessage, setRecordMessage] = useState<ConversationMessage | null>(null);
  const [managementOpen, setManagementOpen] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [artifacts, setArtifacts] = useState<NoteAction[]>([]);
  const [focusedActionId, setFocusedActionId] = useState<string | null>(null);
  const [reviewedAction, setReviewedAction] = useState<NoteAction | null>(null);
  const [retryConfirmOpen, setRetryConfirmOpen] = useState(false);
  const inboxTrigger = useRef<HTMLButtonElement>(null);
  const inboxOpener = useRef<HTMLElement | null>(null);
  const mobileMenu = useRef<HTMLDetailsElement>(null);
  const [sourceView, setSourceView] = useState<{ ref: SourceRef; text: string; messageId: string } | null>(null);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const pendingSend = useRef<PendingSend | null>(null);
  const selection = useRef<string | null>(null);
  const refreshSequence = useRef(0);
  const scopeRevision = useRef(0);
  const space = useRef(spaceId);
  space.current = spaceId;

  const selected = newConversation ? null : conversations.find(item => item.conversationId === requestedId)
    ?? conversations[0] ?? null;
  const selectedId = selected?.conversationId ?? null;
  selection.current = selectedId;
  const latestTurn = messages.length ? turns[messages[messages.length - 1].turnId] ?? null : null;
  const reviewingOtherDraft = inboxOpen && reviewedAction && reviewedAction.requestId !== latestTurn?.turnId;
  const deliveryUncertain = latestTurn?.modelAttempts?.some(attempt =>
    (attempt.ordinal ?? Infinity) > (latestTurn.checkpoint?.handledAttemptOrdinal ?? 0)
    && (attempt.status === 'sent' || ['settled', 'unknown'].includes(attempt.status) && !attempt.modelResult)) ?? false;
  const activePolicies = policies.filter(item => !item.revokedAt && Date.parse(item.expiresAt) > Date.now() && item.egress);
  const chosenPolicy = activePolicies.find(item => item.policyId === scopeChoice);
  const noteName = (id: string) => notes.find(note => note.id === id)?.title || '已移除的笔记';
  const scopeName = (policy: AccessPolicy) => {
    const scope = policy.scope;
    return scope.kind === 'library' ? '当前知识空间'
      : scope.kind === 'folder' ? `目录：${folders.find(folder => folder.id === scope.folderId)?.name ?? '已移除目录'}`
        : `笔记：${scope.noteIds.map(noteName).join('、')}`;
  };

  useEffect(() => {
    if (!spaceId) return;
    let cancelled = false;
    setConversations([]); setPolicies([]); setMessages([]); setTurns({}); setTitles({}); setArtifacts([]); setReviewedAction(null);
    setStatus(null); scopeRevision.current++; setScopeChoice('plain'); setError(null); setNotice(null); setSourceView(null);
    pendingSend.current = null; setRecordMessage(null); setManagementOpen(false);
    void conversationApi.list(spaceId).then(rows => { if (!cancelled) setConversations(rows); })
      .catch(cause => { if (!cancelled) setError(errorText(cause, '无法加载会话历史。')); });
    void conversationApi.policies(spaceId).then(rows => { if (!cancelled) setPolicies(rows); })
      .catch(cause => { if (!cancelled) setError(errorText(cause, '无法加载读取授权。')); });
    void assistantApi.status().then(next => { if (!cancelled) setStatus(next); })
      .catch(cause => { if (!cancelled) setError(errorText(cause, '无法读取模型状态。')); });
    return () => { cancelled = true; };
  }, [spaceId]);

  async function refreshConversation(id: string, initializeScope = false) {
    if (selection.current !== id) return;
    const sequence = ++refreshSequence.current;
    const capturedSpace = space.current;
    const capturedScopeRevision = scopeRevision.current;
    const isCurrent = () => refreshSequence.current === sequence && selection.current === id && space.current === capturedSpace;
    try {
      const snapshot = await readConversationSnapshot(id, isCurrent);
      if (!snapshot || !isCurrent()) return;
      setMessages(snapshot.messages);
      const first = snapshot.messages.find(message => message.role === 'user');
      if (first) setTitles(previous => ({ ...previous, [id]: first.content }));
      if (snapshot.turn) {
        const turn = snapshot.turn;
        setTurns(previous => ({ ...previous, [turn.turnId]: turn }));
      }
      if (initializeScope && scopeRevision.current === capturedScopeRevision) {
        setScopeChoice(snapshot.turn?.requestedPolicyId ?? 'plain');
      }
    } catch (cause) { if (isCurrent()) throw cause; }
  }

  useEffect(() => {
    refreshSequence.current++;
    scopeRevision.current++; setScopeChoice('plain');
    setMessages([]); setTurns({}); setSourceView(null); setError(null); setRetryConfirmOpen(false);
    if (!selectedId) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    void refreshConversation(selectedId, true).catch(cause => {
      if (!cancelled) setError(errorText(cause, '无法恢复会话。'));
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; refreshSequence.current++; };
  }, [selectedId, spaceId]);

  useEffect(() => {
    if (!selectedId || !isActive(latestTurn)) return;
    let polling = false;
    const timer = window.setInterval(() => {
      if (polling) return;
      polling = true;
      void refreshConversation(selectedId).catch(cause => setError(errorText(cause, '会话状态暂时无法更新，请稍后重试。')))
        .finally(() => { polling = false; });
    }, 2000);
    return () => window.clearInterval(timer);
  }, [selectedId, latestTurn?.turnId, latestTurn?.status]);

  useEffect(() => {
    if (!selectedId) return;
    const reconnect = () => { void refreshConversation(selectedId)
      .then(() => setError(null)).catch(cause => setError(errorText(cause, '无法恢复会话。'))); };
    window.addEventListener('online', reconnect);
    return () => window.removeEventListener('online', reconnect);
  }, [selectedId]);

  async function reloadPage() {
    if (!spaceId) return;
    setError(null);
    const [history, access, model] = await Promise.allSettled([
      conversationApi.list(spaceId), conversationApi.policies(spaceId), assistantApi.status()
    ]);
    if (space.current !== spaceId) return;
    if (history.status === 'fulfilled') setConversations(history.value);
    if (access.status === 'fulfilled') setPolicies(access.value);
    if (model.status === 'fulfilled') setStatus(model.value);
    if (selectedId) await refreshConversation(selectedId).catch(cause => setError(errorText(cause, '无法恢复会话。')));
    if (history.status === 'rejected' || access.status === 'rejected' || model.status === 'rejected') {
      setError('部分助手状态仍不可用，请稍后重试。');
    }
  }

  function chooseConversation(id: string) {
    pendingSend.current = null; setDraft(''); setError(null); setNotice(null);
    mobileMenu.current?.removeAttribute('open');
    navigate(`/assistant?conversationId=${encodeURIComponent(id)}`);
  }

  function switchSpace(id: string) {
    if (!id || id === spaceId) return;
    pendingSend.current = null;
    setInboxOpen(false); setFocusedActionId(null); mobileMenu.current?.removeAttribute('open');
    void selectKnowledgeSpace(id).then(() => navigate('/assistant?new=1'))
      .catch(cause => setError(errorText(cause, '无法切换知识空间。')));
  }

  function openInbox(actionId: string | null = null) {
    inboxOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setFocusedActionId(actionId);
    setInboxOpen(true);
  }

  async function ensureAttachmentConversation() {
    if (selectedId) return selectedId;
    if (!spaceId) throw new Error('请先选择知识空间。');
    if (pending) throw new Error('正在处理消息，请稍后添加附件。');
    const capturedSpace = spaceId;
    const capturedSelection = selection.current;
    setPending(true);
    try {
      const created = await conversationApi.create(spaceId, crypto.randomUUID());
      if (space.current !== capturedSpace || selection.current !== capturedSelection) throw new Error('对话已变化，请重新添加附件。');
      setConversations(previous => [created, ...previous.filter(item => item.conversationId !== created.conversationId)]);
      navigate(`/assistant?conversationId=${encodeURIComponent(created.conversationId)}`);
      return created.conversationId;
    } finally { setPending(false); }
  }

  async function send() {
    if (!spaceId || !draft.trim() || pending || blocked(latestTurn) || reviewingOtherDraft || selected?.readOnly || !status?.generationAvailable) return;
    const content = draft.trim();
    const requestedPolicyId = chosenPolicy?.policyId ?? null;
    if (scopeChoice !== 'plain' && !chosenPolicy) { setError('读取授权已过期或撤销，请重新选择范围。'); return; }
    const intent = pendingSend.current?.content === content && pendingSend.current.requestedPolicyId === requestedPolicyId
      && pendingSend.current.conversationId === (selectedId ?? pendingSend.current.conversationId)
      ? pendingSend.current : { conversationId: selectedId ?? crypto.randomUUID(),
        idempotencyKey: crypto.randomUUID(), content, requestedPolicyId };
    pendingSend.current = intent;
    refreshSequence.current++;
    setPending(true); setError(null); setNotice(null);
    try {
      if (!selectedId) {
        const created = await conversationApi.create(spaceId, intent.conversationId);
        if (space.current !== spaceId) return;
        setConversations(previous => [created, ...previous.filter(item => item.conversationId !== created.conversationId)]);
      }
      const turn = await conversationApi.send(intent.conversationId, {
        content: intent.content, idempotencyKey: intent.idempotencyKey, requestedPolicyId: intent.requestedPolicyId
      });
      if (space.current !== spaceId) return;
      pendingSend.current = null; setDraft('');
      setTurns(previous => ({ ...previous, [turn.turnId]: turn }));
      if (selection.current === intent.conversationId) await refreshConversation(intent.conversationId);
      else navigate(`/assistant?conversationId=${encodeURIComponent(intent.conversationId)}`);
    } catch (cause) { if (space.current === spaceId) setError(`${errorText(cause, '发送失败。')} 可使用同一请求重试。`); }
    finally { setPending(false); }
  }

  async function actOnTurn(action: 'cancel' | 'retry' | 'resume', confirmed = false) {
    if (!selectedId || !latestTurn || pending) return;
    if (action === 'retry' && deliveryUncertain && !confirmed) { setRetryConfirmOpen(true); return; }
    setRetryConfirmOpen(false);
    refreshSequence.current++;
    setPending(true); setError(null);
    try {
      const result = action === 'cancel' ? await conversationApi.cancel(selectedId, latestTurn.turnId)
        : action === 'resume' ? await conversationApi.resume(selectedId, latestTurn.turnId) : await conversationApi.retry(selectedId, latestTurn.turnId);
      if (selection.current !== selectedId) return;
      setTurns(previous => ({ ...previous, [result.turnId]: result }));
      await refreshConversation(selectedId);
      setNotice(action === 'cancel' ? '已请求停止。' : action === 'resume' ? '已请求从检查点继续，不自动重发未知模型请求。' : '已请求重试，状态会自动更新。');
    } catch (cause) { setError(errorText(cause, '操作失败。')); }
    finally { setPending(false); }
  }

  async function createPolicy() {
    if (!spaceId || pending) return;
    const scope: AccessPolicy['scope'] | null = grantKind === 'library' ? { kind: 'library' }
      : grantKind === 'folder' && grantFolderId ? { kind: 'folder', folderId: grantFolderId }
        : grantKind === 'fixed' && grantNoteId ? { kind: 'fixed', noteIds: [grantNoteId] } : null;
    if (!scope) { setError('请选择有效的目录或笔记。'); return; }
    const capturedScopeRevision = scopeRevision.current;
    setPending(true); setError(null);
    try {
      const policy = await conversationApi.createPolicy({ spaceId, scope,
        expiresAt: new Date(Date.now() + Number(grantDays) * 86400_000).toISOString() });
      if (space.current !== spaceId) return;
      setPolicies(previous => [policy, ...previous]);
      if (scopeRevision.current === capturedScopeRevision) { scopeRevision.current++; setScopeChoice(policy.policyId); }
      setGrantOpen(false); setNotice(`已授权${scopeName(policy)}，有效期至 ${formatTime(policy.expiresAt)}。`);
    } catch (cause) { setError(errorText(cause, '无法创建读取授权。')); }
    finally { setPending(false); }
  }

  async function revokePolicy(policy: AccessPolicy) {
    if (pending) return;
    const capturedSpace = space.current;
    const capturedScopeRevision = scopeRevision.current;
    setPending(true); setError(null);
    try {
      const revoked = await conversationApi.revokePolicy(policy);
      if (space.current !== capturedSpace) return;
      setPolicies(previous => previous.map(item => item.policyId === revoked.policyId ? revoked : item));
      if (scopeRevision.current === capturedScopeRevision) { scopeRevision.current++; setScopeChoice('plain'); }
      setNotice('读取授权已撤销。');
    } catch (cause) { setError(errorText(cause, '撤销授权失败。')); }
    finally { setPending(false); }
  }

  async function openSource(ref: SourceRef, messageId: string) {
    setError(null);
    const id = selectedId;
    try {
      const version = await getNoteVersion(ref.noteId, ref.noteVersionId);
      if (version.contentHash !== ref.contentHash || ref.start < 0 || ref.end > version.content.length || ref.end <= ref.start) {
        throw new Error('历史原文与引用范围不一致。');
      }
      if (globalThis.crypto?.subtle) {
        const digest = async (text: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))))
          .map(byte => byte.toString(16).padStart(2, '0')).join('');
        if (await digest(version.content) !== ref.contentHash
          || await digest(version.content.slice(ref.start, ref.end)) !== ref.quoteHash) {
          throw new Error('引用原文校验失败。');
        }
      }
      if (selection.current === id) setSourceView({ ref, text: version.content, messageId });
    } catch (cause) { setError(errorText(cause, '无法读取引用原文。')); }
  }

  async function showTrace(turnId: string) {
    if (!selectedId || turns[turnId]) return;
    try {
      const detail = await conversationApi.turn(selectedId, turnId);
      if (selection.current === selectedId) setTurns(previous => ({ ...previous, [turnId]: detail }));
    } catch (cause) { setError(errorText(cause, '无法读取检索记录。')); }
  }

  return <WorkspacePanel as="main" className={styles.assistantPanel} aria-labelledby="assistant-title">
    <WorkspacePanelBody className={`${styles.body} ${inboxOpen ? styles.withInbox : ''}`} aria-label="AI 助手工作区">
      <aside className={styles.history} aria-label="会话历史">
        <button type="button" className={styles.brand} onClick={() => navigate('/materials')} aria-label="返回笔记"><BookIcon size={25} accent /><strong>Knowra</strong></button>
        <Button className={styles.newConversation} variant="accent" size="workspace" onPress={() => {
          pendingSend.current = null; setDraft(''); navigate('/assistant?new=1');
        }}>新对话</Button>
        <nav className={styles.historyNavigation} aria-label="助手导航">
          <button type="button" className={styles.navigationItem} aria-current={!inboxOpen ? 'page' : undefined}
            onClick={() => setInboxOpen(false)}><SparkIcon size={17} />对话</button>
          <button ref={inboxTrigger} type="button" className={styles.navigationItem} aria-label="AI 成果收件箱" aria-current={inboxOpen ? 'page' : undefined}
            onClick={() => openInbox()}><FolderIcon size={17} />成果收件箱</button>
        </nav>
        <details className={styles.mobileMenu} ref={mobileMenu}>
          <summary>菜单</summary>
          <div className={styles.mobileMenuBody}>
            <strong>最近对话</strong>
            {conversations.map(item => <button key={item.conversationId} type="button" onClick={() => chooseConversation(item.conversationId)}>
              {titles[item.conversationId] ?? `会话 · ${formatTime(item.createdAt)}`}</button>)}
            <Select label="知识空间" selectedKey={spaceId} onSelectionChange={key => switchSpace(String(key))}
              options={(serverData.spaces ?? []).map(item => ({ id: item.id, label: item.name ?? '未命名空间' }))} />
            <button type="button" onClick={() => navigate('/settings')}>设置</button>
            <button type="button" onClick={() => navigate('/materials')}>返回笔记</button>
          </div>
        </details>
        <h2>最近对话</h2>
        <div className={styles.historyList}>{conversations.length ? conversations.map(item => <button key={item.conversationId} type="button"
          className={styles.historyItem} aria-current={item.conversationId === selectedId ? 'true' : undefined}
          onClick={() => chooseConversation(item.conversationId)}>
          <NoteIcon size={16} /><span>{titles[item.conversationId] ?? `会话 · ${formatTime(item.createdAt)}`}</span>
          {item.readOnly ? <small>只读</small> : null}
        </button>) : <p className={styles.muted}>还没有会话。</p>}</div>
        <div className={styles.historyFooter}>
          <Select label="知识空间" selectedKey={spaceId} onSelectionChange={key => switchSpace(String(key))}
            options={(serverData.spaces ?? []).map(item => ({ id: item.id, label: item.name ?? '未命名空间' }))} />
          <button type="button" className={styles.navigationItem} onClick={() => navigate('/settings')}><SettingsIcon size={17} />设置</button>
          <button type="button" className={styles.navigationItem} onClick={() => navigate('/materials')}><HomeIcon size={17} />返回笔记</button>
        </div>
      </aside>
      <div className={`${styles.content} ${!selected ? styles.emptyContent : ''}`}>
        <header className={styles.chatHeader}>
          <h1 id="assistant-title">{selected ? titles[selected.conversationId] ?? '知境助手' : '知境助手'}</h1>
          {status && !status.generationAvailable ? <span className={styles.statusWarning}>{status.unavailableReason ?? '当前无法生成回答。'}</span> : null}
          <details className={styles.status} onToggle={event => setStatusOpen(event.currentTarget.open)}>
            <summary>{status ? status.executionLocation === 'local' ? '本机执行' : '服务器执行' : '正在读取模型状态'}</summary>
            {statusOpen ? <div className={styles.statusDetails} role="status">
          <span>{status ? `执行位置：${status.executionLocation === 'local' ? '本机' : '服务器'}` : '正在读取模型状态'}</span>
          <span>{status?.modelId ? `${status.simulation ? '离线模拟' : 'DeepSeek'} · ${status.modelId}` : status ? '模型未配置' : ''}</span>
          {status?.simulation ? <span>离线模拟响应，未调用真实供应商。</span> : null}
          {status?.budget ? <span>今日可用 {(status.budget.availableMicrounits / 1_000_000).toFixed(2)} 元</span> : null}
          {status && !status.generationAvailable ? <span>{status.unavailableReason ?? '当前无法生成回答。'}</span> : null}
          {status && !status.configured ? <Button variant="ghost" size="compact" onPress={() => navigate('/settings')}>打开模型设置</Button> : null}
          {!status?.generationAvailable ? <Button variant="ghost" size="compact" onPress={() => void reloadPage()}>重试读取状态</Button> : null}
            <Button variant="ghost" size="compact" onPress={() => navigate('/settings')}>设置</Button>
            <Button variant="ghost" size="compact" onPress={() => setManagementOpen(open => !open)}>执行记录</Button>
            <Button variant="ghost" size="compact" onPress={() => {
              setGrantKind('library'); setGrantNoteId(initialNoteId ?? notes[0]?.id ?? '');
              setGrantFolderId(folders[0]?.id ?? ''); setGrantOpen(true);
            }}>设置读取范围</Button>
            {chosenPolicy ? <Button variant="ghost" size="compact" isDisabled={pending}
              onPress={() => void revokePolicy(chosenPolicy)}>撤销此授权</Button> : null}
            <Button variant="ghost" size="compact" onPress={() => navigate('/assistant?view=legacy')}>旧版任务</Button>
            </div> : null}
          </details>
        </header>
        {spaceId && (recordMessage || managementOpen) ? <NoteActions key={`${spaceId}:${recordMessage?.messageId ?? 'management'}`} spaceId={spaceId} refreshKey={messages.at(-1)?.messageId} conversationId={selectedId ?? undefined} message={recordMessage ?? undefined} onCloseSource={() => { setRecordMessage(null); setManagementOpen(false); }} onOpenNote={onOpenNote} /> : null}
        <div className={styles.messages} aria-live="polite">
          {!selected ? <div className={styles.welcome}>
            <span className={styles.welcomeMark}><BookIcon size={48} accent /><SparkIcon size={22} /></span>
            <h2>今天想聊些什么？</h2><p>提问、梳理知识，或一起完成一份笔记。</p>
          </div> : null}
          {selected?.readOnly ? <p className={styles.readOnly}>此会话属于历史资料集，只能回看。请新建对话继续提问。</p> : null}
          {loading ? <p className={styles.muted}>正在恢复消息…</p> : null}
          {messages.map(message => {
            const turn = turns[message.turnId];
            const citations = message.citations ?? [];
            return <article key={message.messageId} className={`${styles.message} ${message.role === 'user' ? styles.user : styles.assistant}`}>
              {message.role === 'assistant' ? <div className={styles.messageMeta}><BookIcon size={18} accent /><strong>Knowra</strong><time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time></div> : null}
              <div className={styles.messageText}><ReadableMarkdown text={message.content} /></div>
              {message.role === 'assistant' ? <>
                {citations.length ? <div className={styles.sources} aria-label="回答来源">
                  {citations.map((ref, index) => <Button key={`${ref.noteVersionId}:${ref.start}:${index}`} variant="default" size="compact"
                    onPress={() => void openSource(ref, message.messageId)}>来源 {index + 1} · {noteName(ref.noteId)} · {ref.start + 1}–{ref.end}</Button>)}
                </div> : !message.sourceFree ? <p className={styles.muted}>此回答未列出可核对引用。</p> : null}
                <div className={styles.messageActions}>
                  {!selected?.readOnly ? <Button variant="ghost" size="compact" onPress={() => setRecordMessage(message)}>记录为笔记</Button> : null}
                <details className={styles.trace} onToggle={event => { if (event.currentTarget.open) void showTrace(message.turnId); }}>
                  <summary>检索与调用记录</summary>
                  {turn ? <Trace turn={turn} /> : <p>正在读取记录…</p>}
                </details>
                </div>
                {artifacts.filter(action => action.requestId === message.turnId).map(action => <button
                  key={action.actionId} type="button" className={styles.artifactCard} onClick={() => openInbox(action.actionId)}>
                  <NoteIcon size={19} /><span>{action.plan.items.map(item => item.after.title).join('、')}<small>成果草稿 · 点击审阅</small></span>
                </button>)}
              </> : null}
              {sourceView?.messageId === message.messageId ? <section className={styles.sourceDetail} aria-label="引用原文定位">
                <h3>{noteName(sourceView.ref.noteId)} · 历史版本</h3>
                <p>{sourceView.text.slice(Math.max(0, sourceView.ref.start - 80), sourceView.ref.start)}
                  <mark>{sourceView.text.slice(sourceView.ref.start, sourceView.ref.end)}</mark>
                  {sourceView.text.slice(sourceView.ref.end, sourceView.ref.end + 80)}</p>
                {notes.some(note => note.id === sourceView.ref.noteId) ? <Button variant="default" size="compact"
                  onPress={() => onOpenNote(sourceView.ref.noteId)}>打开当前笔记</Button> : null}
                <Button variant="ghost" size="compact" onPress={() => setSourceView(null)}>关闭原文</Button>
              </section> : null}
            </article>;
          })}
          {latestTurn && latestTurn.status !== 'succeeded' ? <div className={styles.turnState} role="status">
            <strong>{statusName[latestTurn.status]}</strong>
            <span>{latestTurn.status === 'running' ? phaseName[latestTurn.phase] : latestTurn.errorCode ?? ''}</span>
            {isActive(latestTurn) ? <Button variant="ghost" size="compact" isDisabled={pending}
              onPress={() => void actOnTurn('cancel')}>停止生成</Button> : null}
            {['failed', 'interrupted', 'staged'].includes(latestTurn.status) ? <>
              <Button variant="default" size="compact" isDisabled={pending || !status?.generationAvailable || selected?.readOnly || deliveryUncertain}
                onPress={() => void actOnTurn('resume')}>从检查点继续</Button>
              <Button variant="default" size="compact" isDisabled={pending || !status?.generationAvailable || selected?.readOnly}
                onPress={() => void actOnTurn('retry')}>重试本轮</Button>
              {deliveryUncertain ? <p>此前模型请求的发送结果未知，继续不会自动重发。重新调用可能产生重复费用。</p> : null}
            </> : null}
          </div> : null}
        </div>
        {error ? <div className={styles.error} role="alert">{error} <Button variant="ghost" size="compact"
          onPress={() => void reloadPage()}>重新加载助手</Button></div> : null}
        {notice ? <p className={styles.muted} role="status">{notice}</p> : null}
        {reviewingOtherDraft ? <p className={styles.reviewWarning} role="status">当前审阅的成果不属于此对话最后一轮。聊天不会自动修改右侧成果；关闭审阅后可继续普通对话。</p> : null}
        <div className={styles.composer} aria-label="提问区">
          <div className={styles.composerInner}>
            {selected?.readOnly ? <div className={styles.readOnlyComposer}>
              <span>这是历史会话，只能回看。</span>
              <Button variant="accent" size="compact" onPress={() => navigate('/assistant?new=1')}>新对话</Button>
            </div> : <>
              {initialNoteId && notes.some(note => note.id === initialNoteId) ? <p className={styles.composerHint}>来自笔记「{noteName(initialNoteId)}」；授权后才能读取。</p> : null}
              <div className={styles.composerCard} data-conversation-composer="true">
          <TextAreaField label="消息" presentation="composer" value={draft}
                  onChange={value => { setDraft(value); pendingSend.current = null; }}
                  placeholder={selected ? '继续追问，或说说接下来想做什么…' : '给 Knowra 发消息…'} rows={2} />
                <div className={styles.composerToolbar}>
                  <ConversationAttachmentPicker key={spaceId ?? 'no-space'} conversationId={selectedId} ensureConversation={ensureAttachmentConversation} />
                  <div className={styles.scopePicker}><Select label="资料范围" presentation="toolbar" selectedKey={scopeChoice}
                    onSelectionChange={key => { scopeRevision.current++; setScopeChoice(String(key)); pendingSend.current = null; }}
                    options={[{ id: 'plain', label: '普通聊天 · 不读取笔记' }, ...activePolicies.map(policy => ({
                      id: policy.policyId, label: `${scopeName(policy)} · 至 ${formatTime(policy.expiresAt)}`
                    }))]} /></div>
                  <Button className={styles.scopeAction} variant="ghost" size="compact" onPress={() => {
                    setGrantKind('library');
                    setGrantNoteId(initialNoteId ?? notes[0]?.id ?? '');
                    setGrantFolderId(folders[0]?.id ?? ''); setGrantOpen(true);
                  }}>设置读取范围</Button>
                  {chosenPolicy ? <Button className={styles.scopeAction} variant="ghost" size="compact" isDisabled={pending}
                    onPress={() => void revokePolicy(chosenPolicy)}>撤销此授权</Button> : null}
                  <span className={styles.composerSpacer} />
                  <Button variant="accent" shape="pill" size="compact" isDisabled={!draft.trim() || draft.length > 3800 || pending || loading || reviewingOtherDraft || !status?.generationAvailable
                    || blocked(latestTurn) || scopeChoice !== 'plain' && !chosenPolicy}
                    onPress={() => void send()}>{pending ? '处理中…' : pendingSend.current ? '重试发送' : '发送消息'}</Button>
                </div>
              </div>
              <p className={styles.composerHint}>{chosenPolicy ? '仅相关且获授权的笔记片段可能发送给 DeepSeek。' : '附件仅存于当前对话，尚不能用于内容问答；需授权后才能读取笔记。'}</p>
              {draft.length > 3800 ? <p className={styles.composerError} role="alert">问题超过 3800 字符。</p> : null}
            </>}
          </div>
        </div>
      </div>
      {spaceId ? <AIInbox key={spaceId} spaceId={spaceId} isOpen={inboxOpen} focusActionId={focusedActionId} currentTurnId={latestTurn?.turnId ?? null}
        onSelectedActionChange={setReviewedAction} onRowsChange={setArtifacts} onOpenChange={next => {
        setInboxOpen(next); if (!next && inboxOpen) { const opener = inboxOpener.current ?? inboxTrigger.current;
          window.requestAnimationFrame(() => opener?.focus()); setFocusedActionId(null); }
      }} refreshKey={`${messages.at(-1)?.messageId ?? ''}:${latestTurn?.status ?? ''}`} onOpenNote={onOpenNote} /> : null}
  </WorkspacePanelBody>
    <Dialog title="确认重新调用模型" isOpen={retryConfirmOpen} onOpenChange={setRetryConfirmOpen} size="sm">
      <DialogBody><p>此前请求可能已发送，结果与费用尚未核清。重试会重新调用模型，可能产生重复费用；已发送的内容无法收回。</p></DialogBody>
      <DialogFooter><Button variant="ghost" onPress={() => setRetryConfirmOpen(false)}>暂不重试</Button>
        <Button variant="primary" isDisabled={pending} onPress={() => void actOnTurn('retry', true)}>确认重试本轮</Button></DialogFooter>
    </Dialog>
    <Dialog title="授权助手读取资料" description={status?.simulation
      ? '离线模拟仅在当前运行端处理授权片段，不向供应商发送。可随时撤销，过期后自动失效。'
      : '助手只在本次对话选择此范围时检索资料。相关片段可能发送给 DeepSeek；附件不会发送。可随时撤销，过期后自动失效。'}
      isOpen={grantOpen} onOpenChange={setGrantOpen} isPending={pending} size="md">
      <DialogBody>
        <div className={styles.grantFields}>
          <Select label="授权范围" selectedKey={grantKind} onSelectionChange={key => setGrantKind(String(key) as typeof grantKind)}
            options={[{ id: 'library', label: '当前知识空间' }, { id: 'folder', label: '一个目录' }, { id: 'fixed', label: '一篇笔记' }]} />
          {grantKind === 'folder' ? <Select label="目录" selectedKey={grantFolderId || null} onSelectionChange={key => setGrantFolderId(String(key))}
            options={folders.map(folder => ({ id: folder.id, label: folder.name }))} /> : null}
          {grantKind === 'fixed' ? <Select label="笔记" selectedKey={grantNoteId || null} onSelectionChange={key => setGrantNoteId(String(key))}
            options={notes.map(note => ({ id: note.id, label: note.title || '无标题笔记' }))} /> : null}
          <Select label="有效期" selectedKey={grantDays} onSelectionChange={key => setGrantDays(String(key))}
            options={[{ id: '1', label: '1 天' }, { id: '7', label: '7 天' }, { id: '30', label: '30 天' }]} />
          <p className={styles.muted}>普通笔记可供 AI 读取，不代表公开共享；私密笔记始终排除。授权不自动发送整篇资料。助手每次检索和外发前都会核对范围、版本和有效期。</p>
        </div>
      </DialogBody>
      <DialogFooter><Button variant="ghost" onPress={() => setGrantOpen(false)}>取消</Button>
        <Button variant="primary" isDisabled={pending || grantKind === 'folder' && !grantFolderId || grantKind === 'fixed' && !grantNoteId}
          onPress={() => void createPolicy()}>确认授权</Button></DialogFooter>
    </Dialog>
  </WorkspacePanel>;
}

function Trace({ turn }: { turn: ConversationTurn }) {
  const calls = turn.toolCalls ?? [];
  return <div className={styles.traceBody}>
    <p>本轮：{statusName[turn.status]}{turn.errorCode ? ` · ${turn.errorCode}` : ''} · 模型尝试 {turn.modelAttempts?.length ?? 0} 次</p>
    {calls.length ? <ol>{calls.map(call => <li key={call.callId}>
      <strong>{call.toolName === 'notes_search' ? call.argumentsJson.origin === 'automatic' ? '自动检索笔记' : '检索笔记' : call.toolName === 'notes_read' ? '阅读笔记' : '生成笔记计划（尚未写入）'}</strong>
      {typeof call.argumentsJson.query === 'string' ? ` · ${call.argumentsJson.query}` : null}
      <span> · {call.status === 'succeeded' ? `${call.sourceRefs.length} 个来源片段` : call.status === 'failed'
        ? `失败：${call.errorCode ?? '未知原因'}` : turn.status === 'running' ? '执行中' : '执行未完成'}</span>
      {call.resultJson?.mode === 'keyword_fallback' ? <span> · 索引无可用结果，已改用关键词检索</span>
        : call.resultJson?.mode === 'keyword' ? <span> · 关键词检索</span> : null}
      {call.resultJson?.truncated === true ? <span> · 检索范围受限</span> : null}
    </li>)}</ol> : <p>本轮没有检索或阅读工具记录。</p>}
  </div>;
}
