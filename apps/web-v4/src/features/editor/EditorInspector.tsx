import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import type { AnalysisScopeInput, AnalysisScopePreview, Annotation, AnnotationKnowledgeLinks, AnnotationPreview, Attachment, Folder, Note, NoteVersion, Tag, TagColor, TagGroup, UpdateAnnotationInput } from '@study-accelerator/web-core';
import { Button, Dialog, DialogBody, DialogClose, DialogFooter, Select } from '../../components/ui';
import { Menu, MenuItem, MenuPopover, MenuTrigger, Popover, PopoverTrigger, PopoverDialog } from '../../components/ui/overlay';
import { GhostIconButton } from '../../components/ui/button';
import { Tabs, type TabsItem } from '../../components/ui/collection';
import {
  StarIcon,
  FilterIcon,
  MoreHorizontalIcon,
  CloseIcon,
  LinkIcon,
  ListIcon,
  NoteIcon,
  PaperclipIcon,
  SparkIcon,
  TagIcon
} from '../../shell/icons';
import {
  buildFolderPath,
  extractInspectorOutline,
  formatInspectorDate,
  getDocumentStats,
  getSourceLabel,
  getStatusLabel,
  resolveInspectorRelations,
  resolveNoteTags,
  type InspectorHeading,
  type InspectorRelations
} from './editorInspectorModel';
import styles from './EditorInspector.module.css';
import { EditorAttachmentPanel } from './EditorAttachmentPanel';
import { OrganizeNoteDialog } from './OrganizeNoteDialog';
import { TagChip, TagPickerDialog } from '../tags';

const inspectorTabs: TabsItem[] = [
  { id: 'info', label: '信息' },
  { id: 'outline', label: '大纲' },
  { id: 'links', label: '链接' },
  { id: 'annotations', label: '标注' },
  { id: 'versions', label: '版本' },
  { id: 'ai', label: 'AI' }
];

export interface EditorInspectorProps {
  note: Note;
  folder: Folder | null;
  foldersById: Record<string, Folder>;
  notes: Note[];
  tags: Tag[];
  tagGroups?: TagGroup[];
  markdown: string;
  open: boolean;
  canWrite: boolean;
  extendedWritesEnabled?: boolean;
  canInsertAttachment: boolean;
  attachments: Attachment[];
  attachmentsLoading: boolean;
  linkedNotes: Note[];
  linkedNotesLoading: boolean;
  annotations: Annotation[];
  annotationsLoading: boolean;
  focusedAnnotationId: string | null;
  onClose(): void;
  onOpenNote(noteId: string): void;
  onNavigateHeading(heading: InspectorHeading, index: number): void;
  onSetTags(tagIds: string[]): Promise<void>;
  onCreateTag?(input: { name: string; color: TagColor; groupId: string }): Promise<Tag>;
  onUpdateTag?(tagId: string, input: { name?: string; color?: TagColor; groupId?: string }): Promise<Tag>;
  onDeleteTag?(tagId: string): Promise<void>;
  onMergeTags?(sourceTagId: string, targetTagId: string): Promise<void>;
  onOpenTagManager?(): void;
  onOpenTag?(tagId: string): void;
  onListVersions(noteId: string): Promise<NoteVersion[]>;
  onGetVersion(noteId: string, versionId: string): Promise<NoteVersion>;
  onOrganizeNote(input: { folderId: string | null; status: string }): Promise<void>;
  onUploadAttachment(file: File): Promise<Attachment>;
  onInsertAttachment(attachment: Attachment): Promise<void>;
  onRenameAttachment(attachmentId: string, fileName: string): Promise<Attachment>;
  onDeleteAttachment(attachmentId: string): Promise<void>;
  onCreateAnnotation(scopeType?: 'selection' | 'blocks' | 'section'): Promise<void>;
  onSelectAnnotation(annotationId: string): void;
  onDeleteAnnotation(annotationId: string, expectedRevision?: number): Promise<void>;
  onRestoreAnnotation(annotationId: string, expectedRevision?: number): Promise<void>;
  onReanchorAnnotation(annotation: Annotation): Promise<void>;
  onUpdateAnnotation?(annotationId: string, input: UpdateAnnotationInput): Promise<void>;
  onPreviewAnnotation?(annotationId: string): Promise<AnnotationPreview>;
  onGetAnnotationKnowledgeLinks?(annotationId: string): Promise<AnnotationKnowledgeLinks>;
  onPreviewAnalysisScope?(input: AnalysisScopeInput): Promise<AnalysisScopePreview>;
  onCreateAnalysisScope?(input: AnalysisScopeInput & { previewHash: string; idempotencyKey: string }): Promise<{ id: string }>;
  onCreateAnnotationExclusion?(annotation: Annotation): Promise<void>;
  onDeleteAnnotationExclusion?(annotationId: string, exclusionId: string, expectedRevision: number): Promise<void>;
}

