import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TrainingAssetKind, TrainingAssetRecord, TrainingPurgePreview, KnowledgeItem } from '@study-accelerator/web-core';
import { Button, Dialog, DialogBody, DialogClose, DialogFooter, SearchBox, SegmentedButton, SegmentedControl, Select, TextAreaField, TextField } from '../../components/ui';
import { WorkspacePanel, WorkspacePanelBody, WorkspacePanelFooter, WorkspacePanelHeader, WorkspacePanelToolbar } from '../../components/workspace/WorkspacePanel';
import { PathTrail } from '../../shell/PathTrail';
import { QuestionIcon, PlusIcon, SearchIcon } from '../../shell/icons';
import { useAppStore } from '../../store/AppStoreProvider';
import { useNavigate } from '../../app/router';
import styles from './TrainingWorkspaceView.module.css';

const KINDS: TrainingAssetKind[] = ['learningObjective', 'examProfile', 'examFocus', 'question'];
const LABELS: Record<TrainingAssetKind, string> = { learningObjective: '学习目标', examProfile: '考试配置', examFocus: '考点', question: '题目' };
const STATUS: Record<string, string> = { candidate: '待确认', confirmed: '已确认', archived: '已归档', draft: '草稿', validating: '待校验' };

type FormTarget = { kind: TrainingAssetKind; value?: TrainingAssetRecord } | null;
type ActionTarget = { kind: TrainingAssetKind; value: TrainingAssetRecord; action: 'trash' | 'purge' } | null;
function label(record: TrainingAssetRecord, kind: TrainingAssetKind) {
  return String(record.name ?? record.objective ?? record.stem ?? record.description ?? `${LABELS[kind]} ${record.id}`);
}
function errorText(error: unknown) { return error instanceof Error ? error.message : '操作失败，请重试。'; }

