import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import {
  buildExportFileName,
  type Annotation,
  type Attachment,
  type CreateAnnotationInput,
  type Folder,
  type Note,
  type NoteVersion,
  type Tag,
  type TagColor,
  type TagGroup,
  type UpdateAnnotationAnchorInput,
  type UploadAttachmentInput
} from '@study-accelerator/web-core';
import { downloadTextFile } from '../../browser/downloadFile';
import { exportElementToPdf } from '../../browser/exportPdf';
import { Button } from '../../components/ui';
import { NoteIcon } from '../../shell/icons';
import { EditorDocumentHeader, type EditorDocumentHeaderHandle } from './EditorDocumentHeader';
import { EditorContextMenu } from './EditorContextMenu';
import { EditorDocumentRepairDialog } from './EditorDocumentRepairDialog';
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
import {
  captureEditorScrollPosition,
  getEditorScrollTop,
  readEditorScrollPositions,
  writeEditorScrollPositions
} from './editorScrollPosition';
import { useNoteAutosave } from './useNoteAutosave';
import { buildCreateAnnotationInput, buildUpdateAnnotationAnchorInput } from './annotationPayloads';
import {
  INLINE_IMAGE_ACCEPT,
  assertInlineImageFile,
  attachmentImageAlt,
  buildAttachmentReferenceUrl,
  isInlineImageAttachment,
  readAttachmentFile
} from './attachmentFiles';
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
  tagGroups?: TagGroup[];
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
  onListAttachments(noteId: string): Promise<Attachment[]>;
  onUploadAttachment(input: UploadAttachmentInput): Promise<Attachment>;
  onRenameAttachment(attachmentId: string, fileName: string): Promise<Attachment>;
  onDeleteAttachment(attachmentId: string): Promise<void>;
  onGetLinkedNotes(noteId: string): Promise<Note[]>;
  onListAnnotations(noteId: string): Promise<Annotation[]>;
  onCreateAnnotation(input: CreateAnnotationInput): Promise<Annotation>;
  onDeleteAnnotation(annotationId: string): Promise<Annotation>;
  onRestoreAnnotation(annotationId: string): Promise<Annotation>;
  onUpdateAnnotationAnchor(annotationId: string, input: UpdateAnnotationAnchorInput): Promise<Annotation>;
  onFileStatus(message: string): void;
  onViewAction(action: EditorViewAction): void;
  onToggleFavorite(): void;
  onToggleInspector(): void;
}

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