export function EditorInspector(props: EditorInspectorProps) {
  const [selectedTab, setSelectedTab] = useState('info');
  const [tagEditorOpen, setTagEditorOpen] = useState(false);
  const [organizeOpen, setOrganizeOpen] = useState(false);
  const tags = useMemo(() => resolveNoteTags(props.note, props.tags), [props.note, props.tags]);
  const relations = useMemo(() => {
    const local = resolveInspectorRelations(props.note, props.notes);
    const outgoing = props.linkedNotesLoading ? local.outgoing : props.linkedNotes;
    const relatedIds = new Set([...outgoing, ...local.backlinks].map((item) => item.id));
    return {
      ...local,
      outgoing,
      related: props.notes.filter((item) => !item.deleted && item.id !== props.note.id && relatedIds.has(item.id))
    };
  }, [props.linkedNotes, props.linkedNotesLoading, props.note, props.notes]);
  const outline = useMemo(
    () => props.open ? extractInspectorOutline(props.markdown) : [],
    [props.markdown, props.open]
  );
  const stats = useMemo(
    () => props.open ? getDocumentStats(props.markdown) : { characterCount: 0, readingMinutes: 0 },
    [props.markdown, props.open]
  );

  return (
    <aside
      className={styles.inspector}
      data-open={props.open || undefined}
      aria-label="文档检查器"
      aria-hidden={!props.open}
    >
      <header className={styles.header}>
        <h2>文档检查器</h2>
        <GhostIconButton aria-label="关闭文档检查器" onPress={props.onClose}>
          <CloseIcon size={18} />
        </GhostIconButton>
      </header>
      <Tabs
        className={styles.tabs}
        aria-label="检查器视图"
        items={inspectorTabs}
        selectedKey={selectedTab}
        onSelectionChange={(key) => setSelectedTab(String(key))}
      >
        {(item) => (
          <div className={styles.panel} data-panel={String(item.id)}>
            {item.id === 'info' ? (
              <InfoPanel
                {...props}
                assignedTags={tags}
                relations={relations}
                stats={stats}
                onEditTags={() => setTagEditorOpen(true)}
                onOrganize={() => setOrganizeOpen(true)}
              />
            ) : null}
            {item.id === 'outline' ? (
              <OutlinePanel outline={outline} onNavigate={props.onNavigateHeading} />
            ) : null}
            {item.id === 'links' ? (
              <LinksPanel relations={relations} loading={props.linkedNotesLoading} onOpenNote={props.onOpenNote} />
            ) : null}
            {item.id === 'annotations' ? (
              <AnnotationPanel key={props.note.id} {...props} canWrite={props.canWrite && props.extendedWritesEnabled !== false} />
            ) : null}
            {item.id === 'versions' ? (
              <VersionPanel
                noteId={props.note.id}
                onListVersions={props.onListVersions}
                onGetVersion={props.onGetVersion}
              />
            ) : null}
            {item.id === 'ai' ? <AnnotationPanel key={`ai-${props.note.id}`} {...props} canWrite={props.canWrite && props.extendedWritesEnabled !== false} analysisOnly /> : null}
          </div>
        )}
      </Tabs>
      <TagPickerDialog
        isOpen={tagEditorOpen}
        tags={props.tags}
        groups={props.tagGroups ?? []}
        canWrite={props.canWrite}
        selectedTagIds={props.note.tagIds}
        usageCounts={Object.fromEntries(props.tags.map((tag) => [tag.id, props.notes.filter((note) => !note.deleted && note.tagIds.includes(tag.id)).length]))}
        onOpenChange={setTagEditorOpen}
        onSave={props.onSetTags}
        onCreateTag={props.onCreateTag ?? (() => Promise.reject(new Error('当前模式不支持新建标签')))}
        onUpdateTag={props.onUpdateTag}
        onDeleteTag={props.onDeleteTag}
        onMergeTags={props.onMergeTags}
        onOpenFullManager={props.onOpenTagManager}
      />
      <OrganizeNoteDialog
        note={props.note}
        foldersById={props.foldersById}
        isOpen={organizeOpen}
        onOpenChange={setOrganizeOpen}
        onSave={props.onOrganizeNote}
      />
    </aside>
  );
}

