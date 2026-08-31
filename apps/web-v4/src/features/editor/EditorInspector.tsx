import { useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import type { Folder, Note, Tag } from '@study-accelerator/web-core';
import { GhostIconButton } from '../../components/ui/button';
import { Tabs, type TabsItem } from '../../components/ui/collection';
import {
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

const inspectorTabs: TabsItem[] = [
  { id: 'info', label: '信息' },
  { id: 'outline', label: '大纲' },
  { id: 'links', label: '链接' },
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
  onClose(): void;
  onOpenNote(noteId: string): void;
  onNavigateHeading(heading: InspectorHeading, index: number): void;
}

export function EditorInspector(props: EditorInspectorProps) {
  const [selectedTab, setSelectedTab] = useState('info');
  const tags = useMemo(() => resolveNoteTags(props.note, props.tags), [props.note, props.tags]);
  const relations = useMemo(
    () => resolveInspectorRelations(props.note, props.notes),
    [props.note, props.notes]
  );
  const outline = useMemo(() => extractInspectorOutline(props.markdown), [props.markdown]);
  const stats = useMemo(() => getDocumentStats(props.markdown), [props.markdown]);

  return (
    <aside
      className={styles.inspector}
      data-open={props.open || undefined}
      aria-label="文档检查器"
      aria-hidden={!props.open}
    >
      <header className={styles.header}>
        <h2>文档检查器</h2>
        <GhostIconButton size={40} aria-label="关闭文档检查器" onPress={props.onClose}>
          <CloseIcon size={20} />
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
                tags={tags}
                relations={relations}
                stats={stats}
              />
            ) : null}
            {item.id === 'outline' ? (
              <OutlinePanel outline={outline} onNavigate={props.onNavigateHeading} />
            ) : null}
            {item.id === 'links' ? (
              <LinksPanel relations={relations} onOpenNote={props.onOpenNote} />
            ) : null}
            {item.id === 'ai' ? <AiPanel /> : null}
          </div>
        )}
      </Tabs>
    </aside>
  );
}

function InfoPanel(props: EditorInspectorProps & {
  tags: Tag[];
  relations: InspectorRelations;
  stats: ReturnType<typeof getDocumentStats>;
}) {
  const folderPath = buildFolderPath(props.folder, props.foldersById);
  return (
    <>
      <div className={styles.noteHeading}>
        <span>{getSourceLabel(props.note.sourceType)}</span>
        <h3>{props.note.title || '无标题笔记'}</h3>
      </div>
      <InspectorSection icon={<NoteIcon size={18} />} title="笔记信息">
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
      <InspectorSection icon={<TagIcon size={18} />} title="标签" count={props.tags.length}>
        <div className={styles.tags}>
          {props.tags.length > 0
            ? props.tags.map((tag) => <span key={tag.id}>{tag.name || '未命名标签'}</span>)
            : <p className={styles.emptyInline}>暂无标签</p>}
        </div>
      </InspectorSection>
      <InspectorSection icon={<LinkIcon size={18} />} title="关联笔记" count={props.relations.related.length}>
        <NoteLinks notes={props.relations.related} onOpenNote={props.onOpenNote} empty="暂无关联笔记" />
      </InspectorSection>
      <InspectorSection icon={<PaperclipIcon size={18} />} title="附件">
        <p className={styles.emptyInline}>附件数据将在附件模块接入后显示</p>
      </InspectorSection>
    </>
  );
}

function OutlinePanel({ outline, onNavigate }: {
  outline: InspectorHeading[];
  onNavigate(heading: InspectorHeading, index: number): void;
}) {
  return (
    <section className={styles.simplePanel}>
      <span className={styles.panelKicker}>DOCUMENT OUTLINE</span>
      <h3>本页大纲</h3>
      {outline.length > 0 ? <nav className={styles.outline} aria-label="文档大纲">
        {outline.map((heading, index) => (
          <button
            key={heading.id}
            type="button"
            data-level={heading.level}
            onClick={() => onNavigate(heading, index)}
          >
            <span>{String(index + 1).padStart(2, '0')}</span>{heading.text}
          </button>
        ))}
      </nav> : <p className={styles.emptyPanel}>添加一至四级标题后，大纲会自动生成。</p>}
    </section>
  );
}

function LinksPanel({ relations, onOpenNote }: {
  relations: InspectorRelations;
  onOpenNote(noteId: string): void;
}) {
  return (
    <div className={styles.linksPanel}>
      <InspectorSection icon={<LinkIcon size={18} />} title="引用这篇笔记" count={relations.backlinks.length}>
        <NoteLinks notes={relations.backlinks} onOpenNote={onOpenNote} empty="暂无反向链接" />
      </InspectorSection>
      <InspectorSection icon={<NoteIcon size={18} />} title="本页链接" count={relations.outgoing.length}>
        <NoteLinks notes={relations.outgoing} onOpenNote={onOpenNote} empty="暂无内部链接" />
      </InspectorSection>
    </div>
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

function InspectorSection({ icon, title, count, children }: {
  icon: ReactNode;
  title: string;
  count?: number;
  children: ReactNode;
}) {
  return <section className={styles.section}>
    <h3>{icon}<span>{title}</span>{count !== undefined ? <small>{count}</small> : null}</h3>
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
