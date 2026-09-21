import { useEffect, useMemo, useRef, useState } from 'react';
import type { Annotation, CreateKnowledgeCandidateInput, CreateKnowledgeEvidenceInput, KnowledgeEvidence, KnowledgeEvidenceMutationResult, KnowledgeItem, KnowledgeReviewStatus, Note, UpdateKnowledgeItemInput } from '@study-accelerator/web-core';
import { Button, Dialog, DialogBody, DialogFooter } from '../../components/ui';
import { CreateKnowledgeCandidateDialog } from './CreateKnowledgeCandidateDialog';
import { KnowledgeDetail } from './KnowledgeDetail';
import { KnowledgeSourceDialog } from './KnowledgeSourceDialog';
import { KnowledgeItemDialog } from './KnowledgeItemDialog';
import { knowledgeFormValue } from './KnowledgeItemForm';
import { getKnowledgeDraftScope, knowledgeDraftRecovery, type KnowledgeDraft } from './knowledgeDraftRecovery';
import { filterKnowledgeItems, KNOWLEDGE_STATUS_LABELS, knowledgeError, knowledgeStatusLabel, knowledgeTypeLabel } from './knowledgeViewModel';
import styles from './KnowledgeWorkspaceView.module.css';

type VersionInput = { expectedUpdatedAt?: string };
export interface KnowledgeWorkspaceViewProps {
  selectedItemId?: string | null;
  refreshKey?: number;
  canWrite: boolean;
  readOnlyReason?: string;
  onSelectItem(id: string): void;
  onOpenNote(noteId: string): void;
  onList(query?: { reviewStatus?: KnowledgeReviewStatus; query?: string; noteId?: string; includeArchived?: boolean }): Promise<KnowledgeItem[]>;
  onGet(id: string): Promise<KnowledgeItem>;
  onListEvidence(id: string): Promise<KnowledgeEvidence[]>;
  notes: Note[];
  onListAnnotations(noteId: string): Promise<Annotation[]>;
  onCreateEvidence(id: string, input: CreateKnowledgeEvidenceInput): Promise<KnowledgeEvidence>;
  onRetireEvidence(id: string, evidenceId: string, input?: { expectedUpdatedAt?: string }): Promise<KnowledgeEvidenceMutationResult>;
  onCreate(input: CreateKnowledgeCandidateInput): Promise<{ item: KnowledgeItem; evidence: KnowledgeEvidence[] }>;
  onUpdate(id: string, input: UpdateKnowledgeItemInput): Promise<KnowledgeItem>;
  onConfirm(id: string, input: VersionInput): Promise<KnowledgeItem>;
  onArchive(id: string, input: VersionInput): Promise<KnowledgeItem>;
  onRestore(id: string, input: VersionInput): Promise<KnowledgeItem>;
}

