import { lazy, Suspense, useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  buildExportFileName,
  type Folder,
  type Note,
  type Tag
} from '@study-accelerator/web-core';
import { downloadTextFile } from '../../browser/downloadFile';
import { exportElementToPdf } from '../../browser/exportPdf';
import { Button } from '../../components/ui';
import { NoteIcon } from '../../shell/icons';
import { EditorDocumentHeader, type EditorDocumentHeaderHandle } from './EditorDocumentHeader';
import { EditorContextMenu } from './EditorContextMenu';
import { EditorFindReplacePanel } from './EditorFindReplacePanel';
import { EditorInspector } from './EditorInspector';
import { EditorSourcePane } from './EditorSourcePane';
import { EditorTabs } from './EditorTabs';
import { EditorToolbar } from './EditorToolbar';
import type {
  EditorCommand,
  EditorCommandTarget,
  EditorEditAction,
  EditorFileAction,
  EditorFindMode
} from './editorCommands';
import type { EditorViewAction, EffectiveEditorViewState } from './editorViewState';
import { useNoteAutosave } from './useNoteAutosave';
import styles from './NoteEditorView.module.css';

const MilkdownNoteEditor = lazy(async () => {
  const module = await import('./MilkdownNoteEditor');
  return { default: module.MilkdownNoteEditor };
});

export interface NoteEditorViewProps {
  note: Note | null;
  folder: Folder | null;
  foldersById: Record<string, Folder>;
  notes: Note[];
  tags: Tag[];
  openNotes: Note[];
  inspectorOpen: boolean;
  view: EffectiveEditorViewState;
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
  onSaveMarkdown(noteId: string, markdown: string, expectedUpdatedAt?: string): Promise<Note>;
  onSaveAs(): Promise<void>;
  onDeleteNote(): void;
  onFileStatus(message: string): void;
  onViewAction(action: EditorViewAction): void;
  onToggleFavorite(): void;
  onToggleInspector(): void;
}