export function NoteEditorView({
  note,
  folder,
  foldersById,
  notes,
  tags,
  tagGroups = [],
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
  onSetTags,
  onCreateTag,
  onUpdateTag,
  onDeleteTag,
  onMergeTags,
  onOpenTagManager,
  onOpenTag,
  onListVersions,
  onGetVersion,
  onOrganizeNote,
  onListAttachments,
  onUploadAttachment,
  onRenameAttachment,
  onDeleteAttachment,
  onGetLinkedNotes,
  onListAnnotations,
  onCreateAnnotation,
  onDeleteAnnotation,
  onRestoreAnnotation,
  onUpdateAnnotationAnchor,
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
  const imageInputRef = useRef<HTMLInputElement>(null);
  const pendingScrollRestoreRef = useRef<string | null>(null);
  const restoringScrollRef = useRef(false);
  const scrollRestoreAttemptRef = useRef(false);
  const retryScrollRestoreRef = useRef<() => void>(() => undefined);
  const [toolbarPinned, setToolbarPinned] = useState(false);
  const [documentEdge, setDocumentEdge] = useState<number | null>(null);
  const [editPanelMode, setEditPanelMode] = useState<EditorFindMode | null>(null);
  const [repairDialogOpen, setRepairDialogOpen] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [linkedNotes, setLinkedNotes] = useState<Note[]>([]);
  const [linkedNotesLoading, setLinkedNotesLoading] = useState(false);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [annotationsLoading, setAnnotationsLoading] = useState(false);
  const [focusedAnnotationId, setFocusedAnnotationId] = useState<string | null>(null);
  const [scrollPositions] = useState(readEditorScrollPositions);
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
      if (!restoringScrollRef.current) {
        if (pendingScrollRestoreRef.current === note?.id) {
          pendingScrollRestoreRef.current = null;
        }
        captureEditorScrollPosition(scrollPositions, note?.id, stage.scrollTop);
      }
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
  }, [note?.id, scrollPositions]);

  useLayoutEffect(() => {
    const stage = documentStageRef.current;
    pendingScrollRestoreRef.current = note?.id ?? null;
    if (!stage) return;
    restoringScrollRef.current = true;
    stage.scrollTop = 0;
    window.requestAnimationFrame(() => {
      restoringScrollRef.current = false;
    });
  }, [note?.id]);

  useEffect(() => {
    let active = true;
    setAttachments([]);
    if (!note?.id || !inspectorOpen) {
      setAttachmentsLoading(false);
      return () => { active = false; };
    }
    setAttachmentsLoading(true);
    void onListAttachments(note.id)
      .then((items) => { if (active) setAttachments(items); })
      .catch((error) => { if (active) onFileStatus(error instanceof Error ? error.message : '附件加载失败'); })
      .finally(() => { if (active) setAttachmentsLoading(false); });
    return () => { active = false; };
  }, [inspectorOpen, note?.id, onFileStatus, onListAttachments]);

  useEffect(() => {
    let active = true;
    setAnnotations([]);
    setFocusedAnnotationId(null);
    if (!note?.id) {
      setAnnotationsLoading(false);
      return () => { active = false; };
    }
    setAnnotationsLoading(true);
    void onListAnnotations(note.id)
      .then((items) => { if (active) setAnnotations(items); })
      .catch((error) => { if (active) onFileStatus(error instanceof Error ? error.message : '正文标注加载失败'); })
      .finally(() => { if (active) setAnnotationsLoading(false); });
    return () => { active = false; };
  }, [note?.id, onFileStatus, onListAnnotations]);

  useEffect(() => {
    let active = true;
    setLinkedNotes([]);
    if (!note?.id || !inspectorOpen) {
      setLinkedNotesLoading(false);
      return () => { active = false; };
    }
    setLinkedNotesLoading(true);
    void onGetLinkedNotes(note.id)
      .then((items) => { if (active) setLinkedNotes(items); })
      .catch((error) => { if (active) onFileStatus(error instanceof Error ? error.message : '关联链接加载失败'); })
      .finally(() => { if (active) setLinkedNotesLoading(false); });
    return () => { active = false; };
  }, [inspectorOpen, note?.id, onFileStatus, onGetLinkedNotes]);

  useEffect(() => {
    const paper = paperRef.current;
    if (!paper || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => retryScrollRestoreRef.current());
    observer.observe(paper);
    return () => observer.disconnect();
  }, [note?.id]);

  useEffect(() => {
    const stage = documentStageRef.current;
    if (!stage) return;
    const cancelPendingRestore = () => {
      pendingScrollRestoreRef.current = null;
    };
    stage.addEventListener('pointerdown', cancelPendingRestore, { capture: true });
    stage.addEventListener('wheel', cancelPendingRestore, { capture: true, passive: true });
    stage.addEventListener('touchstart', cancelPendingRestore, { capture: true, passive: true });
    stage.addEventListener('keydown', cancelPendingRestore, { capture: true });
    return () => {
      stage.removeEventListener('pointerdown', cancelPendingRestore, { capture: true });
      stage.removeEventListener('wheel', cancelPendingRestore, { capture: true });
      stage.removeEventListener('touchstart', cancelPendingRestore, { capture: true });
      stage.removeEventListener('keydown', cancelPendingRestore, { capture: true });
    };
  }, [note?.id]);

  useEffect(() => () => {
    writeEditorScrollPositions(scrollPositions);
  }, [note?.id, scrollPositions]);

  useEffect(() => {
    setEditPanelMode(null);
    setRepairDialogOpen(false);
  }, [note?.id]);

  retryScrollRestoreRef.current = () => undefined;

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
  const uploadAttachmentFile = async (file: File) => {
    const input = await readAttachmentFile(note.id, file);
    const attachment = await onUploadAttachment(input);
    setAttachments((current) => [attachment, ...current.filter((item) => item.id !== attachment.id)]);
    return attachment;
  };
  const insertImageFile = async (file: File) => {
    assertInlineImageFile(file);
    const attachment = await uploadAttachmentFile(file);
    const inserted = editorRef.current?.insertImage(
      buildAttachmentReferenceUrl(attachment.id),
      attachmentImageAlt(attachment)
    );
    if (!inserted) throw new Error('图片已上传，但未能插入正文');
    onFileStatus('图片已插入正文');
  };
  const insertStoredAttachment = async (attachment: Attachment) => {
    const url = buildAttachmentReferenceUrl(attachment.id);
    const inserted = isInlineImageAttachment(attachment)
      ? editorRef.current?.insertImage(url, attachmentImageAlt(attachment))
      : editorRef.current?.insertLink(url, attachment.fileName);
    if (!inserted) throw new Error('当前编辑状态无法插入附件，请切换到正文编辑模式后重试');
    onFileStatus(isInlineImageAttachment(attachment) ? '图片已插入正文' : '附件链接已插入正文');
  };
  const saveCurrentScrollPosition = () => {
    const stage = documentStageRef.current;
    if (!stage) return;
    captureEditorScrollPosition(scrollPositions, note.id, stage.scrollTop);
    writeEditorScrollPositions(scrollPositions);
  };
  const restoreCurrentScrollPosition = async () => {
    const stage = documentStageRef.current;
    if (
      !stage
      || pendingScrollRestoreRef.current !== note.id
      || scrollRestoreAttemptRef.current
    ) return;
    scrollRestoreAttemptRef.current = true;
    try {
      await nextAnimationFrame();
      await nextAnimationFrame();
      if (documentStageRef.current !== stage || pendingScrollRestoreRef.current !== note.id) return;
      const scrollTop = getEditorScrollTop(scrollPositions, note.id);
      for (let frame = 0; frame < 30 && stage.scrollHeight - stage.clientHeight < scrollTop; frame += 1) {
        await nextAnimationFrame();
        if (documentStageRef.current !== stage || pendingScrollRestoreRef.current !== note.id) return;
      }
      if (stage.scrollHeight - stage.clientHeight < scrollTop) return;
      restoringScrollRef.current = true;
      const stabilizationFrames = scrollTop > 0 ? 30 : 1;
      for (let frame = 0; frame < stabilizationFrames; frame += 1) {
        stage.scrollTop = scrollTop;
        await nextAnimationFrame();
        if (documentStageRef.current !== stage || pendingScrollRestoreRef.current !== note.id) {
          restoringScrollRef.current = false;
          return;
        }
      }
      stage.scrollTop = scrollTop;
      pendingScrollRestoreRef.current = null;
      window.requestAnimationFrame(() => {
        restoringScrollRef.current = false;
      });
    } finally {
      scrollRestoreAttemptRef.current = false;
    }
  };
  retryScrollRestoreRef.current = () => {
    void restoreCurrentScrollPosition();
  };
  const runCommand = (command: EditorCommand) => {
    if (!editorRef.current?.run(command)) return;
    window.requestAnimationFrame(() => editorRef.current?.focus());
  };
  const handleEditAction = async (action: EditorEditAction) => {
    if (action === 'repair-document') {
      setRepairDialogOpen(true);
      return;
    }
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
  const createCurrentAnnotation = async () => {
    if (!canEditContent) throw new Error('阅读模式下无法创建标注');
    const selection = editorRef.current?.getAnnotationSelection();
    if (!selection) throw new Error('请先在正文中选中要标记的文字');
    const markdown = editorRef.current?.getMarkdown() ?? autosave.getLatestMarkdown();
    await autosave.saveNow(markdown);
    const created = await onCreateAnnotation(await buildCreateAnnotationInput(note, markdown, selection));
    setAnnotations((current) => [...current.filter((item) => item.id !== created.id), created]);
    setFocusedAnnotationId(created.id);
    onFileStatus('已标记为重要内容');
  };
  const replaceAnnotation = (updated: Annotation) => {
    setAnnotations((current) => current.map((item) => item.id === updated.id ? updated : item));
  };
  const selectAnnotation = (annotationId: string) => {
    setFocusedAnnotationId(annotationId);
    if (!editorRef.current?.selectAnnotation(annotationId)) onFileStatus('原文位置已变化，请选中新文字后重新定位');
  };
  const reanchorAnnotation = async (annotation: Annotation) => {
    const selection = editorRef.current?.getAnnotationSelection();
    if (!selection) throw new Error('请先在正文中选中新的对应文字');
    const markdown = editorRef.current?.getMarkdown() ?? autosave.getLatestMarkdown();
    await autosave.saveNow(markdown);
    const updated = await onUpdateAnnotationAnchor(
      annotation.id,
      await buildUpdateAnnotationAnchorInput(markdown, selection)
    );
    replaceAnnotation(updated);
    setFocusedAnnotationId(updated.id);
  };
  const openNoteSafely = (targetNoteId: string) => {
    saveCurrentScrollPosition();
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
          saveCurrentScrollPosition();
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
        <div ref={documentStageRef} className={styles.documentStage} data-editor-scroll-root>
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
              onInsertImage={() => imageInputRef.current?.click()}
            />
            <input
              ref={imageInputRef}
              className={styles.nativeFileInput}
              type="file"
              accept={INLINE_IMAGE_ACCEPT}
              aria-label="选择要插入的图片"
              disabled={!canEditContent}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = '';
                if (file) void insertImageFile(file).catch((error) => {
                  onFileStatus(error instanceof Error ? error.message : '图片上传失败');
                });
              }}
            />
            <EditorFindReplacePanel
              mode={editPanelMode}
              editor={editorRef.current}
              onClose={() => setEditPanelMode(null)}
              onStatus={onFileStatus}
            />
            <EditorDocumentRepairDialog
              markdown={draftMarkdown}
              open={repairDialogOpen}
              onOpenChange={setRepairDialogOpen}
              onApply={(markdown, report) => {
                if (!editorRef.current?.replaceMarkdown(markdown)) {
                  onFileStatus('文档内容未变更');
                  return;
                }
                onFileStatus(`已修复 ${report.total} 处异常格式，可使用撤销恢复`);
              }}
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
                    autosave.updateDraft(markdown, { immediate: true });
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
                onInsertImage={() => imageInputRef.current?.click()}
                onCreateAnnotation={() => { void createCurrentAnnotation().catch((error) => onFileStatus(error instanceof Error ? error.message : '创建标注失败')); }}
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
                        annotations={annotations}
                        focusedAnnotationId={focusedAnnotationId}
                        onChange={autosave.updateDraft}
                        onSelectAnnotation={setFocusedAnnotationId}
                        onStatus={onFileStatus}
                        onReady={restoreCurrentScrollPosition}
                        onUploadImage={async (file) => {
                          const attachment = await uploadAttachmentFile(file);
                          return {
                            url: buildAttachmentReferenceUrl(attachment.id),
                            alt: attachmentImageAlt(attachment)
                          };
                        }}
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
          tagGroups={tagGroups}
          markdown={draftMarkdown}
          open={inspectorOpen}
          canWrite={canWrite}
          canInsertAttachment={canEditContent}
          attachments={attachments}
          attachmentsLoading={attachmentsLoading}
          linkedNotes={linkedNotes}
          linkedNotesLoading={linkedNotesLoading}
          annotations={annotations}
          annotationsLoading={annotationsLoading}
          focusedAnnotationId={focusedAnnotationId}
          onClose={onToggleInspector}
          onOpenNote={openNoteSafely}
          onSetTags={onSetTags}
          onCreateTag={onCreateTag}
          onUpdateTag={onUpdateTag}
          onDeleteTag={onDeleteTag}
          onMergeTags={onMergeTags}
          onOpenTagManager={onOpenTagManager}
          onOpenTag={onOpenTag}
          onListVersions={onListVersions}
          onGetVersion={onGetVersion}
          onOrganizeNote={onOrganizeNote}
          onUploadAttachment={uploadAttachmentFile}
          onInsertAttachment={insertStoredAttachment}
          onRenameAttachment={async (attachmentId, fileName) => {
            const updated = await onRenameAttachment(attachmentId, fileName);
            setAttachments((current) => current.map((item) => item.id === updated.id ? updated : item));
            return updated;
          }}
          onDeleteAttachment={async (attachmentId) => {
            await onDeleteAttachment(attachmentId);
            setAttachments((current) => current.filter((item) => item.id !== attachmentId));
          }}
          onCreateAnnotation={createCurrentAnnotation}
          onSelectAnnotation={selectAnnotation}
          onDeleteAnnotation={async (annotationId) => replaceAnnotation(await onDeleteAnnotation(annotationId))}
          onRestoreAnnotation={async (annotationId) => replaceAnnotation(await onRestoreAnnotation(annotationId))}
          onReanchorAnnotation={reanchorAnnotation}
          onNavigateHeading={(_heading, index) => {
            const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
            if (editorRef.current?.navigateToHeading(index, behavior)) return;
            const heading = paperRef.current?.querySelectorAll<HTMLElement>('.ProseMirror h1, .ProseMirror h2, .ProseMirror h3, .ProseMirror h4')[index];
            heading?.scrollIntoView({
              block: 'start',
              behavior
            });
            if (heading) {
              const range = document.createRange();
              const selection = window.getSelection();
              range.selectNodeContents(heading);
              range.collapse(true);
              selection?.removeAllRanges();
              selection?.addRange(range);
              heading.closest<HTMLElement>('.ProseMirror')?.focus({ preventScroll: true });
            }
          }}
        />
      </div>
    </section>
  );
}
