import { useEffect, useMemo, useRef, useState } from 'react';
import type { CreateKnowledgeCandidateInput, KnowledgeEvidence, KnowledgeItem, KnowledgeReviewStatus, UpdateKnowledgeItemInput } from '@study-accelerator/web-core';
import { Button, Dialog, DialogBody, DialogFooter } from '../../components/ui';
import { CreateKnowledgeCandidateDialog } from './CreateKnowledgeCandidateDialog';
import { KnowledgeDetail } from './KnowledgeDetail';
import { KnowledgeItemDialog } from './KnowledgeItemDialog';
import { filterKnowledgeItems, KNOWLEDGE_STATUS_LABELS, knowledgeError, knowledgeStatusLabel, knowledgeTypeLabel } from './knowledgeViewModel';
import styles from './KnowledgeWorkspaceView.module.css';

type VersionInput = { expectedUpdatedAt?: string };
export interface KnowledgeWorkspaceViewProps {
  selectedItemId?: string | null;
  canWrite: boolean;
  readOnlyReason?: string;
  onSelectItem(id: string): void;
  onOpenNote(noteId: string): void;
  onList(query?: { reviewStatus?: KnowledgeReviewStatus; query?: string; noteId?: string; includeArchived?: boolean }): Promise<KnowledgeItem[]>;
  onGet(id: string): Promise<KnowledgeItem>;
  onListEvidence(id: string): Promise<KnowledgeEvidence[]>;
  onCreate(input: CreateKnowledgeCandidateInput): Promise<{ item: KnowledgeItem; evidence: KnowledgeEvidence[] }>;
  onUpdate(id: string, input: UpdateKnowledgeItemInput): Promise<KnowledgeItem>;
  onConfirm(id: string, input: VersionInput): Promise<KnowledgeItem>;
  onArchive(id: string, input: VersionInput): Promise<KnowledgeItem>;
  onRestore(id: string, input: VersionInput): Promise<KnowledgeItem>;
}

export function KnowledgeWorkspaceView(props: KnowledgeWorkspaceViewProps) {
  const { selectedItemId, canWrite, readOnlyReason, onList, onGet, onListEvidence } = props;
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
  const [editItem, setEditItem] = useState<KnowledgeItem | null>(null);
  const [archiveItem, setArchiveItem] = useState<KnowledgeItem | null>(null);
  const selectedRef = useRef(selectedItemId);
  selectedRef.current = selectedItemId;

  useEffect(() => {
    let active = true;
    setListLoading(true); setListError('');
    void onList({ includeArchived: true }).then(result => { if (active) setItems(result); })
      .catch(error => { if (active) setListError(knowledgeError(error, '知识列表加载失败。')); })
      .finally(() => { if (active) setListLoading(false); });
    return () => { active = false; };
  }, [onList, refresh]);

  useEffect(() => {
    let active = true;
    setDetail(null); setDetailError(''); setNotice('');
    if (!selectedItemId) { setDetailLoading(false); return; }
    setDetailLoading(true);
    void Promise.all([onGet(selectedItemId), onListEvidence(selectedItemId)])
      .then(([item, evidence]) => { if (active) setDetail({ item, evidence }); })
      .catch(error => { if (active) setDetailError(knowledgeError(error, '知识详情加载失败。')); })
      .finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; };
  }, [selectedItemId, onGet, onListEvidence, refresh]);

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

  return <main className={styles.page} aria-labelledby="knowledge-title">
    <header className={styles.header}><div><h1 id="knowledge-title">知识库</h1><p>从笔记中整理候选，核对来源，再确认知识。</p></div>
      <div className={styles.actions}><Button variant="ghost" isDisabled={listLoading || pending} onPress={() => setRefresh(value => value + 1)}>刷新</Button><Button variant="primary" isDisabled={!canWrite || pending} onPress={() => setCreateOpen(true)}>新建知识候选</Button></div>
    </header>
    {!canWrite ? <p className={styles.readOnly} role="status">{readOnlyReason ?? '当前为只读模式，暂不能修改知识。'}</p> : null}
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
          onEdit={() => setEditItem(detail.item)} onConfirm={() => void mutate(detail.item, props.onConfirm, '已确认这条知识。')}
          onArchive={() => setArchiveItem(detail.item)} onRestore={() => void mutate(detail.item, props.onRestore, '已恢复为候选，请重新核对后确认。')} onOpenNote={props.onOpenNote} />
          : !detailError ? <div className={styles.empty}><h2>选择一条知识</h2><p>查看核心陈述、个人解释及来源，完成核对后确认。</p></div> : null}
      </section>
    </div>
    {createOpen ? <CreateKnowledgeCandidateDialog canWrite={canWrite} readOnlyReason={readOnlyReason} onClose={() => setCreateOpen(false)} onCreate={props.onCreate}
      onCreated={item => { acceptItem(item); setStatus('candidate'); setQuery(''); props.onSelectItem(item.id); }} /> : null}
    {editItem ? <KnowledgeItemDialog key={editItem.id} title="编辑知识" initialValue={editItem} canWrite={canWrite} readOnlyReason={readOnlyReason}
      onClose={() => setEditItem(null)} onSubmit={async value => props.onUpdate(editItem.id, { ...value, expectedUpdatedAt: editItem.updatedAt })}
      onSaved={item => { if (item) { acceptItem(item); setNotice('知识已保存。'); } }} /> : null}
    {archiveItem ? <Dialog title="归档这条知识？" description={`“${archiveItem.title || '未命名知识'}”将移入已归档，来源仍保留。恢复后会成为待核对的候选。`} isOpen isPending={pending} onOpenChange={open => { if (!open && !pending) { setArchiveItem(null); setDetailError(''); } }}>
      {detailError ? <DialogBody><p role="alert" className={styles.error}>{detailError}</p></DialogBody> : null}
      <DialogFooter><Button variant="ghost" isDisabled={pending} onPress={() => { setArchiveItem(null); setDetailError(''); }}>取消</Button><Button variant="danger" isPending={pending} isDisabled={!canWrite} onPress={() => void mutate(archiveItem, props.onArchive, '知识已归档。')}>确认归档</Button></DialogFooter>
    </Dialog> : null}
  </main>;
}