function InfoPanel(props: EditorInspectorProps & {
  assignedTags: Tag[];
  relations: InspectorRelations;
  stats: ReturnType<typeof getDocumentStats>;
  onEditTags(): void;
  onOrganize(): void;
}) {
  const folderPath = buildFolderPath(props.folder, props.foldersById);
  return (
    <>
      <div className={styles.noteHeading}>
        <span>{getSourceLabel(props.note.sourceType)}</span>
        <h3>{props.note.title || '无标题笔记'}</h3>
      </div>
      <InspectorSection
        icon={<NoteIcon size={18} />}
        title="笔记信息"
        action={<button type="button" className={styles.sectionAction} disabled={!props.canWrite} onClick={props.onOrganize}>整理</button>}
      >
        <dl className={styles.metadata}>
          <Metadata label="类型" value="Markdown 文档" />
          <Metadata label="状态" value={<span className={styles.status}><i />{getStatusLabel(props.note.status)}</span>} />
          <Metadata label="位置" value={folderPath} />
          <Metadata label="字数" value={<><span className={styles.mono}>{props.stats.characterCount.toLocaleString('zh-CN')}</span> 字</>} />
          <Metadata label="创建" value={<span className={styles.mono}>{formatInspectorDate(props.note.createdAt)}</span>} />
          <Metadata label="更新" value={<span className={styles.mono}>{formatInspectorDate(props.note.updatedAt)}</span>} />
          <Metadata label="阅读" value={props.stats.readingMinutes > 0 ? `约 ${props.stats.readingMinutes} 分钟` : '少于 1 分钟'} />
        </dl>
      </InspectorSection>
      <InspectorSection
        icon={<TagIcon size={18} />}
        title="标签"
        count={props.assignedTags.length}
        action={<button type="button" className={styles.sectionAction} disabled={!props.canWrite} onClick={props.onEditTags}>编辑</button>}
      >
        <div className={styles.tags}>
          {props.assignedTags.length > 0
            ? props.assignedTags.map((tag) => <TagChip key={tag.id} tag={tag} onClick={props.onOpenTag ? () => props.onOpenTag?.(tag.id) : undefined} aria-label={`查看标签 ${tag.name}`} />)
            : <p className={styles.emptyInline}>暂无标签</p>}
        </div>
      </InspectorSection>
      <InspectorSection icon={<LinkIcon size={18} />} title="关联笔记" count={props.relations.related.length}>
        <NoteLinks notes={props.relations.related} onOpenNote={props.onOpenNote} empty="暂无关联笔记" />
      </InspectorSection>
      <InspectorSection icon={<PaperclipIcon size={18} />} title="附件" count={props.attachments.length}>
        {props.extendedWritesEnabled === false ? <p className={styles.emptyInline}>离线附件当前仅支持阅读已导入的文件。</p> : null}
        <EditorAttachmentPanel
          attachments={props.attachments}
          markdown={props.markdown}
          canWrite={props.canWrite && props.extendedWritesEnabled !== false}
          canInsert={props.canInsertAttachment}
          loading={props.attachmentsLoading}
          onUpload={props.onUploadAttachment}
          onInsert={props.onInsertAttachment}
          onRename={props.onRenameAttachment}
          onDelete={props.onDeleteAttachment}
        />
      </InspectorSection>
    </>
  );
}