export function KnowledgeWorkspaceView(props: KnowledgeWorkspaceViewProps) {
  const { selectedItemId, refreshKey, canWrite, readOnlyReason, onList, onGet, onListEvidence } = props;
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [status, setStatus] = useState('all');
  const [query, setQuery] = useState('');
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [detail, setDetail] = useState<{ item: KnowledgeItem; evidence: KnowledgeEvidence[] } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editDraft, setEditDraft] = useState<KnowledgeDraft | null>(null);
  const [recoveryDraft, setRecoveryDraft] = useState<KnowledgeDraft | undefined>();
  const [drafts, setDrafts] = useState<KnowledgeDraft[]>([]);
  const [draftError, setDraftError] = useState('');
  const scope = getKnowledgeDraftScope();
  const [archiveItem, setArchiveItem] = useState<KnowledgeItem | null>(null);
  const [sourceDialog, setSourceDialog] = useState<{ replacing?: KnowledgeEvidence } | null>(null);
  const [retireEvidence, setRetireEvidence] = useState<KnowledgeEvidence | null>(null);
  const selectedRef = useRef(selectedItemId);
  selectedRef.current = selectedItemId;

  useEffect(() => {
    let active = true;
    setListLoading(true); setListError('');
    void onList({ includeArchived: true }).then(result => { if (active) setItems(result); })
      .catch(error => { if (active) setListError(knowledgeError(error, '知识列表加载失败。')); })
      .finally(() => { if (active) setListLoading(false); });
    return () => { active = false; };
  }, [onList, refresh, refreshKey]);

  useEffect(() => {
    let active = true;
    setDetail(null); setDetailError('');
    if (!selectedItemId) { setDetailLoading(false); return; }
    setDetailLoading(true);
    void Promise.all([onGet(selectedItemId), onListEvidence(selectedItemId)])
      .then(([item, evidence]) => { if (active) setDetail({ item, evidence }); })
      .catch(error => { if (active) setDetailError(knowledgeError(error, '知识详情加载失败。')); })
      .finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; };
  }, [selectedItemId, onGet, onListEvidence, refresh, refreshKey]);

  useEffect(() => { setNotice(''); }, [selectedItemId]);

  useEffect(() => {
    try { setDrafts(knowledgeDraftRecovery.list(scope)); setDraftError(''); }
    catch (cause) { setDraftError(knowledgeError(cause, '知识恢复草稿读取失败，请保留恢复文件。')); }
  }, [scope, createOpen, editDraft, refresh]);

  function openEdit(item: KnowledgeItem) {
    const previous = drafts.find(draft => draft.kind === 'edit' && draft.candidateId === item.id);
    const initialValue = knowledgeFormValue(item);
    setRecoveryDraft(previous);
    setEditDraft(previous ?? { version: 1, kind: 'edit', candidateId: item.id, expectedUpdatedAt: item.updatedAt, initialValue, value: initialValue });
  }

  const visible = useMemo(() => filterKnowledgeItems(items, status, query), [items, status, query]);
  const counts = useMemo(() => items.reduce((result, item) => {
    const key = item.reviewStatus ?? 'candidate'; result[key] = (result[key] ?? 0) + 1; return result;
  }, {} as Record<string, number>), [items]);

  function acceptItem(item: KnowledgeItem) {
    setItems(current => current.some(row => row.id === item.id) ? current.map(row => row.id === item.id ? item : row) : [item, ...current]);
    if (selectedRef.current === item.id) setDetail(current => current ? { ...current, item } : null);
  }

  async function mutate(item: KnowledgeItem, action: KnowledgeWorkspaceViewProps['onConfirm'], message: string) {
    if (!canWrite || pending) return;
    setPending(true); setDetailError(''); setNotice('');
    try {
      const result = await action(item.id, { expectedUpdatedAt: item.updatedAt });
      acceptItem(result); setArchiveItem(null);
      if (selectedRef.current === item.id) setNotice(message);
    } catch (cause) { if (selectedRef.current === item.id) setDetailError(knowledgeError(cause)); }
    finally { setPending(false); }
  }

  async function saveSource(annotation: Annotation, replacing?: KnowledgeEvidence | null) {
    if (!detail || !canWrite || pending) return;
    setPending(true); setDetailError(''); setNotice('');
    let created = false;
    try {
      await props.onCreateEvidence(detail.item.id, {
        sourceType: 'annotation',
        annotationId: annotation.id,
        ...(annotation.noteVersionId ? { noteVersionId: annotation.noteVersionId } : {}),
        ...(annotation.revision !== undefined ? { expectedAnnotationRevision: annotation.revision } : {})
      });
      created = true;
      if (replacing) {
        const result = await props.onRetireEvidence(detail.item.id, replacing.id, { expectedUpdatedAt: replacing.updatedAt });
        acceptItem(result.item);
      }
      setSourceDialog(null);
      setNotice(replacing ? '来源已更换；旧来源已保留为历史记录。' : '来源已添加。');
      setRefresh(value => value + 1);
    } catch (cause) {
      if (created && replacing) {
        setSourceDialog(null);
        setNotice('新来源已添加，但旧来源未能自动移除；请核对后手动移除旧来源。');
        setRefresh(value => value + 1);
        return;
      }
      setDetailError(knowledgeError(cause, '知识来源保存失败。'));
      throw cause;
    } finally { setPending(false); }
  }

  async function confirmRetire() {
    if (!detail || !retireEvidence || !canWrite || pending) return;
    setPending(true); setDetailError(''); setNotice('');
    try {
      const result = await props.onRetireEvidence(detail.item.id, retireEvidence.id, { expectedUpdatedAt: retireEvidence.updatedAt });
      acceptItem(result.item);
      setRetireEvidence(null);
      setNotice('来源已移除，原摘录仍保留在来源历史中。');
      setRefresh(value => value + 1);
    } catch (cause) { setDetailError(knowledgeError(cause, '移除来源失败。')); }
    finally { setPending(false); }
  }

  return <main className={styles.page} aria-labelledby="knowledge-title">
    <header className={styles.header}><div><h1 id="knowledge-title">知识库</h1><p>从笔记中整理候选，核对来源，再确认知识。</p></div>
      <div className={styles.actions}><Button variant="ghost" isDisabled={listLoading || pending} onPress={() => setRefresh(value => value + 1)}>刷新</Button><Button variant="primary" isDisabled={!canWrite || pending} onPress={() => { setRecoveryDraft(undefined); setCreateOpen(true); }}>新建知识候选</Button></div>
    </header>
    {!canWrite ? <p className={styles.readOnly} role="status">{readOnlyReason ?? '当前为只读模式，暂不能修改知识。'}</p> : null}
    {draftError ? <p role="alert" className={styles.error}>{draftError}</p> : null}
    {drafts.length ? <section className={styles.notice} aria-label="未保存的知识草稿"><strong>有 {drafts.length} 条知识草稿尚未保存</strong>
      {drafts.map(draft => <Button key={draft.candidateId} variant="ghost" onPress={() => {
        setRecoveryDraft(draft); if (draft.kind === 'create') setCreateOpen(true); else setEditDraft(draft);
      }}>恢复草稿：{draft.value.title || '未命名知识'}</Button>)}
    </section> : null}
    <div className={styles.layout}>
      <section className={styles.listPanel} aria-label="知识列表">
        <div className={styles.filters}><label className={styles.search}>搜索知识<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索标题、陈述或解释" /></label>
          <div className={styles.statusFilters} role="group" aria-label="按知识状态筛选">
            <button type="button" aria-pressed={status === 'all'} onClick={() => setStatus('all')}>全部未归档</button>
            {Object.entries(KNOWLEDGE_STATUS_LABELS).map(([key, label]) => <button type="button" key={key} aria-pressed={status === key} onClick={() => setStatus(key)}>{label} <span>{counts[key] ?? 0}</span></button>)}
          </div>
        </div>
        <div className={styles.listScroll} aria-busy={listLoading}>
          {listError ? <p role="alert" className={styles.error}>{listError} <Button variant="ghost" onPress={() => setRefresh(value => value + 1)}>重试加载列表</Button></p> : null}
          {listLoading && items.length === 0 ? <p className={styles.empty} role="status">正在加载知识…</p> : null}
          {!listLoading && !listError && visible.length === 0 ? <p className={styles.empty}>{items.length === 0 ? '还没有知识。可从笔记标注创建候选，或手动新建。' : '没有符合条件的知识。'}</p> : null}
          <ul className={styles.items}>{visible.map(item => <li key={item.id}><button type="button" className={styles.item} aria-current={selectedItemId === item.id ? 'true' : undefined} disabled={pending} onClick={() => props.onSelectItem(item.id)}>
            <span className={styles.itemTitle}>{item.title || '未命名知识'}</span><span className={styles.itemStatement}>{item.canonicalStatement || '尚未填写核心陈述'}</span>
            <span className={styles.meta}><span>{knowledgeStatusLabel(item.reviewStatus)}</span><span>{knowledgeTypeLabel(item.knowledgeType)}</span></span>
          </button></li>)}</ul>
        </div>
      </section>
      <section className={styles.detailPanel} aria-label="知识详情面板" aria-busy={detailLoading || pending}>
        {notice ? <p role="status" className={styles.notice}>{notice}</p> : null}
        {detailError ? <p role="alert" className={styles.error}>{detailError} {!archiveItem ? <Button variant="ghost" onPress={() => setRefresh(value => value + 1)}>重新加载知识</Button> : null}</p> : null}
        {detailLoading ? <p className={styles.empty} role="status">正在加载详情与来源…</p> : detail ? <KnowledgeDetail {...detail} canWrite={canWrite} pending={pending}
          onEdit={() => openEdit(detail.item)} onConfirm={() => void mutate(detail.item, props.onConfirm, '已确认这条知识。')}
          onArchive={() => setArchiveItem(detail.item)} onRestore={() => void mutate(detail.item, props.onRestore, '已恢复为候选，请重新核对后确认。')} onOpenNote={props.onOpenNote}
          onAddSource={() => setSourceDialog({})} onReplaceSource={record => setSourceDialog({ replacing: record })} onRetireSource={setRetireEvidence} />
          : !detailError ? <div className={styles.empty}><h2>选择一条知识</h2><p>查看核心陈述、个人解释及来源，完成核对后确认。</p></div> : null}
      </section>
    </div>
    {createOpen ? <CreateKnowledgeCandidateDialog recoveryDraft={recoveryDraft} canWrite={canWrite} readOnlyReason={readOnlyReason} onClose={() => setCreateOpen(false)} onCreate={props.onCreate}
      onCreated={item => { acceptItem(item); setStatus('candidate'); setQuery(''); props.onSelectItem(item.id); }} /> : null}
    {editDraft ? <KnowledgeItemDialog key={editDraft.candidateId} title="编辑知识" draft={editDraft} recovered={Boolean(recoveryDraft)} canWrite={canWrite} readOnlyReason={readOnlyReason}
      onClose={() => setEditDraft(null)} onSubmit={async (value, baseline) => props.onUpdate(baseline.candidateId, { ...value, expectedUpdatedAt: baseline.expectedUpdatedAt })}
      onSaved={item => { if (item) { acceptItem(item); setNotice('知识已保存。'); } }} /> : null}
    {archiveItem ? <Dialog title="归档这条知识？" description={`“${archiveItem.title || '未命名知识'}”将移入已归档，来源仍保留。恢复后会成为待核对的候选。`} isOpen isPending={pending} onOpenChange={open => { if (!open && !pending) { setArchiveItem(null); setDetailError(''); } }}>
      {detailError ? <DialogBody><p role="alert" className={styles.error}>{detailError}</p></DialogBody> : null}
      <DialogFooter><Button variant="ghost" isDisabled={pending} onPress={() => { setArchiveItem(null); setDetailError(''); }}>取消</Button><Button variant="danger" isPending={pending} isDisabled={!canWrite} onPress={() => void mutate(archiveItem, props.onArchive, '知识已归档。')}>确认归档</Button></DialogFooter>
    </Dialog> : null}
    {sourceDialog && detail ? <KnowledgeSourceDialog notes={props.notes} evidence={detail.evidence} replacing={sourceDialog.replacing} onClose={() => setSourceDialog(null)} onListAnnotations={props.onListAnnotations} onSave={saveSource} /> : null}
    {retireEvidence ? <Dialog title="移除这条来源？" description="来源不会被物理删除，而会标记为不可用并保留摘录历史。若这是已确认知识的最后一个有效来源，知识会转为待修订。" isOpen isPending={pending} onOpenChange={open => { if (!open && !pending) setRetireEvidence(null); }}>
      <DialogBody><blockquote className={styles.prose}>{retireEvidence.quoteText || '该来源没有文字摘录'}</blockquote>{detailError ? <p role="alert" className={styles.error}>{detailError}</p> : null}</DialogBody>
      <DialogFooter><Button variant="ghost" isDisabled={pending} onPress={() => setRetireEvidence(null)}>取消</Button><Button variant="danger" isPending={pending} onPress={() => void confirmRetire()}>确认移除</Button></DialogFooter>
    </Dialog> : null}
  </main>;
}
