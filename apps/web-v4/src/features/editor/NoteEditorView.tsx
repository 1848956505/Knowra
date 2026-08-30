import { lazy, Suspense, useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  buildExportFileName,
  type Folder,
  type Note
} from '@study-accelerator/web-core';
import { downloadTextFile } from '../../browser/downloadFile';
import { exportElementToPdf } from '../../browser/exportPdf';
import { CloseIcon, NoteIcon } from '../../shell/icons';
import { EditorDocumentHeader, type EditorDocumentHeaderHandle } from './EditorDocumentHeader';
import { EditorFindReplacePanel } from './EditorFindReplacePanel';
import { EditorTabs } from './EditorTabs';
import { EditorToolbar } from './EditorToolbar';
import type {
  EditorCommand,
  EditorCommandTarget,
  EditorEditAction,
  EditorFileAction,
  EditorFindMode
} from './editorCommands';
import styles from './NoteEditorView.module.css';

const MilkdownNoteEditor = lazy(async () => {
  const module = await import('./MilkdownNoteEditor');
  return { default: module.MilkdownNoteEditor };
});

export interface NoteEditorViewProps {
  note: Note | null;
  folder: Folder | null;
  openNotes: Note[];
  inspectorOpen: boolean;
  canWrite: boolean;
  favoritePending?: boolean;
  onOpenNote(noteId: string): void;
  onCloseNote(noteId: string): void;
  onCloseOtherNotes(noteId: string): void;
  onReorderNotes(sourceNoteId: string, targetNoteId: string): void;
  onCopyTabPath(note: Note): void;
  onCreateNote(): void;
  onCreateFolder(): void;
  onImportMarkdown(): void;
  onRenameNote(title: string): Promise<void>;
  onSaveMarkdown(markdown: string): Promise<void>;
  onSaveAs(): Promise<void>;
  onDeleteNote(): void;
  onFileStatus(message: string): void;
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
  onCloseOtherNotes,
  onReorderNotes,
  onCopyTabPath,
  onCreateNote,
  onCreateFolder,
  onImportMarkdown,
  onRenameNote,
  onSaveMarkdown,
  onSaveAs,
  onDeleteNote,
  onFileStatus,
  onToggleFavorite,
  onToggleInspector
}: NoteEditorViewProps) {
  const documentStageRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLElement>(null);
  const toolbarAnchorRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorCommandTarget>(null);
  const documentHeaderRef = useRef<EditorDocumentHeaderHandle>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingMarkdownRef = useRef<string | null>(null);
  const onSaveMarkdownRef = useRef(onSaveMarkdown);
  onSaveMarkdownRef.current = onSaveMarkdown;
  const [toolbarPinned, setToolbarPinned] = useState(false);
  const [documentEdge, setDocumentEdge] = useState<number | null>(null);
  const [editPanelMode, setEditPanelMode] = useState<EditorFindMode | null>(null);

  useEffect(() => {
    const stage = documentStageRef.current;
    const toolbarAnchor = toolbarAnchorRef.current;
    const toolbar = toolbarRef.current;
    if (!stage || !toolbarAnchor || !toolbar) return;
    const syncPinned = () => {
      const marginTop = Number.parseFloat(window.getComputedStyle(toolbar).marginTop) || 0;
      const pinned = toolbarAnchor.getBoundingClientRect().top + marginTop <= stage.getBoundingClientRect().top + 1;
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

  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (canWrite && pendingMarkdownRef.current !== null) void onSaveMarkdownRef.current(pendingMarkdownRef.current);
    pendingMarkdownRef.current = null;
  }, [note?.id, canWrite]);

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (pendingMarkdownRef.current === null) return;
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, []);

  useEffect(() => setEditPanelMode(null), [note?.id]);

  if (!note) {
    return (
      <section className={styles.unavailable} aria-labelledby="editor-unavailable-title">
        <NoteIcon size={32} />
        <h1 id="editor-unavailable-title">未找到这篇笔记</h1>
        <p>它可能尚未加载、已被删除，或链接已经失效。</p>
      </section>
    );
  }

  const runCommand = (command: EditorCommand) => {
    if (!editorRef.current?.run(command)) return;
    window.requestAnimationFrame(() => editorRef.current?.focus());
  };
  const handleEditAction = async (action: EditorEditAction) => {
    if (action === 'find' || action === 'replace') {
      setEditPanelMode(action);
      return;
    }
    if (action === 'undo' || action === 'redo') {
      runCommand(action);
      return;
    }
    const result = await editorRef.current?.runEdit(action);
    if (!result?.ok) {
      const messages = {
        'empty-selection': '请先选中要编辑的内容',
        'clipboard-empty': '剪贴板为空',
        'clipboard-denied': '无法访问剪贴板，请检查浏览器权限',
        unsupported: '当前环境暂不支持该编辑操作'
      } as const;
      onFileStatus(messages[result?.reason ?? 'unsupported']);
      return;
    }
    if (action === 'copy') onFileStatus('已复制所选内容');
    if (action === 'cut') onFileStatus('已剪切所选内容');
    if (action === 'paste') onFileStatus('已粘贴剪贴板内容');
  };
  const queueSave = (markdown: string) => {
    if (!canWrite) return;
    pendingMarkdownRef.current = markdown;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      pendingMarkdownRef.current = null;
      void onSaveMarkdownRef.current(markdown).catch(() => undefined);
    }, 700);
  };
  const saveImmediately = async () => {
    if (!canWrite) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    const markdown = pendingMarkdownRef.current
      ?? editorRef.current?.getMarkdown()
      ?? note.rawMarkdown;
    pendingMarkdownRef.current = null;
    await onSaveMarkdownRef.current(markdown);
  };
  const handleFileAction = async (action: EditorFileAction) => {
    switch (action) {
      case 'new-note':
        onCreateNote();
        return;
      case 'new-folder':
        onCreateFolder();
        return;
      case 'import-markdown':
        onImportMarkdown();
        return;
      case 'save':
        await saveImmediately();
        return;
      case 'save-as':
        await saveImmediately();
        await onSaveAs();
        return;
      case 'rename':
        window.setTimeout(() => documentHeaderRef.current?.focusTitle(), 0);
        return;
      case 'favorite-note':
        onToggleFavorite();
        return;
      case 'delete-note':
        onDeleteNote();
        return;
      case 'export-markdown': {
        const fileName = buildExportFileName(note.title, 'md');
        const markdown = pendingMarkdownRef.current ?? editorRef.current?.getMarkdown() ?? note.rawMarkdown;
        downloadTextFile(fileName, markdown, 'text/markdown;charset=utf-8');
        onFileStatus(`已导出 Markdown：${fileName}`);
        return;
      }
      case 'export-pdf': {
        if (!paperRef.current) throw new Error('笔记纸张尚未准备好，无法导出 PDF');
        onFileStatus('正在生成 PDF…');
        const fileName = await exportElementToPdf(paperRef.current, note.title);
        onFileStatus(`已导出 PDF：${fileName}`);
      }
    }
  };

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
        onCloseOtherNotes={onCloseOtherNotes}
        onReorderNotes={onReorderNotes}
        onCopyTabPath={onCopyTabPath}
        onCreateNote={onCreateNote}
      />
      <div className={styles.workspace}>
        <div ref={documentStageRef} className={styles.documentStage}>
          <article ref={paperRef} className={styles.paper} data-pdf-document="true" aria-labelledby="note-editor-title">
            <EditorDocumentHeader
              ref={documentHeaderRef}
              note={note}
              folder={folder}
              canWrite={canWrite}
              onRenameNote={onRenameNote}
            />
            <div ref={toolbarAnchorRef} className={styles.toolbarAnchor} aria-hidden="true" />
            <EditorToolbar
              toolbarRef={toolbarRef}
              pinned={toolbarPinned}
              favorite={note.favorite}
              favoritePending={favoritePending}
              canWrite={canWrite}
              inspectorOpen={inspectorOpen}
              onRunCommand={runCommand}
              onEditAction={(action) => { void handleEditAction(action); }}
              onFileAction={(action) => {
                void handleFileAction(action).catch((error) => {
                  onFileStatus(error instanceof Error ? error.message : '文件操作失败');
                });
              }}
              onToggleFavorite={onToggleFavorite}
              onToggleInspector={onToggleInspector}
            />
            <EditorFindReplacePanel
              mode={editPanelMode}
              editor={editorRef.current}
              onClose={() => setEditPanelMode(null)}
              onStatus={onFileStatus}
            />
            <div className={styles.content} aria-label="笔记正文编辑器">
              {note.contentLoaded ? (
                <Suspense fallback={<div className={styles.emptyBody}><p>正在启动编辑器…</p></div>}>
                  <MilkdownNoteEditor
                    ref={editorRef}
                    noteId={note.id}
                    markdown={note.rawMarkdown}
                    readOnly={!canWrite}
                    onChange={queueSave}
                  />
                </Suspense>
              ) : <div className={styles.emptyBody}><h2>正在加载正文…</h2><p>标题与标签页可以先使用，正文会在详情接口返回后启用。</p></div>}
            </div>
          </article>
        </div>
        <EditorInspector note={note} folder={folder} open={inspectorOpen} onClose={onToggleInspector} />
      </div>
    </section>
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