function VersionPanel({ noteId, onListVersions, onGetVersion }: {
  noteId: string;
  onListVersions(noteId: string): Promise<NoteVersion[]>;
  onGetVersion(noteId: string, versionId: string): Promise<NoteVersion>;
}) {
  const [versions, setVersions] = useState<NoteVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<NoteVersion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setVersions([]);
    setSelectedVersion(null);
    setLoading(true);
    setError('');
    void onListVersions(noteId)
      .then(async (items) => {
        if (!active) return;
        setVersions(items);
        if (!items[0]) return;
        const detail = await onGetVersion(noteId, items[0].id);
        if (active) setSelectedVersion(detail);
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : '历史版本加载失败，请重试');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [noteId, onGetVersion, onListVersions]);

  async function selectVersion(version: NoteVersion) {
    setLoading(true);
    setError('');
    try {
      setSelectedVersion(await onGetVersion(noteId, version.id));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '版本正文加载失败，请重试');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className={`${styles.simplePanel} ${styles.versionPanel}`} aria-label="历史版本">
      <div className={styles.versionSummary}>
        <strong>{versions.length} 个版本</strong>
        <span>自动保存产生，只读查看</span>
      </div>
      {loading && versions.length === 0 ? <p className={styles.emptyPanel} role="status">正在加载历史版本…</p> : null}
      {error ? <p className={styles.versionError} role="alert">{error}</p> : null}
      {!loading && !error && versions.length === 0 ? <p className={styles.emptyPanel}>暂无历史版本。</p> : null}
      {versions.length > 0 ? (
        <div className={styles.versionList} aria-label="版本列表">
          {versions.map((version, index) => (
            <button
              key={version.id}
              type="button"
              aria-pressed={selectedVersion?.id === version.id}
              onClick={() => void selectVersion(version)}
            >
              <span>{index === 0 ? '最新版本' : `历史版本 ${versions.length - index}`}</span>
              <time dateTime={version.createdAt}>{formatInspectorDate(version.createdAt)}</time>
            </button>
          ))}
        </div>
      ) : null}
      {selectedVersion ? (
        <article className={styles.versionPreview} aria-label="版本正文预览">
          <header>
            <strong>正文快照</strong>
            <span>{selectedVersion.content.length.toLocaleString('zh-CN')} 字符</span>
          </header>
          <pre>{selectedVersion.content || '（空白版本）'}</pre>
        </article>
      ) : null}
    </section>
  );
}

function OutlinePanel({ outline, onNavigate }: {
  outline: InspectorHeading[];
  onNavigate(heading: InspectorHeading, index: number): void;
}) {
  return (
    <section className={`${styles.simplePanel} ${styles.outlinePanel}`} aria-label="文档大纲">
      {outline.length > 0 ? <nav className={styles.outline} aria-label="文档大纲">
        {outline.map((heading, index) => (
          <button
            key={heading.id}
            type="button"
            data-level={heading.level}
            aria-label={`跳转到「${heading.text}」，H${heading.level}`}
            onClick={() => onNavigate(heading, index)}
          >
            <span className={styles.outlineLevel} aria-hidden="true">H{heading.level}</span>
            <span className={styles.outlineText}>{heading.text}</span>
          </button>
        ))}
      </nav> : <p className={styles.emptyPanel}>添加一至四级标题后，大纲会自动生成。</p>}
    </section>
  );
}

function LinksPanel({ relations, loading, onOpenNote }: {
  relations: InspectorRelations;
  loading: boolean;
  onOpenNote(noteId: string): void;
}) {
  return (
    <div className={styles.linksPanel}>
      {loading ? <p className={styles.panelStatus} role="status">正在同步服务端链接…</p> : null}
      <InspectorSection icon={<LinkIcon size={18} />} title="引用这篇笔记" count={relations.backlinks.length}>
        <NoteLinks notes={relations.backlinks} onOpenNote={onOpenNote} empty="暂无反向链接" />
      </InspectorSection>
      <InspectorSection icon={<NoteIcon size={18} />} title="本页链接" count={relations.outgoing.length}>
        <NoteLinks notes={relations.outgoing} onOpenNote={onOpenNote} empty="暂无内部链接" />
      </InspectorSection>
    </div>
  );
}

