import { useDeferredValue, useEffect, useMemo, useState, type FormEvent } from 'react';
import type { Tag, TagColor, TagGroup } from '@study-accelerator/web-core';
import { Button, Dialog, DialogBody, DialogClose, DialogFooter, Select, TextField } from '../../components/ui';
import { PlusIcon } from '../../shell/icons';
import { TagChip, normalizeTagColor } from './TagChip';
import styles from './TagPickerDialog.module.css';

const COLORS: TagColor[] = ['neutral', 'blue', 'green', 'orange', 'red', 'violet'];
const REMOVE_WITHOUT_MERGE = '__remove_without_merge__';
type DialogMode = 'select' | 'manage' | 'form' | 'delete';
type ReturnMode = Extract<DialogMode, 'select' | 'manage'>;

export function TagPickerDialog({
  isOpen, tags, groups, selectedTagIds, usageCounts = {}, canWrite, onOpenChange,
  onCreateTag, onUpdateTag, onDeleteTag, onMergeTags, onOpenFullManager, onSave
}: {
  isOpen: boolean;
  tags: Tag[];
  groups: TagGroup[];
  selectedTagIds: string[];
  usageCounts?: Record<string, number>;
  canWrite: boolean;
  onOpenChange(open: boolean): void;
  onCreateTag(input: { name: string; color: TagColor; groupId: string }): Promise<Tag>;
  onUpdateTag?(id: string, input: { name?: string; color?: TagColor; groupId?: string }): Promise<Tag>;
  onDeleteTag?(id: string): Promise<void>;
  onMergeTags?(sourceTagId: string, targetTagId: string): Promise<void>;
  onOpenFullManager?(): void;
  onSave(tagIds: string[]): Promise<void>;
}) {
  const [mode, setMode] = useState<DialogMode>('select');
  const [returnMode, setReturnMode] = useState<ReturnMode>('select');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [managerQuery, setManagerQuery] = useState('');
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Tag | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [name, setName] = useState('');
  const [groupId, setGroupId] = useState('');
  const [color, setColor] = useState<TagColor>('blue');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const defaultGroupId = groups.find((group) => group.code === 'ordinary')?.id ?? groups[0]?.id ?? '';
  const deferredQuery = useDeferredValue(query);
  const deferredManagerQuery = useDeferredValue(managerQuery);

  useEffect(() => {
    if (!isOpen) return;
    setMode('select');
    setReturnMode('select');
    setSelected(new Set(selectedTagIds));
    setQuery('');
    setManagerQuery('');
    setEditingTag(null);
    setDeleteTarget(null);
    setMergeTargetId('');
    setError('');
    setNotice('');
    setGroupId(defaultGroupId);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || groupId || !defaultGroupId) return;
    setGroupId(defaultGroupId);
  }, [defaultGroupId, groupId, isOpen]);

  const orderedGroups = useMemo(() => groups.slice().sort((a, b) => a.sortOrder - b.sortOrder), [groups]);
  const visibleGroups = useMemo(() => orderedGroups.map((group) => ({
    group,
    tags: tags.filter((tag) => tag.groupId === group.id && (tag.name ?? '').toLocaleLowerCase().includes(deferredQuery.trim().toLocaleLowerCase()))
  })).filter((entry) => entry.tags.length > 0), [deferredQuery, orderedGroups, tags]);
  const managedGroups = useMemo(() => orderedGroups.map((group) => ({
    group,
    tags: tags.filter((tag) => tag.groupId === group.id && (tag.name ?? '').toLocaleLowerCase().includes(deferredManagerQuery.trim().toLocaleLowerCase()))
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
  })).filter((entry) => entry.tags.length > 0), [deferredManagerQuery, orderedGroups, tags]);
  const selectedTags = tags.filter((tag) => selected.has(tag.id));
  const exactMatch = tags.some((tag) => (tag.name ?? '').trim().toLocaleLowerCase() === query.trim().toLocaleLowerCase());
  const deleteUsageCount = deleteTarget ? usageCounts[deleteTarget.id] ?? 0 : 0;

  function addTagRespectingGroup(current: Set<string>, tag: Tag) {
    const next = new Set(current);
    const group = groups.find((item) => item.id === tag.groupId);
    if (group?.selectionMode === 'single') {
      const previous = tags.find((item) => item.groupId === group.id && next.has(item.id));
      tags.filter((item) => item.groupId === group.id).forEach((item) => next.delete(item.id));
      if (previous && previous.id !== tag.id) setNotice(`已用“${tag.name}”替换“${previous.name}”`);
    }
    next.add(tag.id);
    return next;
  }

  function toggle(tag: Tag) {
    if (!canWrite) return;
    setSelected((current) => {
      if (current.has(tag.id)) {
        const next = new Set(current);
        next.delete(tag.id);
        return next;
      }
      return addTagRespectingGroup(current, tag);
    });
  }

  function openCreate(from: ReturnMode, suggestedName = '') {
    setReturnMode(from);
    setEditingTag(null);
    setName(suggestedName);
    setGroupId(defaultGroupId);
    setColor(COLORS[tags.length % COLORS.length]);
    setError('');
    setMode('form');
  }

  function openEdit(tag: Tag) {
    setReturnMode('manage');
    setEditingTag(tag);
    setName(tag.name ?? '');
    setGroupId(tag.groupId ?? defaultGroupId);
    setColor(normalizeTagColor(tag.color));
    setError('');
    setMode('form');
  }

  function openDelete(tag: Tag) {
    setDeleteTarget(tag);
    setMergeTargetId('');
    setError('');
    setMode('delete');
  }

  async function submitTag() {
    const normalized = name.trim();
    if (!normalized || !groupId) return;
    setPending(true);
    setError('');
    try {
      if (editingTag) {
        if (!onUpdateTag) throw new Error('当前模式不支持编辑标签');
        const updated = await onUpdateTag(editingTag.id, { name: normalized, color, groupId });
        setNotice(`已更新标签“${updated.name}”`);
      } else {
        const tag = await onCreateTag({ name: normalized, color, groupId });
        if (returnMode === 'select') setSelected((current) => addTagRespectingGroup(current, tag));
        setNotice(returnMode === 'select' ? `已创建并添加“${tag.name}”` : `已创建标签“${tag.name}”`);
      }
      setName('');
      setEditingTag(null);
      setQuery('');
      setMode(returnMode);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '标签保存失败，请检查后重试');
    } finally {
      setPending(false);
    }
  }

  async function deleteTag() {
    if (!deleteTarget) return;
    setPending(true);
    setError('');
    try {
      const sourceId = deleteTarget.id;
      if (mergeTargetId) {
        if (!onMergeTags) throw new Error('当前模式不支持合并标签');
        await onMergeTags(sourceId, mergeTargetId);
      } else {
        if (!onDeleteTag) throw new Error('当前模式不支持删除标签');
        await onDeleteTag(sourceId);
      }
      setSelected((current) => {
        const next = new Set(current);
        const sourceWasAssigned = next.has(sourceId) || selectedTagIds.includes(sourceId);
        next.delete(sourceId);
        const target = tags.find((tag) => tag.id === mergeTargetId);
        return sourceWasAssigned && target ? addTagRespectingGroup(next, target) : next;
      });
      setNotice(mergeTargetId ? `已合并并删除“${deleteTarget.name}”` : `已删除标签“${deleteTarget.name}”`);
      setDeleteTarget(null);
      setMergeTargetId('');
      setMode('manage');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '删除标签失败，请重试');
    } finally {
      setPending(false);
    }
  }

  async function save() {
    setPending(true);
    setError('');
    try {
      await onSave([...selected]);
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '标签保存失败，请重试');
    } finally {
      setPending(false);
    }
  }

  if (!isOpen) return null;
  return <Dialog title={dialogTitle(mode, editingTag)} description={dialogDescription(mode)} size="md" isOpen onOpenChange={onOpenChange} isPending={pending}>
    <DialogBody key={mode} className={styles.body}>
      {mode === 'select' ? <SelectTagsView canWrite={canWrite} query={query} selected={selected} selectedTags={selectedTags} visibleGroups={visibleGroups} exactMatch={exactMatch} notice={notice} error={error} onQueryChange={setQuery} onToggle={toggle} onCreate={() => openCreate('select')} onCreateFromQuery={() => openCreate('select', query.trim())} onManage={() => { setError(''); setMode('manage'); }} /> : null}
      {mode === 'manage' ? <ManageTagsView canWrite={canWrite} query={managerQuery} groups={managedGroups} usageCounts={usageCounts} notice={notice} error={error} onQueryChange={setManagerQuery} onCreate={() => openCreate('manage')} onEdit={openEdit} onDelete={openDelete} onOpenFullManager={onOpenFullManager ? () => { onOpenChange(false); onOpenFullManager(); } : undefined} /> : null}
      {mode === 'form' ? <TagForm editingTag={editingTag} groups={orderedGroups} name={name} groupId={groupId} color={color} error={error} onNameChange={setName} onGroupChange={setGroupId} onColorChange={setColor} onSubmit={() => void submitTag()} /> : null}
      {mode === 'delete' && deleteTarget ? <DeleteTagView tag={deleteTarget} usageCount={deleteUsageCount} candidates={tags.filter((tag) => tag.id !== deleteTarget.id)} mergeTargetId={mergeTargetId} error={error} onMergeTargetChange={setMergeTargetId} /> : null}
    </DialogBody>
    <DialogFooter>
      {mode === 'select' ? <><DialogClose variant="ghost">取消</DialogClose>{canWrite ? <Button variant="primary" isPending={pending} onPress={() => void save()}>保存到笔记</Button> : null}</> : null}
      {mode === 'manage' ? <Button variant="primary" onPress={() => { setError(''); setMode('select'); }}>返回选择标签</Button> : null}
      {mode === 'form' ? <><Button variant="ghost" onPress={() => { setError(''); setMode(returnMode); }}>取消</Button><Button type="submit" form="tag-form" variant={editingTag ? 'primary' : 'accent'} isPending={pending} isDisabled={!name.trim() || !groupId}>{editingTag ? '保存修改' : returnMode === 'select' ? '创建并添加' : '创建标签'}</Button></> : null}
      {mode === 'delete' ? <><Button variant="ghost" onPress={() => { setError(''); setMode('manage'); }}>取消</Button><Button variant="danger" isPending={pending} onPress={() => void deleteTag()}>{mergeTargetId ? '合并并删除' : deleteUsageCount ? `从 ${deleteUsageCount} 篇笔记移除并删除` : '删除标签'}</Button></> : null}
    </DialogFooter>
  </Dialog>;
}

