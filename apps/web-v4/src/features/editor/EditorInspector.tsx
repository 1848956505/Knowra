import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import type { AnalysisScopeInput, AnalysisScopePreview, AnalysisScopeSnapshot, Annotation, AnnotationKnowledgeLinks, AnnotationPreview, Attachment, Folder, Note, NoteVersion, NoteVersionPage, NoteVersionPageOptions, NoteVersionPrunePreview, Tag, TagColor, TagGroup, UpdateAnnotationInput } from '@study-accelerator/web-core';
import { Button, Checkbox, Dialog, DialogBody, DialogClose, DialogFooter, Select, TextAreaField } from '../../components/ui';
import { Menu, MenuItem, MenuPopover, MenuTrigger, PointMenu, Popover, PopoverTrigger, PopoverDialog } from '../../components/ui/overlay';
import { GhostIconButton, SegmentedControl, SegmentedButton } from '../../components/ui/button';
import { Tabs, type TabsItem } from '../../components/ui/collection';
import {
  StarIcon,
  FilterIcon,
  SortArrowsIcon,
  MoreHorizontalIcon,
  CloseIcon,
  LinkIcon,
  ListIcon,
  NoteIcon,
  PaperclipIcon,
  SparkIcon,
  TagIcon
} from '../../components/icons/knowra';
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
import { AnalysisScopeDialog, type AnalysisIntent } from './AnalysisScopeDialog';
import { KnowledgeExtractionTaskPanel } from './KnowledgeExtractionTaskPanel';
import { useKnowledgeExtractionTasks } from './useKnowledgeExtractionTasks';
import { useExtractionEnvironment, ExtractionDemoNotice } from './ExtractionEnvironment';
import { VersionHistoryPanel } from './VersionHistoryPanel';
import type { AttachmentActions } from './EditorAttachmentPanel';
import type { AttachmentDeleteResult } from '@study-accelerator/web-core';
import { EditorAttachmentPanel } from './EditorAttachmentPanel';
import { OrganizeNoteDialog } from './OrganizeNoteDialog';
import { TagChip, TagPickerDialog } from '../tags';
import { buildAnnotationListRows, type AnnotationSort } from './annotationListModel';

const inspectorTabs: TabsItem[] = [
  { id: 'info', label: '信息' },
  { id: 'outline', label: '大纲' },
  { id: 'links', label: '链接' },
  { id: 'annotations', label: '标注' },
  { id: 'versions', label: '记录' },
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
  noteLinkRelations?: import('@study-accelerator/web-core').NoteLinkRelations;
  noteLinkRelationsLoading?: boolean;
  noteLinkRelationsError?: string;
  onOpenLinkedOccurrence?(sourceId: string, locator: import('@study-accelerator/content-anchor').NoteLinkLocator): void;
  onOpenLinkedNote?(id: string): void;
  annotations: Annotation[];
  annotationsLoading: boolean;
  focusedAnnotationId: string | null;
  overlappingAnnotationIds?: string[];
  onClearOverlappingAnnotations?(): void;
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
  onListVersionPage?(noteId: string, options?: NoteVersionPageOptions): Promise<NoteVersionPage>;
  onPreviewVersionPrune?(noteId: string): Promise<NoteVersionPrunePreview>;
  onRestoreVersion?(version: NoteVersion): Promise<void>;
  onSaveVersionAs?(version: NoteVersion): Promise<void>;
  onGetVersion(noteId: string, versionId: string): Promise<NoteVersion>;
  onOrganizeNote(input: { folderId: string | null; status: string }): Promise<void>;
  onUploadAttachment(file: File): Promise<Attachment>;
  onInsertAttachment(attachment: Attachment): Promise<void>;
  onRenameAttachment(attachmentId: string, fileName: string): Promise<Attachment>;
  onDeleteAttachment(attachmentId: string): Promise<AttachmentDeleteResult | void>;
  attachmentActions?: AttachmentActions;
  onCreateAnnotation(scopeType?: 'selection' | 'blocks' | 'section' | 'list'): Promise<void>;
  onSelectAnnotation(annotationId: string): void;
  onDeleteAnnotation(annotationId: string, expectedRevision?: number): Promise<Annotation | undefined>;
  onRestoreAnnotation?(annotationId: string, expectedRevision?: number): Promise<void>;
  onReanchorAnnotation(annotation: Annotation): Promise<void>;
  onUpdateAnnotation?(annotationId: string, input: UpdateAnnotationInput): Promise<void>;
  onConfirmAnnotationRange?(annotationId: string, input: import('@study-accelerator/web-core').ConfirmAnnotationRangeInput): Promise<void>;
  onPreviewAnnotation?(annotationId: string): Promise<AnnotationPreview>;
  onGetAnnotationKnowledgeLinks?(annotationId: string): Promise<AnnotationKnowledgeLinks>;
  onCreateKnowledgeCandidate?(annotation: Annotation): Promise<void>;
  onOpenKnowledgeItem?(itemId: string): void;
  /** 打开 AI 助手并预填“提炼本篇知识点”的请求；助手读取已保存的内容，需用户先授权读取本篇。 */
  onExtractWithAssistant?(): void | Promise<void>;
  knowledgeWriteDisabledReason?: string;
  onPreviewAnalysisScope?(input: AnalysisScopeInput): Promise<AnalysisScopePreview>;
  onCreateAnalysisScope?(input: AnalysisScopeInput & { previewHash: string; idempotencyKey: string }): Promise<{ id: string }>;
  onListAnalysisScopes?(spaceId: string): Promise<AnalysisScopeSnapshot[]>;
  onTrashAnalysisScope?(id: string, input: { spaceId: string; expectedUpdatedAt: string }): Promise<AnalysisScopeSnapshot>;
  onRestoreAnalysisScope?(id: string, input: { spaceId: string; expectedUpdatedAt: string }): Promise<AnalysisScopeSnapshot>;
  onCreateAnnotationExclusion?(annotation: Annotation): Promise<void>;
  onDeleteAnnotationExclusion?(annotationId: string, exclusionId: string, expectedRevision: number): Promise<void>;
}

