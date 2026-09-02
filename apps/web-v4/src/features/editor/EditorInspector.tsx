import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import type { Annotation, Attachment, Folder, Note, NoteVersion, Tag } from '@study-accelerator/web-core';
import { Button, Checkbox, Dialog, DialogBody, DialogClose, DialogFooter } from '../../components/ui';
import { GhostIconButton } from '../../components/ui/button';
import { Tabs, type TabsItem } from '../../components/ui/collection';
import {
  CloseIcon,
  HighlightIcon,
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
  markdown: string;
  open: boolean;
  canWrite: boolean;
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
  onListVersions(noteId: string): Promise<NoteVersion[]>;
  onGetVersion(noteId: string, versionId: string): Promise<NoteVersion>;
  onOrganizeNote(input: { folderId: string | null; status: string }): Promise<void>;
  onUploadAttachment(file: File): Promise<Attachment>;
  onRenameAttachment(attachmentId: string, fileName: string): Promise<Attachment>;
  onDeleteAttachment(attachmentId: string): Promise<void>;
  onCreateAnnotation(): Promise<void>;
  onSelectAnnotation(annotationId: string): void;
  onDeleteAnnotation(annotationId: string): Promise<void>;
  onRestoreAnnotation(annotationId: string): Promise<void>;
  onReanchorAnnotation(annotation: Annotation): Promise<void>;
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
              <AnnotationPanel {...props} />
            ) : null}
            {item.id === 'versions' ? (
              <VersionPanel
                noteId={props.note.id}
                onListVersions={props.onListVersions}
                onGetVersion={props.onGetVersion}
              />
            ) : null}
            {item.id === 'ai' ? <AiPanel /> : null}
          </div>
        )}
      </Tabs>
      <TagEditorDialog
        isOpen={tagEditorOpen}
        tags={props.tags}
        selectedTagIds={props.note.tagIds}
        onOpenChange={setTagEditorOpen}
        onSave={props.onSetTags}
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
            ? props.assignedTags.map((tag) => <span key={tag.id}>{tag.name || '未命名标签'}</span>)
            : <p className={styles.emptyInline}>暂无标签</p>}
        </div>
      </InspectorSection>
      <InspectorSection icon={<LinkIcon size={18} />} title="关联笔记" count={props.relations.related.length}>
        <NoteLinks notes={props.relations.related} onOpenNote={props.onOpenNote} empty="暂无关联笔记" />
      </InspectorSection>
      <InspectorSection icon={<PaperclipIcon size={18} />} title="附件" count={props.attachments.length}>
        <EditorAttachmentPanel
          attachments={props.attachments}
          markdown={props.markdown}
          canWrite={props.canWrite}
          loading={props.attachmentsLoading}
          onUpload={props.onUploadAttachment}
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

function TagEditorDialog({ isOpen, tags, selectedTagIds, onOpenChange, onSave }: {
  isOpen: boolean;
  tags: Tag[];
  selectedTagIds: string[];
  onOpenChange(open: boolean): void;
  onSave(tagIds: string[]): Promise<void>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedTagIds));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setSelected(new Set(selectedTagIds));
    setError('');
  }, [isOpen, selectedTagIds]);

  async function handleSave() {
    setPending(true);
    setError('');
    try {
      await onSave([...selected]);
      onOpenChange(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '标签保存失败，请重试');
    } finally {
      setPending(false);
    }
  }

  if (!isOpen) return null;
  return (
    <Dialog title="编辑笔记标签" description="选择要关联到当前笔记的标签。" isOpen onOpenChange={onOpenChange} isPending={pending}>
      <DialogBody>
        {tags.length > 0 ? (
          <div className={styles.tagOptions} role="group" aria-label="可用标签">
            {tags.map((tag) => (
              <Checkbox
                key={tag.id}
                isSelected={selected.has(tag.id)}
                onChange={(checked) => setSelected((current) => {
                  const next = new Set(current);
                  if (checked) next.add(tag.id);
                  else next.delete(tag.id);
                  return next;
                })}
              >
                {tag.name || '未命名标签'}
              </Checkbox>
            ))}
          </div>
        ) : <p className={styles.emptyPanel}>当前工作区还没有可用标签。</p>}
        <p className={styles.tagSelectionCount} aria-live="polite">已选择 {selected.size} 个标签</p>
        {error ? <p className={styles.versionError} role="alert">{error}</p> : null}
      </DialogBody>
      <DialogFooter>
        <DialogClose variant="ghost">取消</DialogClose>
        <Button variant="primary" isPending={pending} onPress={() => void handleSave()}>保存标签</Button>
      </DialogFooter>
    </Dialog>
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

function AnnotationPanel(props: EditorInspectorProps) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

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

  async function create() {
    setCreating(true);
    setError('');
    try {
      await props.onCreateAnnotation();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : '创建标注失败，请重试');
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className={`${styles.simplePanel} ${styles.annotationPanel}`} aria-label="正文标注">
      <header className={styles.annotationHeader}>
        <div><strong>重要内容</strong><span>选中正文后创建可定位标注</span></div>
        <Button variant="primary" isPending={creating} isDisabled={!props.canWrite} onPress={() => void create()}>
          <HighlightIcon size={14} />新建标注
        </Button>
      </header>
      {error ? <p className={styles.versionError} role="alert">{error}</p> : null}
      {props.annotationsLoading ? <p className={styles.emptyPanel} role="status">正在加载正文标注…</p> : null}
      {!props.annotationsLoading && props.annotations.length === 0 ? <p className={styles.emptyPanel}>暂无标注。请先在正文中选中一段文字。</p> : null}
      <div className={styles.annotationList}>
        {props.annotations.map((annotation, index) => {
          const archived = annotation.status === 'archived' || Boolean(annotation.deletedAt);
          const stale = annotation.status === 'stale';
          const pending = pendingId === annotation.id;
          return (
            <article key={annotation.id} data-focused={props.focusedAnnotationId === annotation.id || undefined} data-stale={stale || undefined}>
              <header>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <strong>{archived ? '已归档' : stale ? '待重新定位' : '已定位'}</strong>
              </header>
              <blockquote>{annotation.quoteText}</blockquote>
              {annotation.headingPath.length > 0 ? <p title={annotation.headingPath.join(' / ')}>{annotation.headingPath.join(' / ')}</p> : null}
              <footer>
                {!archived ? <button type="button" disabled={pending} onClick={() => props.onSelectAnnotation(annotation.id)}>定位</button> : null}
                {!archived ? <button type="button" disabled={pending || !props.canWrite} onClick={() => void run(annotation.id, () => props.onReanchorAnnotation(annotation))}>重新定位</button> : null}
                {archived
                  ? <button type="button" disabled={pending || !props.canWrite} onClick={() => void run(annotation.id, () => props.onRestoreAnnotation(annotation.id))}>恢复</button>
                  : <button type="button" disabled={pending || !props.canWrite} onClick={() => void run(annotation.id, () => props.onDeleteAnnotation(annotation.id))}>归档</button>}
              </footer>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function AiPanel() {
  return (
    <section className={styles.aiPanel}>
      <span className={styles.aiIcon}><SparkIcon size={26} /></span>
      <h3>AI 检查尚未接入</h3>
      <p>当前版本不会伪造总结或建议；后端能力接入后，这里将提供文档检查结果。</p>
    </section>
  );
}

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