function SelectTagsView({ canWrite, query, selected, selectedTags, visibleGroups, exactMatch, notice, error, onQueryChange, onToggle, onCreate, onCreateFromQuery, onManage }: {
  canWrite: boolean; query: string; selected: Set<string>; selectedTags: Tag[]; visibleGroups: Array<{ group: TagGroup; tags: Tag[] }>;
  exactMatch: boolean; notice: string; error: string; onQueryChange(value: string): void; onToggle(tag: Tag): void;
  onCreate(): void; onCreateFromQuery(): void; onManage(): void;
}) {
  return <>
    <div className={styles.primaryTools}>
      <TextField label="搜索已有标签" type="search" name="tag-search" autoComplete="off" value={query} onChange={onQueryChange} placeholder="输入标签名称…" />
      <div className={styles.primaryActions}>{canWrite ? <Button variant="accent" icon={<PlusIcon size={16} />} onPress={onCreate}>新建标签</Button> : null}<Button onPress={onManage}>管理标签库</Button></div>
    </div>
    {selectedTags.length > 0 ? <section className={styles.block} aria-label="已选择标签"><h3>已选择 <span>{selectedTags.length}</span></h3><div className={styles.chips}>{selectedTags.map((tag) => <TagChip key={tag.id} tag={tag} selected removable={canWrite} aria-label={`移除标签 ${tag.name}`} onClick={() => onToggle(tag)} />)}</div></section> : <p className={styles.emptySelected}>当前笔记尚未选择标签。</p>}
    <div>{visibleGroups.map(({ group, tags }) => <section className={styles.group} key={group.id}><div className={styles.groupHeader}><strong>{group.name}</strong><span>{group.selectionMode === 'single' ? '单选' : '多选'}{group.isSystem ? ' · 内置' : ''}</span></div><div className={styles.chips}>{tags.map((tag) => <TagChip key={tag.id} tag={tag} selected={selected.has(tag.id)} aria-pressed={selected.has(tag.id)} onClick={() => onToggle(tag)} />)}</div></section>)}</div>
    {visibleGroups.length === 0 ? <div className={styles.noResults}><strong>没有找到“{query.trim()}”</strong>{canWrite && query.trim() && !exactMatch ? <Button variant="accent" onPress={onCreateFromQuery}>以此名称新建标签</Button> : null}</div> : null}
    <Feedback notice={notice} error={error} />
  </>;
}