function AnnotationPanel(props: EditorInspectorProps & { analysisOnly?: boolean }) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [scopeFilter, setScopeFilter] = useState('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sectionFilter, setSectionFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [detail, setDetail] = useState<{ annotation: Annotation; preview: AnnotationPreview; links: AnnotationKnowledgeLinks } | null>(null);
  const [analysis, setAnalysis] = useState<{ input: AnalysisScopeInput; preview: AnalysisScopePreview } | null>(null);
  const [kind, setKind] = useState<'important' | 'question' | 'supplement' | 'pitfall' | 'temporary'>('important');
  const [importance, setImportance] = useState('unset');
  const [comment, setComment] = useState('');

  useEffect(() => {
    const available = new Set(props.annotations.filter((item) => item.lifecycleStatus !== 'archived' && item.status !== 'archived' && !item.deletedAt).map((item) => item.id));
    setSelectedIds((ids) => ids.filter((id) => available.has(id)));
  }, [props.annotations]);

  const sections = [...new Set(props.annotations.map((item) => item.headingPath.at(-1) || '未分章节'))];
  const visible = props.annotations.filter((annotation) => {
    const archived = annotation.lifecycleStatus === 'archived' || annotation.status === 'archived' || Boolean(annotation.deletedAt);
    const status = archived ? 'archived' : (annotation.anchorStatus ? annotation.anchorStatus !== 'resolved' : annotation.status === 'stale') ? 'needsReview' : 'active';
    return (scopeFilter === 'all' || (annotation.scopeType ?? 'selection') === scopeFilter)
      && (sectionFilter === 'all' || (annotation.headingPath.at(-1) || '未分章节') === sectionFilter)
      && (statusFilter === 'all' || status === statusFilter);
  });

  async function run(id: string, action: () => Promise<void>) {
    setPendingId(id);
    setError('');
    try {
      await action();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : '标注操作失败，请重试');
    } finally {
      setPendingId(null);
    }
  }

  async function openDetail(annotation: Annotation) {
    if (!props.onPreviewAnnotation || !props.onGetAnnotationKnowledgeLinks) return;
    const previewAnnotation = props.onPreviewAnnotation;
    const getKnowledgeLinks = props.onGetAnnotationKnowledgeLinks;
    await run(annotation.id, async () => {
      const [preview, links] = await Promise.all([
        previewAnnotation(annotation.id),
        getKnowledgeLinks(annotation.id)
      ]);
      setKind(annotation.kind as 'important' | 'question' | 'supplement' | 'pitfall' | 'temporary');
      setImportance(annotation.importance ?? 'unset');
      setComment(annotation.comment ?? '');
      setDetail({ annotation, preview, links });
    });
  }

  async function saveMetadata() {
    if (!detail || !props.onUpdateAnnotation) return;
    const updateAnnotation = props.onUpdateAnnotation;
    await run(detail.annotation.id, async () => {
      await updateAnnotation(detail.annotation.id, {
        expectedRevision: detail.annotation.revision ?? 1,
        kind,
        importance: importance === 'unset' ? null : importance as Annotation['importance'],
        comment
      });
      setDetail(null);
    });
  }

  async function previewAnalysis(mode: 'marked' | 'all') {
    if (!props.onPreviewAnalysisScope) return;
    const annotationIds = selectedIds.length > 0
      ? selectedIds
      : visible.filter((item) => item.lifecycleStatus !== 'archived' && item.status !== 'archived').map((item) => item.id);
    const input: AnalysisScopeInput = { spaceId: props.note.spaceId ?? '', mode, noteIds: [props.note.id], ...(mode === 'marked' ? { annotationIds } : {}) };
    setCreating(true);
    setError('');
    try {
      setAnalysis({ input, preview: await props.onPreviewAnalysisScope(input) });
    } catch (analysisError) {
      setError(analysisError instanceof Error ? analysisError.message : '分析范围预览失败');
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className={`${styles.simplePanel} ${styles.annotationPanel}`} aria-label="正文标注">
      {props.analysisOnly ? <div className={styles.aiPanel}>
        <span className={styles.aiIcon}><SparkIcon size={26} /></span>
        <h3>整篇分析</h3>
        <p>预览当前笔记的分析范围。</p>
        <Button variant="primary" isPending={creating} isDisabled={!props.canWrite || !props.onPreviewAnalysisScope} onPress={() => void previewAnalysis('all')}>分析整篇</Button>
      </div> : <>
      <header className={styles.annotationHeader}>
        <div className={styles.annotationTitle}><StarIcon size={15} fill="currentColor" /><strong>重点标记</strong><span>{props.annotations.length}</span></div>
        <PopoverTrigger isOpen={filtersOpen} onOpenChange={setFiltersOpen}>
          <GhostIconButton size={24} aria-label="筛选重点" title="筛选重点" className={sectionFilter !== 'all' || statusFilter !== 'all' ? styles.annotationFilterActive : undefined}><FilterIcon size={15} /></GhostIconButton>
          <Popover placement="bottom end" offset={8} className={styles.annotationFilterPopover}>
            <PopoverDialog aria-label="筛选重点" className={styles.annotationFilters}>
              <header><strong>筛选重点</strong><GhostIconButton size={24} aria-label="关闭筛选" onPress={() => setFiltersOpen(false)}><CloseIcon size={14} /></GhostIconButton></header>
              <Select label="章节" options={[{ id: 'all', label: '全部章节' }, ...sections.map((section) => ({ id: section, label: section }))]} selectedKey={sectionFilter} onSelectionChange={(key) => setSectionFilter(String(key))} />
              <fieldset><legend>状态</legend><div className={styles.annotationStatusOptions}>{STATUS_FILTERS.map((option) => <button key={option.id} type="button" aria-pressed={statusFilter === option.id} onClick={() => setStatusFilter(option.id)}>{option.label}</button>)}</div></fieldset>
              <footer><button type="button" onClick={() => { setSectionFilter('all'); setStatusFilter('all'); }}>重置筛选</button><Button variant="primary" onPress={() => setFiltersOpen(false)}>完成</Button></footer>
            </PopoverDialog>
          </Popover>
        </PopoverTrigger>
      </header>
      <div className={styles.annotationScopeFilters} role="group" aria-label="重点范围">
        {[['all', '全部'], ['selection', '选区'], ['blocks', '块'], ['section', '章节']].map(([id, label]) => <button key={id} type="button" aria-pressed={scopeFilter === id} onClick={() => setScopeFilter(id)}>{label} <span>{props.annotations.filter((item) => id === 'all' || (item.scopeType ?? 'selection') === id).length}</span></button>)}
      </div>
      {sectionFilter !== 'all' || statusFilter !== 'all' ? <div className={styles.annotationFilterSummary}>已筛选 {[sectionFilter, statusFilter].filter((value) => value !== 'all').length} 项 <button type="button" onClick={() => { setSectionFilter('all'); setStatusFilter('all'); }}>清除</button></div> : null}
      <div className={styles.annotationList}>
        {props.annotationsLoading ? <p className={styles.emptyPanel} role="status">正在加载正文标注…</p> : visible.length === 0 ? <p className={styles.emptyPanel}>{props.annotations.length ? '没有符合筛选条件的重点。' : '暂无重点，选中正文或打开块菜单即可标记。'}</p> : null}
        {visible.map((annotation, index) => {
          const archived = annotation.lifecycleStatus === 'archived' || annotation.status === 'archived' || Boolean(annotation.deletedAt);
          const stale = annotation.anchorStatus ? annotation.anchorStatus !== 'resolved' : annotation.status === 'stale';
          const pending = pendingId === annotation.id;
          return <article key={annotation.id} data-focused={props.focusedAnnotationId === annotation.id || undefined} data-stale={!archived && stale || undefined} data-archived={archived || undefined} data-selected={selectedIds.includes(annotation.id) || undefined}>
            <input aria-label={`选择重点 ${index + 1}`} type="checkbox" disabled={archived} checked={selectedIds.includes(annotation.id)} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...current, annotation.id] : current.filter((id) => id !== annotation.id))} />
            <button type="button" className={styles.annotationTarget} aria-label={`定位重点 ${index + 1}：${annotation.quoteText}`} disabled={pending || archived} onClick={() => props.onSelectAnnotation(annotation.id)}>
              <span className={styles.annotationItemHeading}><span>{scopeLabel(annotation.scopeType)}</span>{archived || stale ? <strong>{archived ? '已取消' : '待检查'}</strong> : null}</span>
              <span className={styles.annotationQuote}>{annotation.quoteText}</span>
              {annotation.headingPath.length > 0 ? <small title={annotation.headingPath.join(' / ')}>{annotation.headingPath.join(' / ')}</small> : null}
            </button>
            <MenuTrigger><GhostIconButton size={24} aria-label={`重点 ${index + 1} 更多操作`}><MoreHorizontalIcon size={15} /></GhostIconButton>
              <MenuPopover placement="bottom end"><Menu ariaLabel="重点操作">
                <MenuItem id="detail" isDisabled={pending || !props.onPreviewAnnotation || !props.onGetAnnotationKnowledgeLinks} onAction={() => void openDetail(annotation)}>预览与编辑</MenuItem>
                {!archived ? <MenuItem id="reanchor" isDisabled={pending || !props.canWrite} onAction={() => void run(annotation.id, () => props.onReanchorAnnotation(annotation))}>重新定位</MenuItem> : null}
                {annotation.scopeType === 'section' && !archived ? <MenuItem id="exclude" isDisabled={pending || !props.canWrite || !props.onCreateAnnotationExclusion} onAction={() => void run(annotation.id, () => props.onCreateAnnotationExclusion!(annotation))}>排除当前块</MenuItem> : null}
                <MenuItem id="archive" isDanger={!archived} isDisabled={pending || !props.canWrite} onAction={() => void run(annotation.id, async () => { await (archived ? props.onRestoreAnnotation(annotation.id, annotation.revision) : props.onDeleteAnnotation(annotation.id, annotation.revision)); setSelectedIds((ids) => ids.filter((id) => id !== annotation.id)); })}>{archived ? '恢复' : '取消重点'}</MenuItem>
              </Menu></MenuPopover>
            </MenuTrigger>
          </article>;
        })}
      </div>
      {selectedIds.length > 0 ? <div className={styles.annotationAnalysisActions}>
        <span>已选择 {selectedIds.length} 项</span>
        <Button variant="primary" isPending={creating} isDisabled={!props.canWrite || !props.onPreviewAnalysisScope} onPress={() => void previewAnalysis('marked')}>提炼知识</Button>
      </div> : null}
      </>}
      {error ? <p className={styles.versionError} role="alert">{error}</p> : null}
      {detail ? <Dialog title="重点详情" description={`${scopeLabel(detail.annotation.scopeType)} · ${detail.preview.resolution.status === 'resolved' ? '当前范围可定位' : '范围需要检查'}`} isOpen onOpenChange={(open) => { if (!open) setDetail(null); }} isPending={pendingId === detail.annotation.id}>
        <DialogBody><div className={styles.annotationDetailFields}>
          <Select label="类型" options={KIND_OPTIONS} selectedKey={kind} onSelectionChange={(key) => setKind(String(key) as typeof kind)} />
          <Select label="重要程度" options={IMPORTANCE_OPTIONS} selectedKey={importance} onSelectionChange={(key) => setImportance(String(key))} />
          <label><span>备注</span><textarea maxLength={2000} value={comment} onChange={(event) => setComment(event.target.value)} /></label>
          <pre>{detail.preview.resolution.quoteText ?? detail.annotation.quoteText}</pre>
          <p>关联候选 {detail.links.candidates.length} · 已确认知识 {detail.links.confirmed.length} · 局部排除 {detail.preview.exclusions.filter((item) => item.status === 'active').length}</p>
          {detail.preview.exclusions.filter((item) => item.status === 'active').map((exclusion) => <button key={exclusion.id} type="button" disabled={!props.onDeleteAnnotationExclusion} onClick={() => void props.onDeleteAnnotationExclusion?.(detail.annotation.id, exclusion.id, detail.annotation.revision ?? 1).then(() => setDetail(null)).catch((reason) => setError(reason instanceof Error ? reason.message : '恢复范围失败'))}>恢复排除范围：{exclusion.anchor.quoteText.slice(0, 32)}</button>)}
        </div></DialogBody>
        <DialogFooter><DialogClose variant="ghost">关闭</DialogClose><Button variant="primary" onPress={() => void saveMetadata()}>保存信息</Button></DialogFooter>
      </Dialog> : null}
      {analysis ? <Dialog title="确认分析范围" description={analysis.preview.ai.message} isOpen onOpenChange={(open) => { if (!open) setAnalysis(null); }}>
        <DialogBody><div className={styles.annotationScopePreview}><strong>{analysis.preview.summary.noteCount} 篇笔记 · {analysis.preview.summary.segmentCount} 个去重片段</strong>{analysis.preview.segments.map((segment, index) => <pre key={`${segment.noteId}-${segment.start}`}>{index + 1}. {segment.markdown}</pre>)}{analysis.preview.omittedItems.length > 0 ? <p>{analysis.preview.omittedItems.length} 项未纳入，请在开始前检查。</p> : null}<p role="status">{analysis.preview.ai.available ? '提炼服务可用' : '提炼服务暂不可用；仍可保存不可变范围快照。'}</p></div></DialogBody>
        <DialogFooter><DialogClose variant="ghost">取消</DialogClose><Button variant="primary" isDisabled={!props.onCreateAnalysisScope} onPress={() => void props.onCreateAnalysisScope?.({ ...analysis.input, previewHash: analysis.preview.previewHash, idempotencyKey: crypto.randomUUID() }).then(() => setAnalysis(null)).catch((reason) => setError(reason instanceof Error ? reason.message : '范围快照保存失败'))}>保存范围快照</Button></DialogFooter>
      </Dialog> : null}
    </section>
  );
}