export function EditorInspector(props: EditorInspectorProps) {
  const [selectedTab, setSelectedTab] = useState('info');
  const [compact, setCompact] = useState(() => window.matchMedia?.('(max-width: 1100px), (any-pointer: coarse)').matches ?? false);
  useEffect(() => {
    const query = window.matchMedia?.('(max-width: 1100px), (any-pointer: coarse)');
    if (!query) return;
    const update = () => setCompact(query.matches);
    update(); query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
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

  useEffect(() => {
    if (props.overlappingAnnotationIds?.length) setSelectedTab('annotations');
  }, [props.overlappingAnnotationIds]);

  const inspector = (
    <aside
      className={styles.inspector}
      data-open={props.open || undefined}
      aria-label="文档检查器"
      aria-hidden={!props.open}
    >
      <header className={styles.header}>
        <h2>文档检查器</h2>
        <GhostIconButton autoFocus={compact} aria-label="关闭文档检查器" onPress={props.onClose}>
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
              <LinksPanel relations={relations} loading={props.linkedNotesLoading} onOpenNote={props.onOpenNote}
                noteLinks={props.noteLinkRelations} linksLoading={props.noteLinkRelationsLoading} error={props.noteLinkRelationsError}
                onOpenOccurrence={props.onOpenLinkedOccurrence} onOpenLinkedNote={props.onOpenLinkedNote} />
            ) : null}
            {item.id === 'annotations' ? (
              <AnnotationPanel key={props.note.id} {...props} canWrite={props.canWrite && props.extendedWritesEnabled !== false} />
            ) : null}
            {item.id === 'versions' ? (
              <VersionHistoryPanel
                key={props.note.id}
                note={props.note}
                markdown={props.markdown}
                canWrite={props.canWrite}
                onListVersionPage={props.onListVersionPage}
                onPreviewVersionPrune={props.onPreviewVersionPrune}
                onRestoreVersion={props.onRestoreVersion}
                onSaveVersionAs={props.onSaveVersionAs}
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
  return compact ? (
    <Dialog title="文档检查器" presentation="panel" className={styles.inspectorDialog}
      isOpen={props.open} onOpenChange={(open) => { if (!open) props.onClose(); }}>
      {inspector}
    </Dialog>
  ) : inspector;
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
        action={<Button size="mini" isDisabled={!props.canWrite} onPress={props.onOrganize}>整理</Button>}
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
        action={<Button size="mini" isDisabled={!props.canWrite} onPress={props.onEditTags}>编辑</Button>}
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
          key={props.note.id}
          actions={props.attachmentActions}
          onOpenNote={props.onOpenNote}
          onOpenKnowledgeItem={props.onOpenKnowledgeItem}
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

function LinksPanel({ relations, loading, onOpenNote, noteLinks, linksLoading, error, onOpenOccurrence, onOpenLinkedNote }: {
  relations: InspectorRelations;
  loading: boolean;
  onOpenNote(noteId: string): void;
  noteLinks?: import('@study-accelerator/web-core').NoteLinkRelations;
  linksLoading?: boolean; error?: string;
  onOpenOccurrence?(sourceId: string, locator: import('@study-accelerator/content-anchor').NoteLinkLocator): void;
  onOpenLinkedNote?(id: string): void;
}) {
  if (noteLinks || error || linksLoading) return <div className={styles.linksPanel}>
    {linksLoading ? <p role="status">正在更新笔记引用…</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    <InspectorSection icon={<LinkIcon size={18} />} title="引用这篇笔记" count={noteLinks?.backlinks.length ?? 0}>
      {noteLinks?.backlinks.length ? noteLinks.backlinks.map(source => <div key={source.id} className={styles.noteLinkGroup}>
        <strong>{source.title}</strong>
        {!source.occurrences.length ? <Button variant="ghost" onPress={() => onOpenNote(source.id)}>旧链接，打开来源笔记</Button> : null}
        {source.occurrences.map(item => <Button key={`${item.occurrenceId}:${item.sourceStart}`} variant="ghost"
          onPress={() => onOpenOccurrence?.(source.id, { occurrenceId: item.occurrenceId, targetNoteId: item.targetNoteId })}>{item.context || item.label}</Button>)}
      </div>) : <p className={styles.emptyPanel}>暂无反向链接</p>}
    </InspectorSection>
    <InspectorSection icon={<NoteIcon size={18} />} title="本页链接" count={noteLinks?.outgoing.length ?? 0}>
      {noteLinks?.outgoing.length ? noteLinks.outgoing.map(target => <div key={target.id} className={styles.noteLinkGroup}>
        <Button variant="ghost" isDisabled={target.status === 'deleted'} onPress={() => (onOpenLinkedNote ?? onOpenNote)(target.id)}>
          {target.title}{target.status === 'deleted' && target.title !== '目标已删除' ? '（目标已删除）' : ''}
        </Button>
      </div>) : <p className={styles.emptyPanel}>暂无内部链接</p>}
    </InspectorSection>
  </div>;
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
  const listRef = useRef<HTMLDivElement>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [undo, setUndo] = useState<{ id: string; revision?: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [savedScopes, setSavedScopes] = useState<AnalysisScopeSnapshot[]>([]);
  const [scopeRefresh, setScopeRefresh] = useState(0);
  const [scopeFilter, setScopeFilter] = useState('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [sectionFilter, setSectionFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [kindFilter, setKindFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState<AnnotationSort>('document');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [detail, setDetail] = useState<{ annotation: Annotation; preview: AnnotationPreview; links: AnnotationKnowledgeLinks } | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisIntent | null>(null);
  const environment = useExtractionEnvironment();
  const task = useKnowledgeExtractionTasks(props.note.spaceId ?? '', props.note.id, props.canWrite);
  const analysisScope = useMemo(() => ({}), [props.note.id, props.note.spaceId, environment.scopeKey]);
  const currentAnalysisScope = useRef(analysisScope); currentAnalysisScope.current = analysisScope;
  useEffect(() => { setAnalysis(null); setError(''); setCreating(false); }, [analysisScope]);
  const [kind, setKind] = useState<'important' | 'question' | 'supplement' | 'pitfall' | 'temporary'>('important');
  const [importance, setImportance] = useState('normal');
  const [importanceChanged, setImportanceChanged] = useState(false);
  const [comment, setComment] = useState('');
  const currentAnnotations = useMemo(
    () => props.annotations.filter((item) => item.lifecycleStatus === 'active' || (!item.lifecycleStatus && item.status !== 'archived' && !item.deletedAt)),
    [props.annotations]
  );

  useEffect(() => {
    setSavedScopes([]);
    if (!props.analysisOnly || !props.onListAnalysisScopes || !props.note.spaceId) return;
    let active = true;
    void props.onListAnalysisScopes(props.note.spaceId).then(rows => { if (active) setSavedScopes(rows); })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : '已保存范围加载失败'); });
    return () => { active = false; };
  }, [props.analysisOnly, props.note.spaceId, props.onListAnalysisScopes, scopeRefresh, environment.scopeKey]);

  useEffect(() => {
    const available = new Set(currentAnnotations.map((item) => item.id));
    setSelectedIds((ids) => ids.filter((id) => available.has(id)));
  }, [currentAnnotations]);

  const sections = [...new Set(currentAnnotations.map((item) => item.headingPath.at(-1) || '未分章节'))];
  const visible = currentAnnotations.filter((annotation) => {
    const status = (annotation.anchorStatus ? annotation.anchorStatus !== 'resolved' : annotation.status === 'stale') ? 'needsReview' : 'active';
    return (scopeFilter === 'all' || (annotation.scopeType ?? 'selection') === scopeFilter)
      && (sectionFilter === 'all' || (annotation.headingPath.at(-1) || '未分章节') === sectionFilter)
      && (statusFilter === 'all' || status === statusFilter)
      && (kindFilter === 'all' || annotation.kind === kindFilter);
  });
  const rows = buildAnnotationListRows(visible, sortOrder);

  useEffect(() => {
    if (!props.overlappingAnnotationIds?.length) return;
    setScopeFilter('all');
    setSectionFilter('all');
    setStatusFilter('all');
    setKindFilter('all');
  }, [props.overlappingAnnotationIds]);

  useEffect(() => {
    if (!props.overlappingAnnotationIds?.length) return;
    const target = [...(listRef.current?.querySelectorAll<HTMLElement>('[data-annotation-card-id]') ?? [])]
      .find((element) => props.overlappingAnnotationIds?.includes(element.dataset.annotationCardId ?? ''));
    target?.scrollIntoView?.({ block: 'nearest' });
  }, [props.overlappingAnnotationIds, scopeFilter, sectionFilter, statusFilter, kindFilter, sortOrder]);

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
      setImportance(annotation.importance ?? 'normal');
      setImportanceChanged(false);
      setComment(annotation.comment ?? '');
      setDetail({ annotation: preview.annotation, preview, links });
    });
  }

  async function saveMetadata() {
    if (!detail || !props.onUpdateAnnotation) return;
    const updateAnnotation = props.onUpdateAnnotation;
    await run(detail.annotation.id, async () => {
      await updateAnnotation(detail.annotation.id, {
        expectedRevision: detail.annotation.revision ?? 1,
        kind,
        ...(importanceChanged ? { importance: importance as Annotation['importance'] } : {}),
        comment
      });
      setDetail(null);
    });
  }

  async function previewAnalysis(mode: 'marked' | 'all') {
    if (!props.onPreviewAnalysisScope) return;
    const annotationIds = selectedIds.length > 0
      ? selectedIds
      : visible.map((item) => item.id);
    const input: AnalysisScopeInput = { spaceId: props.note.spaceId ?? '', mode, noteIds: [props.note.id], ...(mode === 'marked' ? { annotationIds } : {}) };
    setCreating(true);
    setError('');
    try {
      const preview = await props.onPreviewAnalysisScope(input);
      if (currentAnalysisScope.current === analysisScope) setAnalysis({ input, preview, scopeKey: crypto.randomUUID(), taskKey: crypto.randomUUID() });
    } catch (analysisError) {
      if (currentAnalysisScope.current === analysisScope) setError(analysisError instanceof Error ? analysisError.message : '分析范围预览失败');
    } finally {
      if (currentAnalysisScope.current === analysisScope) setCreating(false);
    }
  }

  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState('');
  // 进入助手前由编辑器保存并核验草稿：失败或保存期间内容变化时留在这里显示原因，允许重试；进行中不重复触发。
  async function startExtraction() {
    if (extracting || !props.onExtractWithAssistant) return;
    setExtracting(true); setExtractError('');
    try { await props.onExtractWithAssistant(); }
    catch (failure) { setExtractError(failure instanceof Error ? failure.message : '无法打开 AI 助手，请重试。'); }
    finally { setExtracting(false); }
  }

  const contextAnnotation = currentAnnotations.find(item => item.id === contextMenu?.id);
  function annotationActions(annotation: Annotation) {
    const pending = pendingId === annotation.id;
    const stale = annotation.anchorStatus ? annotation.anchorStatus !== 'resolved' : annotation.status === 'stale';
    return <Menu ariaLabel="重点操作" onAction={() => setContextMenu(null)}>
      <MenuItem id="detail" isDisabled={pending || !props.onPreviewAnnotation || !props.onGetAnnotationKnowledgeLinks} onAction={() => void openDetail(annotation)}>预览与编辑</MenuItem>
      <MenuItem id="knowledge" isDisabled={pending || stale || !annotation.quoteText.trim() || !props.canWrite || !props.onCreateKnowledgeCandidate} onAction={() => void run(annotation.id, () => props.onCreateKnowledgeCandidate!(annotation))}>创建知识候选</MenuItem>
      <MenuItem id="reanchor" isDisabled={pending || !props.canWrite} onAction={() => void run(annotation.id, () => props.onReanchorAnnotation(annotation))}>重新选择来源</MenuItem>
      {['section', 'list'].includes(annotation.scopeType ?? '') ? <MenuItem id="exclude" isDisabled={pending || !props.canWrite || !props.onCreateAnnotationExclusion} onAction={() => void run(annotation.id, () => props.onCreateAnnotationExclusion!(annotation))}>排除当前块</MenuItem> : null}
      <MenuItem id="archive" isDanger isDisabled={pending || !props.canWrite} onAction={() => void run(annotation.id, async () => {
        const deleted = await props.onDeleteAnnotation(annotation.id, annotation.revision);
        setSelectedIds(ids => ids.filter(id => id !== annotation.id));
        setUndo({ id: annotation.id, revision: deleted?.revision ?? (annotation.revision ?? 1) + 1 });
        window.setTimeout(() => setUndo(current => current?.id === annotation.id ? null : current), 10000);
      })}>取消重点</MenuItem>
    </Menu>;
  }

  return (
    <section className={`${styles.simplePanel} ${styles.annotationPanel}`} aria-label="正文标注">
      {props.analysisOnly ? <div className={styles.aiPanel}>
        {props.onExtractWithAssistant ? <div className={styles.assistantEntry}>
          <h3>让 AI 助手提炼知识点</h3>
          <p>助手会读取本篇笔记和你标记的重点，提议知识候选。需要先授权读取本篇；候选只是提议，须在知识库逐条审核后才会入库。</p>
          <Button variant="primary" isPending={extracting} isDisabled={!props.canWrite || Boolean(props.knowledgeWriteDisabledReason)} onPress={() => void startExtraction()}>让 AI 提炼知识点</Button>
          {props.knowledgeWriteDisabledReason ? <p>{props.knowledgeWriteDisabledReason}</p> : !props.canWrite ? <p>当前笔记不可写，无法提炼知识点。</p> : null}
          {extractError ? <p role="alert">{extractError}</p> : null}
        </div> : null}
        <span className={styles.aiIcon}><SparkIcon size={26} /></span>
        <h3>整篇分析</h3>
        <ExtractionDemoNotice />
        <p>预览当前笔记的分析范围。</p>
        {!environment.capability.canStart ? <p>知识提炼暂不可用；仍可保存分析范围和手动整理知识。</p> : null}
        {environment.api ? <Button variant="ghost" isDisabled={environment.checking} onPress={environment.recheck}>重新检查提炼能力</Button> : null}
        <Button variant="primary" isPending={creating} isDisabled={!props.canWrite || !props.onPreviewAnalysisScope} onPress={() => void previewAnalysis('all')}>分析整篇</Button>
        <Button variant="ghost" onPress={() => task.setOpen(true)}>查看提炼任务</Button>
      </div> : <>
      <header className={styles.annotationHeader}>
        <div className={styles.annotationTitle}><StarIcon size={15} fill="currentColor" /><strong>重点标记</strong><span>{currentAnnotations.length}</span></div>
        <div className={styles.annotationHeaderActions}>
        <PopoverTrigger isOpen={sortOpen} onOpenChange={setSortOpen}>
          <GhostIconButton size={24} aria-label="排序重点" title="排序重点" className={sortOrder !== 'document' ? styles.annotationFilterActive : undefined}><SortArrowsIcon size={15} /></GhostIconButton>
          <Popover placement="bottom end" offset={8} className={styles.annotationSortPopover}>
            <PopoverDialog aria-label="排序重点" className={styles.annotationSortOptions}>
              <strong>排序重点</strong>
              <button type="button" aria-pressed={sortOrder === 'document'} onClick={() => { setSortOrder('document'); setSortOpen(false); }}>正文顺序</button>
              <button type="button" aria-pressed={sortOrder === 'importance'} onClick={() => { setSortOrder('importance'); setSortOpen(false); }}>重要级：高到低</button>
            </PopoverDialog>
          </Popover>
        </PopoverTrigger>
        <PopoverTrigger isOpen={filtersOpen} onOpenChange={setFiltersOpen}>
          <GhostIconButton size={24} aria-label="筛选重点" title="筛选重点" className={sectionFilter !== 'all' || statusFilter !== 'all' || kindFilter !== 'all' ? styles.annotationFilterActive : undefined}><FilterIcon size={15} /></GhostIconButton>
          <Popover placement="bottom end" offset={8} className={styles.annotationFilterPopover}>
            <PopoverDialog aria-label="筛选重点" className={styles.annotationFilters}>
              <header><strong>筛选重点</strong><GhostIconButton size={24} aria-label="关闭筛选" onPress={() => setFiltersOpen(false)}><CloseIcon size={14} /></GhostIconButton></header>
              <Select label="章节" options={[{ id: 'all', label: '全部章节' }, ...sections.map((section) => ({ id: section, label: section }))]} selectedKey={sectionFilter} onSelectionChange={(key) => setSectionFilter(String(key))} />
              <Select label="类型" options={[{ id: 'all', label: '全部类型' }, ...KIND_OPTIONS]} selectedKey={kindFilter} onSelectionChange={(key) => setKindFilter(String(key))} />
              <fieldset><legend>原文状态</legend><div className={styles.annotationStatusOptions}>{STATUS_FILTERS.map((option) => <button key={option.id} type="button" aria-pressed={statusFilter === option.id} onClick={() => setStatusFilter(option.id)}>{option.label}</button>)}</div></fieldset>
              <footer><button type="button" onClick={() => { setSectionFilter('all'); setStatusFilter('all'); setKindFilter('all'); }}>重置筛选</button><Button variant="primary" onPress={() => setFiltersOpen(false)}>完成</Button></footer>
            </PopoverDialog>
          </Popover>
        </PopoverTrigger>
        </div>
      </header>
      <SegmentedControl variant="underline" className={styles.annotationScopeFilters} aria-label="重点范围">
        {[['all', '全部'], ['selection', '选区'], ['blocks', '块'], ['section', '章节'], ['list', '列表项']].map(([id, label]) => <SegmentedButton key={id} aria-pressed={scopeFilter === id} onPress={() => setScopeFilter(id)} count={currentAnnotations.filter((item) => id === 'all' || (item.scopeType ?? 'selection') === id).length}>{label}</SegmentedButton>)}
      </SegmentedControl>
      {sectionFilter !== 'all' || statusFilter !== 'all' || kindFilter !== 'all' ? <div className={styles.annotationFilterSummary}>已筛选 {[sectionFilter, statusFilter, kindFilter].filter((value) => value !== 'all').length} 项 <button type="button" onClick={() => { setSectionFilter('all'); setStatusFilter('all'); setKindFilter('all'); }}>清除</button></div> : null}
      {props.overlappingAnnotationIds?.length ? <div className={styles.annotationOverlapSummary} role="status">此处有 {props.overlappingAnnotationIds.length} 条重点，已在下方标出。<button type="button" onClick={props.onClearOverlappingAnnotations}>清除定位</button></div> : null}
      {undo && props.onRestoreAnnotation ? <p role="status" className={styles.annotationFilterSummary}>重点已移入回收站。 <button type="button" onClick={() => void run(undo.id, async () => { await props.onRestoreAnnotation?.(undo.id, undo.revision); setUndo(null); })}>撤销</button></p> : null}
      <div className={styles.annotationList} ref={listRef}>
        {props.annotationsLoading ? <p className={styles.emptyPanel} role="status">正在加载正文标注…</p> : visible.length === 0 ? <p className={styles.emptyPanel}>{currentAnnotations.length ? '没有符合筛选条件的重点。' : '暂无重点，选中正文或打开块菜单即可标记。'}</p> : null}
        {rows.map(({ annotation, depth, parentId, containedCount, overlapCount, historicalRelation }, index) => {
          const stale = annotation.anchorStatus ? annotation.anchorStatus !== 'resolved' : annotation.status === 'stale';
          const pending = pendingId === annotation.id;
          return <article key={annotation.id} className={depth ? styles.annotationNested : undefined} style={depth ? { marginLeft: `${Math.min(depth, 3) * 14}px` } : undefined} data-annotation-card-id={annotation.id} onContextMenu={event => { event.preventDefault(); event.stopPropagation(); const rect = event.currentTarget.getBoundingClientRect(); setContextMenu({ id: annotation.id, x: event.clientX || rect.left + 12, y: event.clientY || rect.top + 12 }); }} data-importance={annotation.importance ?? undefined} data-overlap-focused={props.overlappingAnnotationIds?.includes(annotation.id) || undefined} data-focused={props.focusedAnnotationId === annotation.id || undefined} data-stale={stale || undefined} data-selected={selectedIds.includes(annotation.id) || undefined}>
            <Checkbox size="compact" aria-label={`选择重点 ${index + 1}`} isSelected={selectedIds.includes(annotation.id)} onChange={(selected) => setSelectedIds((current) => selected ? [...current, annotation.id] : current.filter((id) => id !== annotation.id))} />
            <button type="button" className={styles.annotationTarget} aria-label={`定位重点 ${index + 1}：${annotation.quoteText}`} disabled={pending} onClick={() => props.onSelectAnnotation(annotation.id)}>
              <span className={styles.annotationItemHeading}><span>{scopeLabel(annotation.scopeType)}</span><span>· {KIND_OPTIONS.find((option) => option.id === annotation.kind)?.label ?? annotation.kind}</span>{annotation.importance ? <span className={styles.annotationImportance}>{IMPORTANCE_OPTIONS.find((option) => option.id === annotation.importance)?.label}</span> : null}{stale ? <strong>{annotation.anchorStatus === 'missing' ? '原文已删除' : '范围待确认'}</strong> : annotation.anchorReason === 'convertedToSelection' ? <strong>已保留原范围，转为选区</strong> : null}</span>
              <span className={styles.annotationQuote}>{annotation.quoteText || '空内容块，后续输入继续纳入'}</span>
              {annotation.headingPath.length > 0 ? <small title={annotation.headingPath.join(' / ')}>{annotation.headingPath.join(' / ')}</small> : null}
              {parentId || containedCount || overlapCount ? <span className={styles.annotationRelation}>{historicalRelation ? '原标记范围：' : null}{parentId ? '位于另一条重点内' : null}{containedCount ? `${parentId ? ' · ' : ''}包含 ${containedCount} 条重点` : null}{overlapCount ? `${parentId || containedCount ? ' · ' : ''}与 ${overlapCount} 条重点重叠` : null}</span> : null}
            </button>
            <MenuTrigger><GhostIconButton size={24} aria-label={`重点 ${index + 1} 更多操作`}><MoreHorizontalIcon size={15} /></GhostIconButton>
              <MenuPopover placement="bottom end">{annotationActions(annotation)}</MenuPopover>
            </MenuTrigger>
          </article>;
        })}
      </div>
      <PointMenu point={contextAnnotation && contextMenu ? contextMenu : null} onOpenChange={open => { if (!open) setContextMenu(null); }}>
        {contextAnnotation ? annotationActions(contextAnnotation) : null}
      </PointMenu>
      {selectedIds.length > 0 ? <div className={styles.annotationAnalysisActions}>
        <span>已选择 {selectedIds.length} 项</span>
        <Button variant="primary" isPending={creating} isDisabled={!props.canWrite || !props.onPreviewAnalysisScope} onPress={() => void previewAnalysis('marked')}>提炼知识</Button>
      </div> : null}
      </>}
      {props.analysisOnly && props.onListAnalysisScopes ? <InspectorSection icon={<SparkIcon size={18} />} title="已保存分析范围" count={savedScopes.filter(item => !item.deletedAt).length}>
        {savedScopes.length === 0 ? <p className={styles.emptyInline}>暂无已保存的分析范围。</p> : <div className={styles.noteLinks}>{savedScopes.map(scope => <div key={scope.id}>
          <strong>{scope.noteVersions?.map(version => version.title || version.noteId).join('、') || '分析范围'}</strong>
          <span> · {scope.summary?.segmentCount ?? 0} 个片段 · {scope.deletedAt ? '回收站' : '已保存'}</span>
          <Button variant="ghost" isDisabled={!props.canWrite || pendingId === scope.id || !(scope.deletedAt ? props.onRestoreAnalysisScope : props.onTrashAnalysisScope)} onPress={() => void run(scope.id, async () => {
            const action = scope.deletedAt ? props.onRestoreAnalysisScope : props.onTrashAnalysisScope;
            await action?.(scope.id, { spaceId: scope.spaceId, expectedUpdatedAt: scope.updatedAt ?? scope.createdAt });
            setScopeRefresh(value => value + 1);
          })}>{scope.deletedAt ? '恢复范围' : '移入回收站'}</Button>
          {!scope.deletedAt && environment.capability.canStart ? <Button isDisabled={!props.canWrite || task.pending} onPress={() => task.prepare(scope.id)}>提炼此范围</Button> : null}
        </div>)}</div>}
      </InspectorSection> : null}
      {error ? <p className={styles.versionError} role="alert">{error}</p> : null}
      {!props.analysisOnly && props.knowledgeWriteDisabledReason ? <p className={styles.emptyPanel}>{props.knowledgeWriteDisabledReason}</p> : null}
      {detail ? <Dialog title="重点详情" description={`${scopeLabel(detail.annotation.scopeType)} · ${detail.preview.resolution.status === 'resolved' ? '当前范围可定位' : '范围需要检查'}`} isOpen onOpenChange={(open) => { if (!open) setDetail(null); }} isPending={pendingId === detail.annotation.id}>
        <DialogBody><div className={styles.annotationDetailFields}>
          <Select label="类型" options={KIND_OPTIONS} selectedKey={kind} onSelectionChange={(key) => setKind(String(key) as typeof kind)} />
          <Select label="重要程度" options={IMPORTANCE_OPTIONS} selectedKey={importance} onSelectionChange={(key) => { setImportance(String(key)); setImportanceChanged(true); }} />
          <TextAreaField label="备注" maxLength={2000} value={comment} onChange={setComment} />
          {detail.annotation.scopeType === 'list' ? <p>本项及全部子项 · 子项 {detail.annotation.anchor?.list?.childCount ?? 0} 项</p> : null}
          <pre>{detail.preview.resolution.quoteText ?? detail.annotation.quoteText}</pre>
          {detail.preview.pendingRange ? <>
            <p>原范围保留在上方。确认后将使用以下新范围：</p>
            <pre>{detail.preview.pendingRange.anchor.quoteText}</pre>
            <Button isDisabled={!props.canWrite || !props.onConfirmAnnotationRange || pendingId === detail.annotation.id} onPress={() => void run(detail.annotation.id, async () => {
              await props.onConfirmAnnotationRange?.(detail.annotation.id, { expectedRevision: detail.annotation.revision ?? 1, noteContentHash: detail.preview.currentContentHash, candidateHash: detail.preview.pendingRange!.candidateHash });
              setDetail(null);
            })}>确认新范围</Button>
          </> : null}
          {detail.links.evidenceStatus.some(item => item.status !== 'valid') ? <p role="status">关联内容待检查：原文更新不会改写已有知识或历史依据。</p> : null}
          <p>关联候选 {detail.links.candidates.length} · 已确认知识 {detail.links.confirmed.length} · 局部排除 {detail.preview.exclusions.filter((item) => item.status === 'active').length}</p>
          {props.onOpenKnowledgeItem ? <div className={styles.noteLinks}>{[...detail.links.candidates, ...detail.links.confirmed].map(({ knowledgeItem }) => <button type="button" key={knowledgeItem.id} onClick={() => props.onOpenKnowledgeItem?.(knowledgeItem.id)}>{knowledgeItem.title}</button>)}</div> : null}
          {detail.preview.exclusions.filter((item) => item.status === 'active').map((exclusion) => <button key={exclusion.id} type="button" disabled={!props.onDeleteAnnotationExclusion} onClick={() => void props.onDeleteAnnotationExclusion?.(detail.annotation.id, exclusion.id, detail.annotation.revision ?? 1).then(() => setDetail(null)).catch((reason) => setError(reason instanceof Error ? reason.message : '恢复范围失败'))}>恢复排除范围：{exclusion.anchor.quoteText.slice(0, 32)}</button>)}
        </div></DialogBody>
        <DialogFooter><DialogClose variant="ghost">关闭</DialogClose><Button variant="primary" onPress={() => void saveMetadata()}>保存信息</Button></DialogFooter>
      </Dialog> : null}
      {analysis ? <AnalysisScopeDialog key={analysis.scopeKey} analysis={analysis} onSave={props.onCreateAnalysisScope}
        startDisabledReason={task.pending ? '已有任务请求尚未完成，请先查询任务结果，再开始新的范围。' : undefined}
        onSaved={() => setScopeRefresh(value => value + 1)} onClose={() => setAnalysis(null)}
        onStart={input => { setAnalysis(null); void task.start(input); }} /> : null}
      <KnowledgeExtractionTaskPanel task={task} onOpenCandidate={props.onOpenKnowledgeItem} />
    </section>
  );
}

const KIND_OPTIONS = [{ id: 'important', label: '重点' }, { id: 'question', label: '疑问' }, { id: 'supplement', label: '补充' }, { id: 'pitfall', label: '易错' }, { id: 'temporary', label: '临时笔记' }];
const IMPORTANCE_OPTIONS = [{ id: 'normal', label: '普通' }, { id: 'important', label: '重点' }, { id: 'core', label: '核心' }];
const STATUS_FILTERS = [{ id: 'active', label: '原文可定位' }, { id: 'needsReview', label: '原文待核对' }, { id: 'all', label: '全部原文状态' }];
function scopeLabel(scope?: Annotation['scopeType']) { return scope === 'list' ? '列表项' : scope === 'blocks' ? '内容块' : scope === 'section' ? '标题章节' : '文字选区'; }

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