function ManageTagsView({ canWrite, query, groups, usageCounts, notice, error, onQueryChange, onCreate, onEdit, onDelete, onOpenFullManager }: {
  canWrite: boolean; query: string; groups: Array<{ group: TagGroup; tags: Tag[] }>; usageCounts: Record<string, number>;
  notice: string; error: string; onQueryChange(value: string): void; onCreate(): void; onEdit(tag: Tag): void; onDelete(tag: Tag): void; onOpenFullManager?: () => void;
}) {
  return <>
    <div className={styles.manageTools}><TextField label="搜索标签库" type="search" name="tag-manager-search" autoComplete="off" value={query} onChange={onQueryChange} placeholder="按名称查找…" />{canWrite ? <Button variant="accent" icon={<PlusIcon size={16} />} onPress={onCreate}>新建标签</Button> : null}</div>
    <div className={styles.manageGroups}>{groups.map(({ group, tags }) => <section className={styles.manageGroup} key={group.id} aria-labelledby={`picker-manage-${group.id}`}><header><h3 id={`picker-manage-${group.id}`}>{group.name}</h3><span>{group.selectionMode === 'single' ? '单选' : '多选'}{group.isSystem ? ' · 内置' : ''}</span></header><div className={styles.manageRows}>{tags.map((tag) => <article className={styles.manageRow} key={tag.id}><TagChip tag={tag} className={styles.manageTag} /><span className={styles.usage}>{usageCounts[tag.id] ?? 0} 篇笔记</span><div className={styles.rowActions}>{canWrite ? <Button variant="ghost" onPress={() => onEdit(tag)}>编辑</Button> : null}{canWrite && !tag.isSystem ? <Button variant="danger" onPress={() => onDelete(tag)}>删除</Button> : null}{tag.isSystem ? <span className={styles.systemNote}>内置标签不可删除</span> : null}</div></article>)}</div></section>)}</div>
    {groups.length === 0 ? <p className={styles.empty}>没有符合条件的标签。</p> : null}
    {onOpenFullManager ? <a className={styles.fullManager} href="#/materials/tags" onClick={(event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      onOpenFullManager();
    }}>打开完整标签管理页</a> : null}
    <Feedback notice={notice} error={error} />
  </>;
}