const KIND_OPTIONS = [{ id: 'important', label: '重点' }, { id: 'question', label: '疑问' }, { id: 'supplement', label: '补充' }, { id: 'pitfall', label: '易错' }, { id: 'temporary', label: '临时笔记' }];
const IMPORTANCE_OPTIONS = [{ id: 'unset', label: '未设置' }, { id: 'normal', label: '普通' }, { id: 'important', label: '重要' }, { id: 'core', label: '核心' }];
const STATUS_FILTERS = [{ id: 'active', label: '当前有效' }, { id: 'needsReview', label: '内容待检查' }, { id: 'archived', label: '已取消' }, { id: 'all', label: '全部状态' }];
function scopeLabel(scope?: Annotation['scopeType']) { return scope === 'blocks' ? '内容块' : scope === 'section' ? '标题章节' : '文字选区'; }

function InspectorSection({ icon, title, count, action, children }: {
  icon: ReactNode;
  title: string;
  count?: number;
  action?: ReactNode;
  children: ReactNode;
}) {
  return <section className={styles.section}>
    <h3>{icon}<span>{title}</span>{count !== undefined ? <small>{count}</small> : null}{action}</h3>
    {children}
  </section>;
}

function Metadata({ label, value }: { label: string; value: ReactNode }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function NoteLinks({ notes, onOpenNote, empty }: {
  notes: Note[];
  onOpenNote(noteId: string): void;
  empty: string;
}) {
  if (notes.length === 0) return <p className={styles.emptyInline}>{empty}</p>;
  return <div className={styles.noteLinks}>{notes.map((note) => (
    <a
      key={note.id}
      href={`#/materials/notes/${encodeURIComponent(note.id)}`}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        onOpenNote(note.id);
      }}
    >
      <NoteIcon size={16} /><span>{note.title || '无标题笔记'}</span>
    </a>
  ))}</div>;
}