export function NoteEditorView({
  note,
  folder,
  foldersById,
  notes,
  tags,
  openNotes,
  inspectorOpen,
  view,
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
  onViewAction,
  onToggleFavorite,
  onToggleInspector
}: NoteEditorViewProps) {
  const documentStageRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLElement>(null);
  const toolbarAnchorRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorCommandTarget>(null);
  const documentHeaderRef = useRef<EditorDocumentHeaderHandle>(null);
  const [toolbarPinned, setToolbarPinned] = useState(false);
  const [documentEdge, setDocumentEdge] = useState<number | null>(null);
  const [editPanelMode, setEditPanelMode] = useState<EditorFindMode | null>(null);
  const autosave = useNoteAutosave({
    noteId: note?.id ?? 'missing-note',
    remoteMarkdown: note?.rawMarkdown ?? '',
    remoteUpdatedAt: note?.updatedAt,
    canWrite: Boolean(note && canWrite),
    onSave: onSaveMarkdown
  });
  const draftMarkdown = autosave.draftMarkdown;

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

  const canEditContent = canWrite && view.contentMode === 'edit' && !view.showSourceEditor;
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
  const saveImmediately = async () => {
    if (!canWrite) return;
    const markdown = editorRef.current?.getMarkdown() ?? autosave.getLatestMarkdown();
    await autosave.saveNow(markdown);
  };
  const openNoteSafely = (targetNoteId: string) => {
    if (targetNoteId === note.id || !canWrite) {
      onOpenNote(targetNoteId);
      return;
    }
    void saveImmediately()
      .then(() => onOpenNote(targetNoteId))
      .catch((error) => onFileStatus(error instanceof Error ? error.message : '切换前保存失败'));
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
        onViewAction('mode-edit');
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
        const markdown = editorRef.current?.getMarkdown() ?? autosave.getLatestMarkdown();
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
      data-view-mode={view.mode}
      data-content-mode={view.contentMode}
      aria-label="笔记编辑页面骨架"
      style={documentEdge === null ? undefined : { '--doc-edge': `${documentEdge}px` } as CSSProperties}
    >
      <EditorTabs
        notes={openNotes.length > 0 ? openNotes : [note]}
        activeNoteId={note.id}
        canWrite={canWrite}
        onOpenNote={openNoteSafely}
        onCloseNote={(closingNoteId) => {
          if (closingNoteId !== note.id || !canWrite) {
            onCloseNote(closingNoteId);
            return;
          }
          void saveImmediately()
            .then(() => onCloseNote(closingNoteId))
            .catch((error) => onFileStatus(error instanceof Error ? error.message : '关闭前保存失败'));
        }}
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
              canWrite={canEditContent}
              onRenameNote={onRenameNote}
            />
            <div ref={toolbarAnchorRef} className={styles.toolbarAnchor} aria-hidden="true" />
            <EditorToolbar
              toolbarRef={toolbarRef}
              pinned={toolbarPinned}
              favorite={note.favorite}
              favoritePending={favoritePending}
              canWrite={canWrite}
              canEditContent={canEditContent}
              inspectorOpen={inspectorOpen}
              view={view}
              onRunCommand={runCommand}
              onEditAction={(action) => { void handleEditAction(action); }}
              onViewAction={onViewAction}
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
            {autosave.hasConflict ? (
              <div className={styles.saveConflict} role="alert">
                <div>
                  <strong>检测到较新的远端版本，自动保存已暂停</strong>
                  <p>当前页面仍保留你的本地草稿。请先导出草稿，再刷新并人工合并，系统不会自动覆盖任一版本。</p>
                </div>
                <Button
                  variant="default"
                  onPress={() => {
                    const fileName = buildExportFileName(`${note.title}-冲突草稿`, 'md');
                    downloadTextFile(fileName, autosave.getLatestMarkdown(), 'text/markdown;charset=utf-8');
                    onFileStatus(`已导出本地冲突草稿：${fileName}`);
                  }}
                >
                  导出本地草稿
                </Button>
              </div>
            ) : null}
            <div className={styles.editorPanes} data-source-open={view.showSourceEditor || undefined}>
              {view.showSourceEditor ? (
                <EditorSourcePane
                  markdown={draftMarkdown}
                  readOnly={!canWrite}
                  onChange={(markdown) => {
                    autosave.updateDraft(markdown);
                    editorRef.current?.setMarkdown(markdown);
                  }}
                  onSave={() => {
                    void saveImmediately()
                      .then(() => onFileStatus('源码已保存'))
                      .catch((error) => onFileStatus(error instanceof Error ? error.message : '源码保存失败'));
                  }}
                />
              ) : null}
              <EditorContextMenu
                enabled={note.contentLoaded && !view.showSourceEditor}
                canEdit={canEditContent}
                onRunCommand={runCommand}
                onEditAction={(action) => { void handleEditAction(action); }}
              >
                <div className={styles.content} aria-label={view.contentMode === 'read' ? '笔记正文阅读区' : '笔记正文编辑器'}>
                  {note.contentLoaded ? (
                    <Suspense fallback={<div className={styles.emptyBody}><p>正在启动编辑器…</p></div>}>
                      <MilkdownNoteEditor
                        key={note.id}
                        ref={editorRef}
                        noteId={note.id}
                        markdown={draftMarkdown}
                        readOnly={!canEditContent}
                        allowExternalSync={!autosave.hasLocalChanges}
                        onChange={autosave.updateDraft}
                      />
                    </Suspense>
                  ) : <div className={styles.emptyBody}><h2>正在加载正文…</h2><p>标题与标签页可以先使用，正文会在详情接口返回后启用。</p></div>}
                </div>
              </EditorContextMenu>
            </div>
          </article>
        </div>
        <EditorInspector
          note={note}
          folder={folder}
          foldersById={foldersById}
          notes={notes}
          tags={tags}
          markdown={draftMarkdown}
          open={inspectorOpen}
          onClose={onToggleInspector}
          onOpenNote={openNoteSafely}
          onNavigateHeading={(_heading, index) => {
            const heading = paperRef.current?.querySelectorAll<HTMLElement>('.ProseMirror h1, .ProseMirror h2, .ProseMirror h3, .ProseMirror h4')[index];
            heading?.scrollIntoView({
              block: 'center',
              behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
            });
          }}
        />
      </div>
    </section>
  );
}