export function TrainingWorkspaceView() {
  const navigate = useNavigate();
  const dataMode = useAppStore(s => s.dataMode);
  const persistenceMode = useAppStore(s => s.persistenceMode);
  const canWriteWorkspace = useAppStore(s => s.canWriteWorkspace);
  const list = useAppStore(s => s.listTrainingAssets);
  const create = useAppStore(s => s.createTrainingAsset);
  const update = useAppStore(s => s.updateTrainingAsset);
  const mutate = useAppStore(s => s.mutateTrainingAsset);
  const inspect = useAppStore(s => s.inspectTrainingAssetPurge);
  const purge = useAppStore(s => s.purgeTrainingAsset);
  const listKnowledgeItems = useAppStore(s => s.listKnowledgeItems);
  const canWrite = dataMode === 'api' && persistenceMode === 'remote' && canWriteWorkspace();
  const [records, setRecords] = useState<Record<TrainingAssetKind, TrainingAssetRecord[]>>({ learningObjective: [], examProfile: [], examFocus: [], question: [] });
  const [knowledgeItems, setKnowledgeItems] = useState<KnowledgeItem[]>([]);
  const [kind, setKind] = useState<TrainingAssetKind>('question');
  const [view, setView] = useState<'active' | 'archived' | 'trash'>('active');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState<FormTarget>(null);
  const [action, setAction] = useState<ActionTarget>(null);
  const [preview, setPreview] = useState<TrainingPurgePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [generation, setGeneration] = useState(0);

  const reload = useCallback(async () => {
    const [objectives, profiles, focuses, questions, items] = await Promise.all([
      ...KINDS.map(value => list(value)), listKnowledgeItems({ includeDeleted: false })
    ]);
    setRecords({ learningObjective: objectives as TrainingAssetRecord[], examProfile: profiles as TrainingAssetRecord[], examFocus: focuses as TrainingAssetRecord[], question: questions as TrainingAssetRecord[] });
    setKnowledgeItems(items as KnowledgeItem[]);
  }, [list, listKnowledgeItems]);
  useEffect(() => {
    if (dataMode !== 'api') return;
    let active = true;
    setLoading(true); setError('');
    void reload().catch(cause => { if (active) setError(errorText(cause)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [dataMode, reload, generation]);

  const visible = useMemo(() => records[kind].filter(record => {
    if (view === 'trash' && !record.deletedAt) return false;
    if (view === 'trash') return label(record, kind).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
    if (record.deletedAt) return false;
    const archived = record.reviewStatus === 'archived' || Boolean(record.archivedAt);
    if (view === 'archived' ? !archived : archived) return false;
    return label(record, kind).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  }), [records, kind, view, query]);
  const activeObjectives = records.learningObjective.filter(item => !item.deletedAt && item.reviewStatus === 'confirmed');
  const activeProfiles = records.examProfile.filter(item => !item.deletedAt && !item.archivedAt);

  async function runMutation(value: TrainingAssetRecord, selectedKind: TrainingAssetKind, operation: 'validate' | 'confirm' | 'archive' | 'restore' | 'restore-deleted') {
    setBusy(true); setError(''); setNotice('');
    try { await mutate(selectedKind, value.id, operation); setNotice(`${LABELS[selectedKind]}已更新。`); setGeneration(n => n + 1); }
    catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }
  async function openPurge(value: TrainingAssetRecord, selectedKind: TrainingAssetKind) {
    setBusy(true); setError(''); setPreview(null); setAction({ kind: selectedKind, value, action: 'purge' });
    try { setPreview(await inspect(selectedKind, value.id)); }
    catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }
  async function commitAction() {
    if (!action) return;
    setBusy(true); setError(''); setNotice('');
    try {
      if (action.action === 'trash') await mutate(action.kind, action.value.id, 'trash');
      else if (preview?.decision === 'can-purge-no-history') await purge(action.kind, action.value.id, preview.expectedUpdatedAt);
      else return;
      setNotice(action.action === 'trash' ? '已移入回收站。' : '已永久清理。');
      setAction(null); setPreview(null); setGeneration(n => n + 1);
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }

  if (dataMode !== 'api') return <section className={styles.gate}><h1>试题库</h1><p role="alert">资料库尚未连接，暂时无法读取训练资产。</p></section>;
  return <WorkspacePanel as="main" aria-labelledby="training-title">
    <WorkspacePanelHeader title="试题库" code="TRAIN" titleId="training-title" icon={<QuestionIcon size={14} />}
      breadcrumb={<PathTrail path={[{ id: 'training', label: '试题库', current: true }]} variant="top" />}
      actionsLabel="训练资产操作" actions={canWrite ? <Button variant="accent" size="workspace" onPress={() => setForm({ kind })}><PlusIcon size={17} />新建{LABELS[kind]}</Button> : null} />
    <WorkspacePanelToolbar className={styles.toolbar} role="toolbar" aria-label="训练资产筛选">
      <SegmentedControl aria-label="训练资产类型">{KINDS.map(value => <SegmentedButton key={value} aria-pressed={kind === value} onPress={() => { setKind(value); setQuery(''); }}>{LABELS[value]}</SegmentedButton>)}</SegmentedControl>
      <SearchBox label={`搜索${LABELS[kind]}`} icon={<SearchIcon size={17} />} value={query} onChange={event => setQuery(event.target.value)} placeholder={`搜索${LABELS[kind]}…`} />
      <SegmentedControl aria-label="生命周期状态"><SegmentedButton aria-pressed={view === 'active'} onPress={() => setView('active')}>使用中</SegmentedButton><SegmentedButton aria-pressed={view === 'archived'} onPress={() => setView('archived')}>已归档</SegmentedButton><SegmentedButton aria-pressed={view === 'trash'} onPress={() => setView('trash')}>回收站</SegmentedButton></SegmentedControl>
    </WorkspacePanelToolbar>
    <WorkspacePanelBody className={styles.body}>
      {!canWrite ? <p className={styles.info}>桌面端暂不支持训练资产写入和清理。请在网页版处理。</p> : null}
      {error ? <p role="alert" className={styles.error}>{error}</p> : null}
      {notice ? <p role="status" className={styles.info}>{notice}</p> : null}
      {loading ? <p>正在加载训练资产…</p> : visible.length === 0 ? <p className={styles.empty}>当前筛选下没有{LABELS[kind]}。</p> : <div className={styles.cards}>{visible.map(record => <article className={styles.card} key={record.id}>
        <div className={styles.cardTop}><h2>{label(record, kind)}</h2><span>{record.deletedAt ? '回收站' : record.archivedAt ? '已归档' : STATUS[record.reviewStatus ?? ''] ?? '使用中'}</span></div>
        <p className={styles.meta}>{kind === 'learningObjective' ? `知识点 ${record.knowledgeItemId ?? '—'}` : kind === 'examFocus' ? `配置 ${record.examProfileId ?? '—'} · 目标 ${record.learningObjectiveId ?? '—'}` : kind === 'question' ? `${record.learningObjectiveIds?.length ?? 0} 个学习目标` : record.description || '考试语境配置'}</p>
        <div className={styles.actions} aria-label={`${label(record, kind)}的操作`}>
          {record.deletedAt ? <>{canWrite ? <Button size="compact" isDisabled={busy} onPress={() => void runMutation(record, kind, 'restore-deleted')}>恢复</Button> : null}{canWrite ? <Button size="compact" variant="danger" isDisabled={busy} onPress={() => void openPurge(record, kind)}>永久清理…</Button> : null}</> : <>
            {canWrite ? <Button size="compact" isDisabled={busy} onPress={() => setForm({ kind, value: record })}>编辑</Button> : null}
            {canWrite && kind === 'question' && record.reviewStatus === 'draft' ? <Button size="compact" isDisabled={busy} onPress={() => void runMutation(record, kind, 'validate')}>校验</Button> : null}
            {canWrite && record.reviewStatus === 'candidate' && kind !== 'examProfile' ? <Button size="compact" isDisabled={busy} onPress={() => void runMutation(record, kind, 'confirm')}>确认</Button> : null}
            {canWrite ? <Button size="compact" isDisabled={busy} onPress={() => void runMutation(record, kind, record.reviewStatus === 'archived' || record.archivedAt ? 'restore' : 'archive')}>{record.reviewStatus === 'archived' || record.archivedAt ? '取消归档' : '归档'}</Button> : null}
            {canWrite ? <Button size="compact" variant="danger" isDisabled={busy} onPress={() => setAction({ kind, value: record, action: 'trash' })}>删除…</Button> : null}
          </>}
        </div>
      </article>)}</div>}
    </WorkspacePanelBody>
    <WorkspacePanelFooter><span>显示 {visible.length} 个{LABELS[kind]}</span><span>{view === 'trash' ? '保留至手动清理；永久清理前会复核引用' : '回收站对象独立于归档；永久清理前会复核引用'}</span></WorkspacePanelFooter>
    {form ? <TrainingForm key={`${form.kind}-${form.value?.id ?? 'new'}`} target={form} knowledgeItems={knowledgeItems} objectives={activeObjectives} profiles={activeProfiles} pending={busy} error={error} onClose={() => { setForm(null); setError(''); }} onSave={async input => {
      setBusy(true); setError('');
      try { if (form.value) await update(form.kind, form.value.id, input); else await create(form.kind, input); setForm(null); setNotice(`${LABELS[form.kind]}已保存。`); setGeneration(n => n + 1); }
      catch (cause) { setError(errorText(cause)); }
      finally { setBusy(false); }
    }} /> : null}
    {action ? <Dialog title={action.action === 'trash' ? `删除${LABELS[action.kind]}？` : `永久清理${LABELS[action.kind]}？`} isOpen onOpenChange={open => { if (!open && !busy) { setAction(null); setPreview(null); setError(''); } }} isPending={busy}>
      <DialogBody><div className={styles.dialogContent}><p>“{label(action.value, action.kind)}”{action.action === 'trash' ? '将移入回收站，相关资产不会自动删除。' : '将被永久清理。备份与离线设备副本仍按各自保留规则处理。'}</p>
        {action.action === 'purge' && preview ? <><p>预检结果：{preview.decision === 'can-purge-no-history' ? '可以清理' : '需要先处理关联引用'}</p>{preview.references.length ? <ul>{preview.references.map(ref => <li key={`${ref.collection}-${ref.id}`}>{ref.collection} / {ref.id} · {ref.action} {ref.relatedAsset ? <Button variant="ghost" size="mini" onPress={() => {
          const target = records[ref.relatedAsset!.kind].find(item => item.id === ref.relatedAsset!.id);
          setKind(ref.relatedAsset!.kind);
          setView(target?.deletedAt ? 'trash' : target?.reviewStatus === 'archived' || target?.archivedAt ? 'archived' : 'active');
          setQuery(target ? label(target, ref.relatedAsset!.kind) : '');
          setAction(null); setPreview(null);
        }}>查看{LABELS[ref.relatedAsset.kind]}</Button> : null}</li>)}</ul> : null}</> : null}
        {error ? <p role="alert" className={styles.error}>{error}</p> : null}</div></DialogBody>
      <DialogFooter><DialogClose variant="ghost">取消</DialogClose><Button variant="danger" isDisabled={busy || (action.action === 'purge' && preview?.decision !== 'can-purge-no-history')} onPress={() => void commitAction()}>{action.action === 'trash' ? '移入回收站' : '确认永久清理'}</Button></DialogFooter>
    </Dialog> : null}
  </WorkspacePanel>;
}

function TrainingForm({ target, knowledgeItems, objectives, profiles, pending, error, onClose, onSave }: {
  target: NonNullable<FormTarget>; knowledgeItems: KnowledgeItem[]; objectives: TrainingAssetRecord[]; profiles: TrainingAssetRecord[];
  pending: boolean; error: string; onClose(): void; onSave(input: Record<string, unknown>): Promise<void>;
}) {
  const current = target.value;
  const [name, setName] = useState(String(current?.name ?? ''));
  const [description, setDescription] = useState(String(current?.description ?? ''));
  const [objective, setObjective] = useState(String(current?.objective ?? ''));
  const [stem, setStem] = useState(String(current?.stem ?? ''));
  const [answer, setAnswer] = useState(typeof current?.referenceAnswer === 'string' ? current.referenceAnswer : '');
  const [knowledgeItemId, setKnowledgeItemId] = useState(String(current?.knowledgeItemId ?? knowledgeItems.find(item => item.reviewStatus === 'confirmed' && !item.deletedAt)?.id ?? ''));
  const [objectiveId, setObjectiveId] = useState(String(current?.learningObjectiveId ?? current?.learningObjectiveIds?.[0] ?? objectives[0]?.id ?? ''));
  const [profileId, setProfileId] = useState(String(current?.examProfileId ?? profiles[0]?.id ?? ''));
  const kind = target.kind;
  async function submit() {
    const input: Record<string, unknown> = kind === 'examProfile' ? { name, description }
      : kind === 'learningObjective' ? { objective, ...(current ? {} : { actionVerb: 'explain', cognitiveLevel: 'understand', knowledgeItemId }) }
      : kind === 'examFocus' ? { description, ...(current ? {} : { examProfileId: profileId, learningObjectiveId: objectiveId }) }
      : { stem, ...(current && typeof current.referenceAnswer !== 'string' ? {} : { referenceAnswer: answer }), ...(current ? {} : { questionType: 'shortAnswer', learningObjectiveIds: [objectiveId], sources: [{ sourceType: 'manual', quote: '人工编题' }] }) };
    await onSave(input);
  }
  const valid = kind === 'examProfile' ? Boolean(name.trim()) : kind === 'learningObjective' ? Boolean(objective.trim() && (current || knowledgeItemId)) : kind === 'examFocus' ? Boolean(current || (profileId && objectiveId)) : Boolean(stem.trim() && (current || objectiveId));
  return <Dialog title={`${current ? '编辑' : '新建'}${LABELS[kind]}`} isOpen onOpenChange={open => { if (!open && !pending) onClose(); }} isPending={pending}>
    <DialogBody><div className={styles.form}>
      {kind === 'examProfile' ? <><TextField label="配置名称" value={name} onChange={setName} isRequired /><TextAreaField label="说明" value={description} onChange={setDescription} /></> : null}
      {kind === 'learningObjective' ? <>{!current ? <Select label="所属知识点" selectedKey={knowledgeItemId} onSelectionChange={key => setKnowledgeItemId(String(key))} options={knowledgeItems.filter(item => item.reviewStatus === 'confirmed' && !item.deletedAt).map(item => ({ id: item.id, label: item.title }))} /> : null}<TextAreaField label="可观察的学习目标" value={objective} onChange={setObjective} isRequired description="新目标默认使用“解释 / 理解”，可在后续编辑中调整。" /></> : null}
      {kind === 'examFocus' ? <>{!current ? <><Select label="考试配置" selectedKey={profileId} onSelectionChange={key => setProfileId(String(key))} options={profiles.map(item => ({ id: item.id, label: label(item, 'examProfile') }))} /><Select label="学习目标" selectedKey={objectiveId} onSelectionChange={key => setObjectiveId(String(key))} options={objectives.map(item => ({ id: item.id, label: label(item, 'learningObjective') }))} /></> : null}<TextAreaField label="考点说明" value={description} onChange={setDescription} /></> : null}
      {kind === 'question' ? <>{!current ? <Select label="学习目标" selectedKey={objectiveId} onSelectionChange={key => setObjectiveId(String(key))} options={objectives.map(item => ({ id: item.id, label: label(item, 'learningObjective') }))} /> : null}<TextAreaField label="题干" value={stem} onChange={setStem} isRequired /><TextAreaField label="参考答案" value={answer} onChange={setAnswer} /></> : null}
      {error ? <p role="alert" className={styles.error}>{error}</p> : null}
    </div></DialogBody><DialogFooter><DialogClose variant="ghost">取消</DialogClose><Button variant="primary" isPending={pending} isDisabled={!valid} onPress={() => void submit()}>保存</Button></DialogFooter>
  </Dialog>;
}
