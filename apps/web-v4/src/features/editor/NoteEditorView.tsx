import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode, type Ref } from 'react';
import type { Folder, Note } from '@study-accelerator/web-core';
import {
  CloseIcon,
  CodeIcon,
  ImageIcon,
  ListIcon,
  MoreVerticalIcon,
  NoteIcon,
  PanelIcon,
  PlusIcon,
  QuoteIcon,
  StarIcon,
  TableIcon
} from '../../shell/icons';
import { EditorDocumentHeader } from './EditorDocumentHeader';
import styles from './NoteEditorView.module.css';

export interface NoteEditorViewProps {
  note: Note | null;
  folder: Folder | null;
  openNotes: Note[];
  inspectorOpen: boolean;
  canWrite: boolean;
  favoritePending?: boolean;
  onOpenNote(noteId: string): void;
  onCloseNote(noteId: string): void;
  onCreateNote(): void;
  onRenameNote(title: string): Promise<void>;
  onToggleFavorite(): void;
  onToggleInspector(): void;
}

export function NoteEditorView({
  note,
  folder,
  openNotes,
  inspectorOpen,
  canWrite,
  favoritePending = false,
  onOpenNote,
  onCloseNote,
  onCreateNote,
  onRenameNote,
  onToggleFavorite,
  onToggleInspector
}: NoteEditorViewProps) {
  const documentStageRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [toolbarPinned, setToolbarPinned] = useState(false);
  const [documentEdge, setDocumentEdge] = useState<number | null>(null);

  useEffect(() => {
    const stage = documentStageRef.current;
    const toolbar = toolbarRef.current;
    if (!stage || !toolbar) return;
    const syncPinned = () => {
      const pinned = toolbar.getBoundingClientRect().top <= stage.getBoundingClientRect().top + 1;
      setToolbarPinned((current) => current === pinned ? current : pinned);
    };
    const syncDocumentEdge = () => {
      const paper = toolbar.closest('article');
      if (paper) {
        const edge = Math.max(0, (stage.clientWidth - paper.offsetWidth) / 2);
        setDocumentEdge((current) => current === edge ? current : edge);
      }
    };
    const syncLayout = () => {
      syncPinned();
      syncDocumentEdge();
    };
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(syncDocumentEdge);
    observer?.observe(stage);
    stage.addEventListener('scroll', syncPinned, { passive: true });
    window.addEventListener('resize', syncLayout);
    syncLayout();
    return () => {
      observer?.disconnect();
      stage.removeEventListener('scroll', syncPinned);
      window.removeEventListener('resize', syncLayout);
    };
  }, [note?.id]);

  if (!note) {
    return (
      <section className={styles.unavailable} aria-labelledby="editor-unavailable-title">
        <NoteIcon size={32} />
        <h1 id="editor-unavailable-title">未找到这篇笔记</h1>
        <p>它可能尚未加载、已被删除，或链接已经失效。</p>
      </section>
    );
  }

  const body = note.rawMarkdown.trim();

  return (
    <section
      className={styles.editor}
      aria-label="笔记编辑页面骨架"
      style={documentEdge === null ? undefined : { '--doc-edge': `${documentEdge}px` } as CSSProperties}
    >
      <EditorTabs
        notes={openNotes.length > 0 ? openNotes : [note]}
        activeNoteId={note.id}
        canWrite={canWrite}
        onOpenNote={onOpenNote}
        onCloseNote={onCloseNote}
        onCreateNote={onCreateNote}
      />
      <div className={styles.workspace}>
        <div ref={documentStageRef} className={styles.documentStage}>
          <article className={styles.paper} aria-labelledby="note-editor-title">
            <EditorDocumentHeader
              note={note}
              folder={folder}
              canWrite={canWrite}
              onRenameNote={onRenameNote}
            />
            <EditorToolbar
              toolbarRef={toolbarRef}
              pinned={toolbarPinned}
              favorite={note.favorite}
              favoritePending={favoritePending}
              canWrite={canWrite}
              inspectorOpen={inspectorOpen}
              onToggleFavorite={onToggleFavorite}
              onToggleInspector={onToggleInspector}
            />
            <div className={styles.content} aria-label="笔记正文预览">
              {body ? <pre>{body}</pre> : (
                <div className={styles.emptyBody}>
                  <h2>开始记录</h2>
                  <p>编辑器能力将在后续阶段接入；当前页面先建立稳定的文档工作区、工具栏与面板边界。</p>
                </div>
              )}
            </div>
          </article>
        </div>
        <EditorInspector note={note} folder={folder} open={inspectorOpen} onClose={onToggleInspector} />
      </div>
    </section>
  );
}

