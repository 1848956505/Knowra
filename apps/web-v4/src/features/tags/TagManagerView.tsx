import { useEffect, useMemo, useState } from 'react';
import type { Tag, TagColor, TagGroup } from '@study-accelerator/web-core';
import { Button, Dialog, DialogBody, DialogClose, DialogFooter } from '../../components/ui';
import { useNavigate } from '../../app/router';
import { useAppStore } from '../../store/AppStoreProvider';
import { TagChip, normalizeTagColor } from './TagChip';
import styles from './TagManagerView.module.css';

type SortMode = 'manual' | 'name' | 'usage';
type EditTarget = { kind: 'tag'; value?: Tag } | { kind: 'group'; value?: TagGroup } | null;

export function TagManagerView() {
  const data = useAppStore((state) => state.serverData);
  const canWrite = useAppStore((state) => state.canWriteWorkspace());
  const createTag = useAppStore((state) => state.createTag);
  const updateTag = useAppStore((state) => state.updateTag);
  const deleteTag = useAppStore((state) => state.deleteTag);
  const mergeTags = useAppStore((state) => state.mergeTags);
  const reorderTags = useAppStore((state) => state.reorderTags);
  const createTagGroup = useAppStore((state) => state.createTagGroup);
  const updateTagGroup = useAppStore((state) => state.updateTagGroup);
  const deleteTagGroup = useAppStore((state) => state.deleteTagGroup);
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [groupFilter, setGroupFilter] = useState('all');
  const [sort, setSort] = useState<SortMode>('manual');
  const [unusedOnly, setUnusedOnly] = useState(false);
  const [editTarget, setEditTarget] = useState<EditTarget>(null);
  const [deleteTarget, setDeleteTarget] = useState<Tag | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [draggedTagId, setDraggedTagId] = useState('');
  const usage = useMemo(() => new Map(data.tags.map((tag) => [tag.id, data.notes.filter((note) => !note.deleted && note.tagIds.includes(tag.id)).length])), [data.notes, data.tags]);
  const unusedCount = [...usage.values()].filter((count) => count === 0).length;

  const sections = data.tagGroups
    .slice().sort((a, b) => a.sortOrder - b.sortOrder)
    .filter((group) => groupFilter === 'all' || group.id === groupFilter)
    .map((group) => {
      const items = data.tags.filter((tag) => tag.groupId === group.id)
        .filter((tag) => (tag.name ?? '').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
        .filter((tag) => !unusedOnly || (usage.get(tag.id) ?? 0) === 0)
        .sort((a, b) => sort === 'name'
          ? (a.name ?? '').localeCompare(b.name ?? '', 'zh-CN')
          : sort === 'usage'
            ? (usage.get(b.id) ?? 0) - (usage.get(a.id) ?? 0)
            : (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      return { group, items };
    }).filter(({ items }) => items.length > 0 || (!query && !unusedOnly));

  async function move(tag: Tag, direction: -1 | 1) {
    const siblings = data.tags.filter((item) => item.groupId === tag.groupId).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const index = siblings.findIndex((item) => item.id === tag.id);
    const swap = index + direction;
    if (swap < 0 || swap >= siblings.length) return;
    [siblings[index], siblings[swap]] = [siblings[swap], siblings[index]];
    await reorderTags(siblings.map((item) => item.id));
  }

  async function dropBefore(target: Tag) {
    const siblings = data.tags.filter((item) => item.groupId === target.groupId).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const sourceIndex = siblings.findIndex((item) => item.id === draggedTagId);
    const targetIndex = siblings.findIndex((item) => item.id === target.id);
    setDraggedTagId('');
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return;
    const [source] = siblings.splice(sourceIndex, 1);
    siblings.splice(targetIndex, 0, source);
    await reorderTags(siblings.map((item) => item.id));
  }

  return <main className={styles.page} aria-labelledby="tag-manager-title">
    <header className={styles.header}><div><h1 id="tag-manager-title">标签管理</h1><p>{data.tags.length} 个标签 · {data.tagGroups.length} 个分组 · {unusedCount} 个未使用</p></div><div className={styles.actions}>{canWrite ? <><Button variant="primary" onPress={() => setEditTarget({ kind: 'tag' })}>新建标签</Button><Button onPress={() => setEditTarget({ kind: 'group' })}>新建分组</Button></> : null}<Button variant="ghost" onPress={() => navigate('/materials')}>返回笔记</Button></div></header>
    <section className={styles.filters} aria-label="筛选标签"><input name="tag-manager-search" autoComplete="off" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标签…" aria-label="搜索标签" /><select name="tag-group-filter" value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)} aria-label="按分组筛选"><option value="all">全部分组</option>{data.tagGroups.map((group) => <option value={group.id} key={group.id}>{group.name}</option>)}</select><select name="tag-sort" value={sort} onChange={(event) => setSort(event.target.value as SortMode)} aria-label="标签排序"><option value="manual">按手动顺序</option><option value="name">按名称</option><option value="usage">按使用量</option></select><label className={styles.unused}><input name="unused-only" type="checkbox" checked={unusedOnly} onChange={(event) => setUnusedOnly(event.target.checked)} />仅看未使用</label></section>
    <div className={styles.groups}>{sections.map(({ group, items }) => <section className={styles.group} key={group.id} aria-labelledby={`group-${group.id}`}><header className={styles.groupHeader}><div className={styles.groupTitle}><h2 id={`group-${group.id}`}>{group.name}</h2><span className={styles.meta}>{group.selectionMode === 'single' ? '单选' : '多选'}</span>{group.isSystem ? <span className={styles.system}>内置</span> : null}</div>{canWrite ? <div className={styles.groupActions}><button className={styles.small} type="button" onClick={() => setEditTarget({ kind: 'group', value: group })}>编辑分组</button>{!group.isSystem ? <button className={`${styles.small} ${styles.danger}`} type="button" disabled={data.tags.some((tag) => tag.groupId === group.id)} onClick={() => void deleteTagGroup(group.id)}>删除分组</button> : null}</div> : null}</header><div className={styles.rows}>{items.map((tag, index) => <article className={styles.row} data-dragging={draggedTagId === tag.id || undefined} draggable={canWrite && sort === 'manual'} onDragStart={() => setDraggedTagId(tag.id)} onDragEnd={() => setDraggedTagId('')} onDragOver={(event) => { if (draggedTagId && draggedTagId !== tag.id) event.preventDefault(); }} onDrop={() => void dropBefore(tag)} key={tag.id}><span className={styles.handle} aria-hidden="true">⋮⋮</span><TagChip tag={tag} /><span className={styles.usage}>{usage.get(tag.id) ?? 0} 篇笔记</span><span className={styles.color}>{colorLabel(normalizeTagColor(tag.color))}</span><div className={styles.rowActions}><button className={styles.small} type="button" onClick={() => navigate(`/materials?tags=${encodeURIComponent(tag.id)}&match=all`)}>查看笔记</button>{canWrite ? <><button className={styles.small} type="button" disabled={index === 0 || sort !== 'manual'} onClick={() => void move(tag, -1)}>上移</button><button className={styles.small} type="button" disabled={index === items.length - 1 || sort !== 'manual'} onClick={() => void move(tag, 1)}>下移</button><button className={styles.small} type="button" onClick={() => setEditTarget({ kind: 'tag', value: tag })}>编辑</button>{!tag.isSystem ? <button className={`${styles.small} ${styles.danger}`} type="button" onClick={() => { setDeleteTarget(tag); setMergeTargetId(''); }}>删除…</button> : null}</> : null}</div></article>)}{items.length === 0 ? <p className={styles.empty}>该分组暂无符合条件的标签</p> : null}</div></section>)}</div>
    {sections.length === 0 ? <p className={styles.empty}>没有符合条件的标签。</p> : null}
    <TagEditDialog target={editTarget} groups={data.tagGroups} canWrite={canWrite} onOpenChange={(open) => { if (!open) setEditTarget(null); }} onCreateTag={createTag} onUpdateTag={updateTag} onCreateGroup={createTagGroup} onUpdateGroup={updateTagGroup} />
    <TagDeleteDialog tag={deleteTarget} usageCount={deleteTarget ? usage.get(deleteTarget.id) ?? 0 : 0} candidates={data.tags.filter((tag) => tag.id !== deleteTarget?.id)} mergeTargetId={mergeTargetId} onMergeTargetChange={setMergeTargetId} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }} onDelete={async () => { if (!deleteTarget) return; if (mergeTargetId) await mergeTags(deleteTarget.id, mergeTargetId); else await deleteTag(deleteTarget.id); setDeleteTarget(null); }} />
  </main>;
}

function TagEditDialog({ target, groups, canWrite, onOpenChange, onCreateTag, onUpdateTag, onCreateGroup, onUpdateGroup }: { target: EditTarget; groups: TagGroup[]; canWrite: boolean; onOpenChange(open: boolean): void; onCreateTag(input: { name: string; color: TagColor; groupId: string }): Promise<Tag>; onUpdateTag(id: string, input: { name?: string; color?: TagColor; groupId?: string }): Promise<Tag>; onCreateGroup(input: { name: string; selectionMode: 'single' | 'multiple' }): Promise<TagGroup>; onUpdateGroup(id: string, input: { name?: string; selectionMode?: 'single' | 'multiple' }): Promise<TagGroup> }) {
  const [name, setName] = useState(''); const [groupId, setGroupId] = useState(''); const [color, setColor] = useState<TagColor>('blue'); const [selectionMode, setSelectionMode] = useState<'single' | 'multiple'>('multiple'); const [pending, setPending] = useState(false); const [error, setError] = useState('');
  useEffect(() => {
    if (!target) return;
    setName(target.value?.name ?? '');
    setGroupId(target.kind === 'tag' ? target.value?.groupId ?? groups.find((group) => group.code === 'ordinary')?.id ?? groups[0]?.id ?? '' : '');
    setColor(target.kind === 'tag' ? normalizeTagColor(target.value?.color) : 'blue');
    setSelectionMode(target.kind === 'group' ? target.value?.selectionMode ?? 'multiple' : 'multiple');
    setError('');
  }, [groups, target]);
  if (!target) return null;
  const currentTarget = target;
  async function submit() { setPending(true); setError(''); try { if (currentTarget.kind === 'tag') { if (currentTarget.value) await onUpdateTag(currentTarget.value.id, { name: name.trim(), color, groupId }); else await onCreateTag({ name: name.trim(), color, groupId }); } else if (currentTarget.value) await onUpdateGroup(currentTarget.value.id, { name: name.trim(), selectionMode }); else await onCreateGroup({ name: name.trim(), selectionMode }); onOpenChange(false); } catch (cause) { setError(cause instanceof Error ? cause.message : '保存失败'); } finally { setPending(false); } }
  return <Dialog title={`${target.value ? '编辑' : '新建'}${target.kind === 'tag' ? '标签' : '分组'}`} isOpen onOpenChange={onOpenChange} isPending={pending}><DialogBody><div className={styles.form}><label>名称<input autoFocus value={name} maxLength={30} onChange={(event) => setName(event.target.value)} /></label>{target.kind === 'tag' ? <><label>所属分组<select value={groupId} disabled={target.value?.isSystem} onChange={(event) => setGroupId(event.target.value)}>{groups.map((group) => <option value={group.id} key={group.id}>{group.name}</option>)}</select></label><label>颜色<select value={color} onChange={(event) => setColor(event.target.value as TagColor)}>{(['neutral', 'blue', 'green', 'orange', 'red', 'violet'] as TagColor[]).map((item) => <option key={item} value={item}>{colorLabel(item)}</option>)}</select></label></> : <label>选择模式<select value={selectionMode} disabled={Boolean(target.value?.isSystem)} onChange={(event) => setSelectionMode(event.target.value as 'single' | 'multiple')}><option value="multiple">多选</option><option value="single">单选</option></select></label>}{error ? <p className={styles.error} role="alert">{error}</p> : null}</div></DialogBody><DialogFooter><DialogClose variant="ghost">取消</DialogClose><Button variant="primary" isPending={pending} isDisabled={!canWrite || !name.trim() || (target.kind === 'tag' && !groupId)} onPress={() => void submit()}>保存</Button></DialogFooter></Dialog>;
}

function TagDeleteDialog({ tag, usageCount, candidates, mergeTargetId, onMergeTargetChange, onOpenChange, onDelete }: { tag: Tag | null; usageCount: number; candidates: Tag[]; mergeTargetId: string; onMergeTargetChange(id: string): void; onOpenChange(open: boolean): void; onDelete(): Promise<void> }) {
  const [pending, setPending] = useState(false); const [error, setError] = useState(''); if (!tag) return null;
  return <Dialog title={`删除标签“${tag.name}”？`} description={usageCount ? `该标签被 ${usageCount} 篇笔记引用。可先合并，或从所有笔记中移除后删除。` : '该标签尚未使用，可直接删除。'} isOpen onOpenChange={onOpenChange} isPending={pending}><DialogBody><div className={styles.form}>{usageCount > 0 ? <label>合并到（可选）<select value={mergeTargetId} onChange={(event) => onMergeTargetChange(event.target.value)}><option value="">不合并，仅移除引用</option>{candidates.map((candidate) => <option value={candidate.id} key={candidate.id}>{candidate.name}</option>)}</select></label> : null}{error ? <p className={styles.error} role="alert">{error}</p> : null}</div></DialogBody><DialogFooter><DialogClose variant="ghost">取消</DialogClose><Button variant="danger" isPending={pending} onPress={() => { setPending(true); setError(''); void onDelete().catch((cause) => setError(cause instanceof Error ? cause.message : '删除失败')).finally(() => setPending(false)); }}>{mergeTargetId ? '合并并删除' : usageCount ? `移除 ${usageCount} 处引用并删除` : '删除标签'}</Button></DialogFooter></Dialog>;
}

function colorLabel(color: TagColor) { return ({ neutral: '中性', blue: '蓝', green: '绿', orange: '橙', red: '红', violet: '紫' })[color]; }