function TagForm({ editingTag, groups, name, groupId, color, error, onNameChange, onGroupChange, onColorChange, onSubmit }: {
  editingTag: Tag | null; groups: TagGroup[]; name: string; groupId: string; color: TagColor; error: string;
  onNameChange(value: string): void; onGroupChange(value: string): void; onColorChange(value: TagColor): void; onSubmit(): void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }
  return <form id="tag-form" className={styles.form} onSubmit={submit}>
    <TextField label="标签名称" description="1–30 个字符，工作区内不能重名。" name="tag-name" autoComplete="off" value={name} onChange={onNameChange} maxLength={30} isRequired />
    <Select label="所属分组" name="tag-group" selectedKey={groupId} onSelectionChange={(key) => onGroupChange(String(key))} isDisabled={Boolean(editingTag?.isSystem)} options={groups.map((group) => ({ id: group.id, label: `${group.name}${group.isSystem ? ' · 内置' : ''}` }))} />
    <fieldset className={styles.colorField}><legend>颜色</legend><div className={styles.palette}>{COLORS.map((item) => <button key={item} type="button" className={styles.swatch} data-color={item} aria-label={`${colorLabel(item)}色`} aria-pressed={color === item} onClick={() => onColorChange(item)}><span aria-hidden="true" /></button>)}</div></fieldset>
    {editingTag?.isSystem ? <p className={styles.helper}>内置标签可改名、改色，但不能更换分组或删除。</p> : null}
    <Feedback error={error} />
  </form>;
}

function DeleteTagView({ tag, usageCount, candidates, mergeTargetId, error, onMergeTargetChange }: {
  tag: Tag; usageCount: number; candidates: Tag[]; mergeTargetId: string; error: string; onMergeTargetChange(value: string): void;
}) {
  return <div className={styles.deletePanel}>
    <TagChip tag={tag} />
    <p>{usageCount > 0 ? `这个标签正在被 ${usageCount} 篇笔记使用。你可以先合并，或从这些笔记中移除后删除。` : '这个标签尚未被任何笔记使用，可以安全删除。'}</p>
    {usageCount > 0 ? <Select label="合并到其他标签（可选）" description="选择后，原标签的笔记引用会迁移到目标标签。" name="merge-target" selectedKey={mergeTargetId || REMOVE_WITHOUT_MERGE} onSelectionChange={(key) => onMergeTargetChange(key === REMOVE_WITHOUT_MERGE ? '' : String(key))} options={[{ id: REMOVE_WITHOUT_MERGE, label: '不合并，直接移除引用' }, ...candidates.map((candidate) => ({ id: candidate.id, label: candidate.name ?? '未命名标签' }))]} /> : null}
    <Feedback error={error} />
  </div>;
}

function Feedback({ notice = '', error = '' }: { notice?: string; error?: string }) {
  return <>{notice ? <p className={styles.notice} role="status" aria-live="polite">{notice}</p> : null}{error ? <p className={styles.error} role="alert">{error}</p> : null}</>;
}

function dialogTitle(mode: DialogMode, editingTag: Tag | null) {
  if (mode === 'manage') return '管理标签库';
  if (mode === 'form') return editingTag ? '编辑标签' : '新建标签';
  if (mode === 'delete') return '删除标签';
  return '编辑笔记标签';
}

function dialogDescription(mode: DialogMode) {
  if (mode === 'manage') return '修改或删除工作区中的标签；这些更改会立即生效。';
  if (mode === 'form') return '设置标签名称、所属分组和颜色。';
  if (mode === 'delete') return '删除属于全局操作，请确认对已有笔记的影响。';
  return '给当前笔记添加或移除标签。';
}

function colorLabel(color: TagColor) {
  return ({ neutral: '中性', blue: '蓝', green: '绿', orange: '橙', red: '红', violet: '紫' })[color];
}