function EditorTabs({ notes, activeNoteId, canWrite, onOpenNote, onCloseNote, onCreateNote }: {
  notes: Note[];
  activeNoteId: string;
  canWrite: boolean;
  onOpenNote(noteId: string): void;
  onCloseNote(noteId: string): void;
  onCreateNote(): void;
}) {
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    if (tabs.length === 0) return;
    const current = Math.max(0, tabs.indexOf(document.activeElement as HTMLButtonElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? tabs.length - 1
        : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    event.preventDefault();
    tabs[nextIndex].focus();
    tabs[nextIndex].click();
  }

  return (
    <div className={styles.tabs} role="tablist" aria-label="打开的笔记" onKeyDown={handleKeyDown}>
      <div className={styles.tabScroller}>
        {notes.map((item, index) => {
          const selected = item.id === activeNoteId;
          return (
            <div key={item.id} className={styles.tabItem} data-selected={selected || undefined}>
              <button
                type="button"
                role="tab"
                aria-selected={selected}
                aria-label={item.title || '无标题笔记'}
                tabIndex={selected ? 0 : -1}
                className={styles.tab}
                title={`${String(index + 1).padStart(2, '0')} · ${item.title || '无标题笔记'}`}
                onClick={() => onOpenNote(item.id)}
              >
                <span className={styles.tabNumber}>{String(index + 1).padStart(2, '0')}</span>
                <span className={styles.tabLabel}>{item.title || '无标题笔记'}</span>
              </button>
              <button type="button" className={styles.tabClose} aria-label={`关闭${item.title || '无标题笔记'}`} onClick={() => onCloseNote(item.id)}>
                <CloseIcon size={12} />
              </button>
            </div>
          );
        })}
      </div>
      <button type="button" className={styles.addTab} aria-label="新建笔记" title={canWrite ? '新建笔记' : '后端离线时无法新建'} disabled={!canWrite} onClick={onCreateNote}>
        <PlusIcon size={15} />
      </button>
    </div>
  );
}

function EditorToolbar({ toolbarRef, pinned, favorite, favoritePending, canWrite, inspectorOpen, onToggleFavorite, onToggleInspector }: {
  toolbarRef: Ref<HTMLDivElement>;
  pinned: boolean;
  favorite: boolean;
  favoritePending: boolean;
  canWrite: boolean;
  inspectorOpen: boolean;
  onToggleFavorite(): void;
  onToggleInspector(): void;
}) {
  return (
    <div ref={toolbarRef} className={styles.toolbar} data-pinned={pinned || undefined} role="toolbar" aria-label="笔记格式工具栏">
      <div className={styles.toolbarMenus} aria-label="编辑器菜单">
        {['文件', '段落', '编辑', '格式', '视图'].map((label) => (
          <button key={label} type="button" title={`${label}菜单尚未接入 V4 编辑器`} disabled>{label}</button>
        ))}
      </div>
      <span className={styles.separator} aria-hidden="true" />
      <FormatButton label="一级标题"><strong>H1</strong></FormatButton>
      <FormatButton label="二级标题"><strong>H2</strong></FormatButton>
      <FormatButton label="三级标题"><strong>H3</strong></FormatButton>
      <span className={styles.separator} aria-hidden="true" />
      <FormatButton label="加粗"><strong>B</strong></FormatButton>
      <FormatButton label="斜体"><em>I</em></FormatButton>
      <FormatButton label="行内代码"><CodeIcon size={16} /></FormatButton>
      <span className={styles.separator} aria-hidden="true" />
      <FormatButton label="无序列表"><ListIcon size={16} /></FormatButton>
      <FormatButton label="引用"><QuoteIcon size={16} /></FormatButton>
      <FormatButton label="插入表格" optional><TableIcon size={16} /></FormatButton>
      <FormatButton label="插入图片" optional><ImageIcon size={16} /></FormatButton>
      <span className={styles.toolbarSpacer} />
      <span className={styles.separator} aria-hidden="true" />
      <button
        type="button"
        className={styles.plainButton}
        aria-label={favorite ? '取消收藏当前笔记' : '收藏当前笔记'}
        aria-pressed={favorite}
        disabled={!canWrite || favoritePending}
        onClick={onToggleFavorite}
      ><StarIcon size={16} /></button>
      <button type="button" className={styles.plainButton} aria-label="打开格式与插入菜单（尚未接入）" title="格式与插入菜单尚未接入 V4 编辑器" disabled><PlusIcon size={16} /></button>
      <button type="button" className={styles.plainButton} aria-label="切换文档检查器" aria-pressed={inspectorOpen} onClick={onToggleInspector}><PanelIcon size={16} /></button>
      <button type="button" className={styles.plainButton} aria-label="更多文档操作（尚未接入）" title="更多文档操作尚未接入 V4 编辑器" disabled><MoreVerticalIcon size={16} /></button>
    </div>
  );
}

function FormatButton({ label, optional = false, children }: { label: string; optional?: boolean; children: ReactNode }) {
  return (
    <button type="button" className={optional ? styles.optionalTool : undefined} aria-label={`${label}（尚未接入）`} title={`${label}尚未接入 V4 编辑器`} disabled>
      {children}
    </button>
  );
}

function EditorInspector({ note, folder, open, onClose }: { note: Note; folder: Folder | null; open: boolean; onClose(): void }) {
  return (
    <aside className={styles.inspector} data-open={open || undefined} aria-label="文档检查器" aria-hidden={!open}>
      <header><strong>文档检查器</strong><button type="button" onClick={onClose} aria-label="关闭文档检查器"><CloseIcon size={16} /></button></header>
      <nav className={styles.inspectorTabs} aria-label="检查器分类"><button type="button" aria-current="page">属性</button><button type="button" disabled>大纲</button><button type="button" disabled>链接</button></nav>
      <div className={styles.inspectorBody}>
        <span className={styles.inspectorCover} aria-hidden="true"><NoteIcon size={24} /></span>
        <h2>{note.title || '无标题笔记'}</h2>
        <dl><div><dt>状态</dt><dd>{note.status || '文稿'}</dd></div><div><dt>文件夹</dt><dd>{folder?.name || '未整理'}</dd></div><div><dt>标签</dt><dd>{note.tagIds.length}</dd></div></dl>
      </div>
    </aside>
  );
}
