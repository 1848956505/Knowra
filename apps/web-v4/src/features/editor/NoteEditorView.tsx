import { useExtractionEnvironment } from './ExtractionEnvironment';
import type { AttachmentDeleteResult } from '@study-accelerator/web-core';
import { attachmentIdsInText, ApiRequestError } from '@study-accelerator/web-core';
import type { AttachmentActions } from './EditorAttachmentPanel';
import { downloadAttachment, fetchAttachmentBlob } from './attachmentAccess';
import { isAttachmentReferenced } from './attachmentFiles';
import { registerDesktopSave, trackDesktopTask } from '../../app/desktopLifecycle';
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { useDesktopTitlebar } from '../../shell/DesktopTitlebarContext';
import {
  buildExportFileName,
  type Annotation,
  type Attachment,
  type CreateAnnotationInput,
  type Folder,
  type Note,
  type NoteVersion,
  type NoteVersionPage,
  type NoteVersionPageOptions,
  type NoteVersionPrunePreview,
  type Tag,
  type TagColor,
  type TagGroup,
  type UpdateAnnotationAnchorInput,
  type UpdateAnnotationInput,
  type AnnotationPreview,
  type AnnotationKnowledgeLinks,
  type AnalysisScopeInput,
  type AnalysisScopePreview,
  type UploadAttachmentInput
} from '@study-accelerator/web-core';
import { calculateContentHash } from '@study-accelerator/content-anchor';
import { downloadTextFile } from '../../browser/downloadFile';
import { exportElementToPdf } from '../../browser/exportPdf';
import { Button, Dialog, DialogBody, DialogFooter, DialogClose } from '../../components/ui';
import { ChevronRightIcon, NoteIcon, PanelIcon } from '../../components/icons/knowra';
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
import { noteDraftRecovery } from './noteDraftRecovery';
import { getNoteDraftScope } from './noteDraftScope';
import { useNoteAutosave } from './useNoteAutosave';
import { useEditorInspectorData } from './useEditorInspectorData';
import { buildCreateAnnotationInput, buildUpdateAnnotationAnchorInput, canContinueListAnnotation, type AnnotationSelection } from './annotationPayloads';
import {
  INLINE_IMAGE_ACCEPT,
  assertInlineImageFile,
  attachmentImageAlt,
  buildAttachmentReferenceUrl,
  isInlineImageAttachment,
  readAttachmentFile
} from './attachmentFiles';
import styles from './NoteEditorView.module.css';
import { EditorNoteLinkDialog } from './EditorNoteLinkDialog';
import { useNoteLinkRelations } from './useNoteLinkRelations';
import { requestNoteLinkNavigation, takeNoteLinkNavigation } from './editorLinkNavigation';
import { buildFolderPath } from './editorInspectorModel';
import type { NoteLinkEditSession } from './editorNoteLinks';
import type { NoteLinkLocator } from '@study-accelerator/content-anchor';

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
  onReturnToList?(): void;
  onCreateFolder(): void;
  onImportMarkdown(): void;
  onRenameNote(title: string): Promise<void>;
  onSaveMarkdown(noteId: string, markdown: string, expectedUpdatedAt?: string, baseMarkdown?: string, annotationMapping?: import('@study-accelerator/web-core').AnnotationMapping): Promise<Note>;
  onDraftStateChange?(hasLocalChanges: boolean, error?: string | null): void;
  extendedWritesEnabled?: boolean;
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
  onListVersionPage?(noteId: string, options?: NoteVersionPageOptions): Promise<NoteVersionPage>;
  onPreviewVersionPrune?(noteId: string): Promise<NoteVersionPrunePreview>;
  onSaveVersionAs?(version: NoteVersion): Promise<void>;
  onGetVersion(noteId: string, versionId: string): Promise<NoteVersion>;
  onOrganizeNote(input: { folderId: string | null; status: string }): Promise<void>;
  onListAttachments(noteId: string): Promise<Attachment[]>;
  onUploadAttachment(input: UploadAttachmentInput): Promise<Attachment>;
  onRenameAttachment(attachmentId: string, fileName: string): Promise<Attachment>;
  onDeleteAttachment(attachmentId: string): Promise<AttachmentDeleteResult | void>;
  attachmentActions?: AttachmentActions;
  onGetLinkedNotes(noteId: string): Promise<Note[]>;
  onGetNoteLinkRelations?(noteId: string): Promise<import('@study-accelerator/web-core').NoteLinkRelations>;
  onSearchLinkNotes?: import('@study-accelerator/web-core').CommandNoteSearcher;
  onListAnnotations(noteId: string): Promise<Annotation[]>;
  onCreateAnnotation(input: CreateAnnotationInput): Promise<Annotation>;
  onDeleteAnnotation(annotationId: string, expectedRevision?: number): Promise<Annotation>;
  onRestoreAnnotation?(annotationId: string, expectedRevision?: number): Promise<Annotation>;
  onUpdateAnnotationAnchor(annotationId: string, input: UpdateAnnotationAnchorInput): Promise<Annotation>;
  onUpdateAnnotation?(annotationId: string, input: UpdateAnnotationInput): Promise<Annotation>;
  onConfirmAnnotationRange?(annotationId: string, input: import('@study-accelerator/web-core').ConfirmAnnotationRangeInput): Promise<Annotation>;
  onPreviewAnnotation?(annotationId: string): Promise<AnnotationPreview>;
  onGetAnnotationKnowledgeLinks?(annotationId: string): Promise<AnnotationKnowledgeLinks>;
  onCreateKnowledgeCandidate?(annotation: Annotation): Promise<void>;
  onOpenKnowledgeItem?(itemId: string): void;
  onExtractWithAssistant?(noteId: string): void;
  knowledgeWriteDisabledReason?: string;
  onPreviewAnalysisScope?(input: AnalysisScopeInput): Promise<AnalysisScopePreview>;
  onCreateAnalysisScope?(input: AnalysisScopeInput & { previewHash: string; idempotencyKey: string }): Promise<{ id: string }>;
  onListAnalysisScopes?(spaceId: string): Promise<import('@study-accelerator/web-core').AnalysisScopeSnapshot[]>;
  onTrashAnalysisScope?(id: string, input: { spaceId: string; expectedUpdatedAt: string }): Promise<import('@study-accelerator/web-core').AnalysisScopeSnapshot>;
  onRestoreAnalysisScope?(id: string, input: { spaceId: string; expectedUpdatedAt: string }): Promise<import('@study-accelerator/web-core').AnalysisScopeSnapshot>;
  onCreateAnnotationExclusion?(annotationId: string, input: { expectedRevision: number; noteContentHash: string; anchor: import('@study-accelerator/web-core').ContentAnchor }): Promise<{ annotation: Annotation }>;
  onDeleteAnnotationExclusion?(annotationId: string, exclusionId: string, expectedRevision: number): Promise<{ annotation: Annotation }>;
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
  onReturnToList,
  onCreateFolder,
  onImportMarkdown,
  onRenameNote,
  onSaveMarkdown,
  onDraftStateChange,
  extendedWritesEnabled = true,
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
  onListVersionPage,
  onPreviewVersionPrune,
  onSaveVersionAs,
  onGetVersion,
  onOrganizeNote,
  onListAttachments,
  onUploadAttachment,
  onRenameAttachment,
  onDeleteAttachment,
  attachmentActions,
  onGetLinkedNotes,
  onGetNoteLinkRelations,
  onSearchLinkNotes,
  onListAnnotations,
  onCreateAnnotation,
  onDeleteAnnotation,
  onRestoreAnnotation,
  onUpdateAnnotationAnchor,
  onUpdateAnnotation,
  onPreviewAnnotation,
  onConfirmAnnotationRange,
  onGetAnnotationKnowledgeLinks,
  onCreateKnowledgeCandidate,
  onOpenKnowledgeItem,
  onExtractWithAssistant,
  knowledgeWriteDisabledReason,
  onPreviewAnalysisScope,
  onCreateAnalysisScope,
  onListAnalysisScopes,
  onTrashAnalysisScope,
  onRestoreAnalysisScope,
  onCreateAnnotationExclusion,
  onDeleteAnnotationExclusion,
  onFileStatus,
  onViewAction,
  onToggleFavorite,
  onToggleInspector
}: NoteEditorViewProps) {
  const desktopTitlebar = useDesktopTitlebar();
  const documentStageRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLElement>(null);
  const toolbarAnchorRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorCommandTarget>(null);
  const annotationCreateInputsRef = useRef(new Map<string, { markdown: string; selection: AnnotationSelection; input: CreateAnnotationInput }>());
  const annotationCreatePendingRef = useRef(false);
  const versionWriteStateRef = useRef({ noteId: note?.id, canWrite });
  versionWriteStateRef.current = { noteId: note?.id, canWrite };
  const annotationWriteStateRef = useRef({ noteId: note?.id, editable: false });
  const annotationEditable = Boolean(note && canWrite && view.contentMode === 'edit' && !view.showSourceEditor);
  if (annotationWriteStateRef.current.noteId !== note?.id || annotationWriteStateRef.current.editable !== annotationEditable) {
    annotationWriteStateRef.current = { noteId: note?.id, editable: annotationEditable };
  }
  const annotationMountedRef = useRef(true);
  useLayoutEffect(() => {
    annotationMountedRef.current = true;
    return () => { annotationMountedRef.current = false; };
  }, []);
  const documentHeaderRef = useRef<EditorDocumentHeaderHandle>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const pendingScrollRestoreRef = useRef<string | null>(null);
  const restoringScrollRef = useRef(false);
  const scrollRestoreAttemptRef = useRef(false);
  const retryScrollRestoreRef = useRef<() => void>(() => undefined);
  const [bodySavedToken, setBodySavedToken] = useState<string | null>(null);
  const [bodyPreview, setBodyPreview] = useState<{ name: string; url: string } | null>(null);
  useEffect(() => () => { if (bodyPreview) URL.revokeObjectURL(bodyPreview.url); }, [bodyPreview]);
  useEffect(() => { setBodyPreview(null); setBodySavedToken(null); }, [note?.id]);
  const [toolbarPinned, setToolbarPinned] = useState(false);
  const [documentEdge, setDocumentEdge] = useState<number | null>(null);
  const [editPanelMode, setEditPanelMode] = useState<EditorFindMode | null>(null);
  const [repairDialogOpen, setRepairDialogOpen] = useState(false);
  const [discardDraftOpen, setDiscardDraftOpen] = useState(false);
  const [overlappingAnnotationIds, setOverlappingAnnotationIds] = useState<string[]>([]);
  useEffect(() => setOverlappingAnnotationIds([]), [note?.id]);
  const [scrollPositions] = useState(readEditorScrollPositions);
  const autosave = useNoteAutosave({
    noteId: note?.id ?? 'missing-note',
    draftScope: getNoteDraftScope(note?.spaceId),
    remoteMarkdown: note?.rawMarkdown ?? '',
    remoteUpdatedAt: note?.updatedAt,
    canWrite: Boolean(note && canWrite),
    onSave: onSaveMarkdown
  });
  useEffect(() => registerDesktopSave(async (mode) => {
    const markdown = view.showSourceEditor ? autosave.getLatestMarkdown() : editorRef.current?.getMarkdown();
    if (markdown !== undefined && markdown !== autosave.getLatestMarkdown()) {
      autosave.updateDraft(markdown, { immediate: true });
    }
    if (mode !== 'recovery' && markdown !== undefined && (autosave.hasLocalChanges || markdown !== note?.rawMarkdown)) {
      await autosave.saveNow(markdown);
    }
  }, 0), [autosave, note?.rawMarkdown, view.showSourceEditor]);

  const extractionEnvironment = useExtractionEnvironment();
  const analysisContext = useRef({ noteId: note?.id, spaceId: note?.spaceId, canWrite, scope: extractionEnvironment.scopeKey,
    markdown: () => view.showSourceEditor ? autosave.getLatestMarkdown() : editorRef.current?.getMarkdown() ?? autosave.getLatestMarkdown() });
  analysisContext.current = { noteId: note?.id, spaceId: note?.spaceId, canWrite, scope: extractionEnvironment.scopeKey,
    markdown: () => view.showSourceEditor ? autosave.getLatestMarkdown() : editorRef.current?.getMarkdown() ?? autosave.getLatestMarkdown() };
  async function previewSavedAnalysis(input: AnalysisScopeInput) {
    const before = analysisContext.current;
    const markdown = before.markdown();
    if (!before.canWrite || !before.noteId || input.spaceId !== before.spaceId || !onPreviewAnalysisScope) throw new Error('当前笔记无法预览分析范围。');
    const stillCurrent = () => annotationMountedRef.current && analysisContext.current.canWrite
      && analysisContext.current.noteId === before.noteId && analysisContext.current.spaceId === before.spaceId
      && analysisContext.current.scope === before.scope && analysisContext.current.markdown() === markdown;
    await autosave.saveNow(markdown);
    if (!stillCurrent()) throw new Error('保存期间笔记或草稿已变化，请重新预览。');
    const preview = await onPreviewAnalysisScope(input);
    if (!stillCurrent()) throw new Error('预览期间笔记或草稿已变化，请重新预览。');
    return preview;
  }
  const draftMarkdown = autosave.draftMarkdown;
  const canEditContent = canWrite && view.contentMode === 'edit' && !view.showSourceEditor;
  const [linkEdit, setLinkEdit] = useState<{ noteId: string; scope: string | undefined; session: NoteLinkEditSession } | null>(null);
  const [linkNavigationNotice, setLinkNavigationNotice] = useState<{ noteId: string; scope: string | undefined } | null>(null);
  const linkScope = getNoteDraftScope(note?.spaceId);
  const linkContext = useRef({ noteId: note?.id, scope: linkScope, canEditContent });
  if (linkContext.current.noteId !== note?.id || linkContext.current.scope !== linkScope || linkContext.current.canEditContent !== canEditContent) {
    linkContext.current = { noteId: note?.id, scope: linkScope, canEditContent };
  }
  const relationRefreshKey = notes;
  const noteLinks = useNoteLinkRelations(note?.id, note?.spaceId, relationRefreshKey, onGetNoteLinkRelations);
  const noteLinkStatuses = Object.fromEntries((noteLinks.relations?.outgoing ?? []).map(item => [item.id, item.status]));
  useEffect(() => {
    onDraftStateChange?.(autosave.hasLocalChanges, autosave.saveError);
  }, [autosave.hasLocalChanges, autosave.saveError, onDraftStateChange]);
  useEffect(() => () => onDraftStateChange?.(false), [onDraftStateChange]);
  const {
    attachments, setAttachments, attachmentsLoading,
    linkedNotes, linkedNotesLoading,
    annotations, setAnnotations, annotationsLoading,
    focusedAnnotationId, setFocusedAnnotationId
  } = useEditorInspectorData({
    noteId: note?.id,
    refreshKey: note?.updatedAt,
    inspectorOpen,
    onListAttachments,
    onGetLinkedNotes,
    onListAnnotations,
    onError: onFileStatus
  });

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

  const uploadAttachmentFile = (file: File) => trackDesktopTask(async () => {
    const input = await readAttachmentFile(note.id, file);
    const attachment = await onUploadAttachment(input);
    if (versionWriteStateRef.current.noteId === note.id) setAttachments((current) => [attachment, ...current.filter((item) => item.id !== attachment.id)]);
    return attachment;
  });
  const insertImageFile = (file: File) => trackDesktopTask(async () => {
    assertInlineImageFile(file);
    const attachment = await uploadAttachmentFile(file);
    if (versionWriteStateRef.current.noteId !== note.id) throw new Error('图片已上传，笔记已切换，未插入正文');
    const inserted = editorRef.current?.insertImage(
      buildAttachmentReferenceUrl(attachment.id),
      attachmentImageAlt(attachment)
    );
    if (!inserted) throw new Error('图片已上传，但未能插入正文');
    onFileStatus('图片已插入正文');
  });
  const insertStoredAttachment = async (attachment: Attachment) => {
    if (attachment.status !== 'ready') throw new Error('附件尚不可用，请先核验或恢复');
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
        'context-changed': '正文、选区或编辑状态已变化，已取消剪切，请重新选择',
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
  const createCurrentAnnotation = async (scopeType: 'selection' | 'blocks' | 'section' | 'list' = 'selection', importance: 'normal' | 'important' | 'core' = 'normal') => {
    if (!canEditContent) throw new Error('阅读模式下无法创建标注');
    if (annotationCreatePendingRef.current) return;
    const context = annotationWriteStateRef.current;
    const editor = editorRef.current;
    let selection = editor?.getAnnotationSelection(scopeType);
    if (!selection) throw new Error(scopeType === 'list' ? '请先将光标放在非空的普通列表项内' : scopeType === 'section' ? '请先将光标放在标题章节内' : '请先在正文中选中要标记的内容');
    let markdown = editorRef.current?.getMarkdown() ?? autosave.getLatestMarkdown();
    let selectionSignature = JSON.stringify(selection);
    const assertCurrent = () => {
      if (!annotationMountedRef.current || annotationWriteStateRef.current !== context || editorRef.current !== editor
        || editor?.getMarkdown() !== markdown || JSON.stringify(editor.getAnnotationSelection(scopeType, { restoreSelection: false })) !== selectionSignature) {
        throw new Error('正文、选区或编辑状态已变化，请重新选择章节或内容');
      }
    };
    const initialSignature = JSON.stringify([note.id, calculateContentHash(markdown), scopeType, selection.anchor, importance]);
    const unresolved = [...annotationCreateInputsRef.current.entries()].find(([signature, request]) =>
      signature === initialSignature || request.input.noteId === note.id && request.input.importance === importance
        && canContinueListAnnotation(request.markdown, markdown, request.selection, selection ?? null));
    annotationCreatePendingRef.current = true;
    try {
      // 最多跟进三轮原列表项内的继续输入，避免持续打字时无限等待。
      for (let attempt = 0; ; attempt++) {
        assertCurrent();
        await autosave.saveNow(markdown);
        if (!annotationMountedRef.current || annotationWriteStateRef.current !== context || editorRef.current !== editor) {
          throw new Error('正文、选区或编辑状态已变化，请重新选择章节或内容');
        }
        const latestMarkdown = editor!.getMarkdown();
        if (latestMarkdown === markdown) { assertCurrent(); break; }
        const latestSelection = editor!.getAnnotationSelection(scopeType, { restoreSelection: false });
        if (attempt >= 2 || !canContinueListAnnotation(markdown, latestMarkdown, selection, latestSelection)) {
          throw new Error('正文、选区或编辑状态已变化，请重新选择章节或内容');
        }
        markdown = latestMarkdown;
        selection = latestSelection;
        selectionSignature = JSON.stringify(selection);
      }
      const signature = JSON.stringify([note.id, calculateContentHash(markdown), scopeType, selection.anchor, importance]);
      // 未确认的请求须保持原 payload/key，服务端会先恢复幂等结果，再校验正文版本。
      const requestKey = unresolved?.[0] ?? signature;
      const request = unresolved?.[1] ?? { markdown, selection, input: await buildCreateAnnotationInput(note, markdown, selection, importance) };
      assertCurrent();
      annotationCreateInputsRef.current.set(requestKey, request);
      let created: Annotation;
      try { created = await onCreateAnnotation(request.input); }
      catch (error) {
        // 该明确冲突在服务端幂等查询之后抛出，证明旧请求未创建，下一次显式操作可用最新正文。
        if (error instanceof ApiRequestError && error.code === 'ANNOTATION_CONTENT_CONFLICT') annotationCreateInputsRef.current.delete(requestKey);
        throw error;
      }
      annotationCreateInputsRef.current.delete(requestKey);
      if (!annotationMountedRef.current || annotationWriteStateRef.current !== context) return;
      setAnnotations((current) => [...current.filter((item) => item.id !== created.id), created]);
      setFocusedAnnotationId(created.id);
      onFileStatus('已标为重点');
    } finally { annotationCreatePendingRef.current = false; }
  };
  const replaceAnnotation = (updated: Annotation) => {
    setAnnotations((current) => current.map((item) => item.id === updated.id ? updated : item));
  };
  const selectAnnotation = (annotationId: string) => {
    setOverlappingAnnotationIds([]);
    setFocusedAnnotationId(annotationId);
    if (!editorRef.current?.selectAnnotation(annotationId)) onFileStatus('原文位置已变化，请重新选择来源');
  };
  const prepareAnnotationWrite = async (annotation: Annotation, scope: 'selection' | 'blocks' | 'section' | 'list') => {
    const context = annotationWriteStateRef.current;
    const editor = editorRef.current;
    if (!annotationMountedRef.current || !context.editable || context.noteId !== annotation.noteId || !editor) throw new Error('笔记或编辑状态已变化，请重新选择');
    const selection = editor.getAnnotationSelection(scope);
    if (!selection) throw new Error('请先在正文中选择对应内容');
    const markdown = editor.getMarkdown();
    const signature = JSON.stringify(selection);
    const assertCurrent = () => {
      if (!annotationMountedRef.current || annotationWriteStateRef.current !== context || editorRef.current !== editor
        || editor.getMarkdown() !== markdown || JSON.stringify(editor.getAnnotationSelection(scope, { restoreSelection: false })) !== signature) {
        throw new Error('正文、选区或编辑状态已变化，请重新选择');
      }
    };
    await autosave.saveNow(markdown);
    assertCurrent();
    const items = await onListAnnotations(annotation.noteId);
    assertCurrent();
    const latest = items.find(item => item.id === annotation.id && item.noteId === annotation.noteId);
    if (!latest || latest.deletedAt || latest.lifecycleStatus && latest.lifecycleStatus !== 'active') throw new Error('标注状态已变化，请刷新后重试');
    return { markdown, selection, revision: latest.revision ?? 1, assertCurrent,
      isCurrentNote: () => annotationMountedRef.current && annotationWriteStateRef.current === context };
  };
  const reanchorAnnotation = async (annotation: Annotation) => {
    const prepared = await prepareAnnotationWrite(annotation, annotation.scopeType ?? 'selection');
    const input = await buildUpdateAnnotationAnchorInput(prepared.markdown, prepared.selection, prepared.revision);
    prepared.assertCurrent();
    const updated = await onUpdateAnnotationAnchor(
      annotation.id,
      input
    );
    if (prepared.isCurrentNote()) { replaceAnnotation(updated); setFocusedAnnotationId(updated.id); }
  };
  const excludeCurrentBlock = async (annotation: Annotation) => {
    if (!onCreateAnnotationExclusion) throw new Error('当前环境不支持局部排除');
    const prepared = await prepareAnnotationWrite(annotation, 'blocks');
    prepared.assertCurrent();
    const result = await onCreateAnnotationExclusion(annotation.id, {
      expectedRevision: prepared.revision,
      noteContentHash: calculateContentHash(prepared.markdown),
      anchor: prepared.selection.anchor
    });
    if (prepared.isCurrentNote()) { replaceAnnotation(result.annotation); onFileStatus('已从所属重点中排除当前内容块'); }
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
  const openLinkedNote = async (targetNoteId: string, locator?: NoteLinkLocator) => {
    if (!note || !onGetNoteLinkRelations) return;
    const before = linkContext.current;
    const markdown = editorRef.current?.getMarkdown() ?? autosave.getLatestMarkdown();
    try {
      if (!canWrite && autosave.hasLocalChanges) throw new Error('当前正文尚未保存，请先处理草稿');
      await saveImmediately();
      if (!annotationMountedRef.current) return;
      if (linkContext.current !== before || (editorRef.current?.getMarkdown() ?? autosave.getLatestMarkdown()) !== markdown) throw new Error('保存期间来源已变化，请重试');
      const relations = await onGetNoteLinkRelations(locator ? targetNoteId : note.id);
      if (!annotationMountedRef.current) return;
      if (linkContext.current !== before || (editorRef.current?.getMarkdown() ?? autosave.getLatestMarkdown()) !== markdown) throw new Error('跳转期间来源已变化，请重试');
      if (relations.noteId !== (locator ? targetNoteId : note.id) || relations.spaceId !== note.spaceId) throw new Error('引用查询已失效');
      if (!locator && !relations.outgoing.some(item => item.id === targetNoteId && item.status === 'active')) throw new Error('目标已删除或链接已移除');
      saveCurrentScrollPosition();
      if (locator) requestNoteLinkNavigation(targetNoteId, linkScope, locator, relations.contentHash);
      onOpenNote(targetNoteId);
    } catch (cause) { if (annotationMountedRef.current) onFileStatus(cause instanceof Error ? cause.message : '跳转失败'); }
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

  const handleEditorPageKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!(event.target instanceof HTMLElement) || !event.target.closest('.ProseMirror')) return;
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    const mod = event.metaKey || event.ctrlKey;
    if (!mod) return;
    const key = event.key.toLowerCase();
    if (((event.metaKey && event.ctrlKey && !event.altKey) || (event.ctrlKey && event.altKey && !event.metaKey))
      && !event.shiftKey && key === 'i' && canEditContent && extendedWritesEnabled) {
      event.preventDefault();
      event.stopPropagation();
      imageInputRef.current?.click();
    } else if (event.altKey) {
      return;
    } else if (!event.shiftKey && key === 'f') {
      event.preventDefault();
      setEditPanelMode('find');
    } else if (!event.shiftKey && key === 'h' && canEditContent) {
      event.preventDefault();
      setEditPanelMode('replace');
    } else if (key === 's' && canWrite) {
      event.preventDefault();
      void handleFileAction(event.shiftKey ? 'save-as' : 'save')
        .catch((error) => onFileStatus(error instanceof Error ? error.message : '保存失败'));
    }
  };

  const handleAttachmentLink = (event: MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.button !== 1) return;
    const element = event.target instanceof Element ? event.target.closest('a[href]') : null;
    const href = element?.getAttribute('href');
    const id = href ? attachmentIdsInText(href)[0] : undefined;
    if (!id) return;
    event.preventDefault(); event.stopPropagation();
    void trackDesktopTask(async () => {
      const attachment = attachments.find(item => item.id === id) ?? (await onListAttachments('')).find(item => item.id === id);
      if (!attachment) throw new Error('附件不存在');
      if (attachment.status !== 'ready') throw new Error('附件尚不可用，请先核验或恢复原文件');
      if (isInlineImageAttachment(attachment)) {
        const blob = await fetchAttachmentBlob(id);
        if (versionWriteStateRef.current.noteId === note.id) setBodyPreview({ name: attachment.fileName, url: URL.createObjectURL(blob) });
      } else {
        const token = await downloadAttachment(attachment);
        if (versionWriteStateRef.current.noteId === note.id) setBodySavedToken(token);
      }
    }).catch(async error => {
      if (versionWriteStateRef.current.noteId !== note.id) return;
      onFileStatus(error instanceof Error ? error.message : '附件读取失败');
      const items = await onListAttachments(note.id).catch(() => null);
      if (items && versionWriteStateRef.current.noteId === note.id) setAttachments(items);
    });
  };

  const tabs = note ? <EditorTabs
    notes={openNotes.length > 0 ? openNotes : [note]}
    activeNoteId={note.id}
    canWrite={canWrite}
    windowTitlebar={desktopTitlebar.enabled}
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
  /> : null;

  return (
    <section
      className={styles.editor}
      onKeyDownCapture={handleEditorPageKeyDown}
      data-view-mode={view.mode}
      data-content-mode={view.contentMode}
      data-inspector-open={inspectorOpen || undefined}
      data-window-tabs={desktopTitlebar.enabled || undefined}
      aria-label="笔记编辑页面骨架"
      style={documentEdge === null ? undefined : { '--doc-edge': `${documentEdge}px` } as CSSProperties}
    >
      {desktopTitlebar.enabled
        ? desktopTitlebar.host && tabs ? createPortal(tabs, desktopTitlebar.host) : null
        : tabs}
      {!desktopTitlebar.enabled ? <div className={styles.compactControls} role="group" aria-label="笔记导航与检查器">
        <Button variant="ghost" size="compact" onPress={() => {
          saveCurrentScrollPosition();
          if (!canWrite) { onReturnToList?.(); return; }
          void saveImmediately().then(() => onReturnToList?.())
            .catch(error => onFileStatus(error instanceof Error ? error.message : '返回前保存失败'));
        }}><span className={styles.backArrow}><ChevronRightIcon size={16} /></span>笔记列表</Button>
        <Button variant="ghost" size="compact" aria-label="打开文档检查器" aria-pressed={inspectorOpen} onPress={onToggleInspector}><PanelIcon size={16} />检查器</Button>
      </div> : null}
      {bodySavedToken ? <div className={styles.attachmentDownloadNotice} role="status"><span>附件已保存</span><Button size="compact" onPress={() => void trackDesktopTask(async () => { await window.knowraDesktop?.openSavedAttachment?.(bodySavedToken); }).catch(error => onFileStatus(String(error)))}>打开已保存附件</Button><Button variant="ghost" size="mini" onPress={() => setBodySavedToken(null)}>关闭</Button></div> : null}
      {bodyPreview ? <Dialog title={bodyPreview.name} isOpen onOpenChange={open => { if (!open) setBodyPreview(null); }}><DialogBody><img src={bodyPreview.url} alt={bodyPreview.name} className={styles.attachmentPreviewImage} /></DialogBody></Dialog> : null}
      <div className={styles.workspace}>
        <div ref={documentStageRef} className={styles.documentStage} data-editor-scroll-root onClickCapture={handleAttachmentLink} onAuxClickCapture={handleAttachmentLink}>
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
              canInsertImage={extendedWritesEnabled}
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
              disabled={!canEditContent || !extendedWritesEnabled}
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
            {linkNavigationNotice?.noteId === note.id && linkNavigationNotice.scope === linkScope ? <div className={styles.linkNotice} role="status">
              <span>引用位置或来源版本已变化，已打开来源笔记</span>
              <Button variant="ghost" size="mini" onPress={() => setLinkNavigationNotice(null)}>关闭提示</Button>
            </div> : null}
            {linkEdit?.noteId === note.id && linkEdit.scope === linkScope ? <EditorNoteLinkDialog
              session={linkEdit.session} spaceId={note.spaceId ?? ''} search={onSearchLinkNotes}
              folderPath={id => buildFolderPath(id ? foldersById[id] ?? null : null, foldersById)}
              canWrite={canEditContent}
              onClose={() => { setLinkEdit(null); window.requestAnimationFrame(() => editorRef.current?.focus()); }}
              onApply={async (targetId, label) => {
                if (!canEditContent || linkEdit.noteId !== note.id || linkEdit.scope !== linkScope) throw new Error('笔记或编辑状态已变化，请重新选择');
                if (linkContext.current.noteId !== linkEdit.noteId || linkContext.current.scope !== linkEdit.scope || !linkContext.current.canEditContent
                  || !editorRef.current?.applyNoteLinkEdit?.(linkEdit.session, targetId, label)) throw new Error('正文或选区已变化，请重新选择');
                await saveImmediately();
              }}
            /> : null}
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
            {autosave.saveError || autosave.hasConflict ? (
              <div className={styles.saveConflict} role="alert">
                <div>
                  <strong>正文尚未保存</strong>
                  <p>{autosave.saveError ?? '请重试保存或导出草稿核对，系统不会自动覆盖冲突版本。'}</p>
                </div>
                <Button variant="default" onPress={() => { void autosave.saveNow().catch(error => onFileStatus(error instanceof Error ? error.message : '保存失败')); }}>重试保存</Button>
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
                <Button
                  variant="default"
                  onPress={() => {
                    void noteDraftRecovery.flush().then(() => window.location.reload()).catch(error => onFileStatus(error instanceof Error ? error.message : '草稿写入失败'));
                  }}
                >
                  保留草稿并重新加载
                </Button>
                <Button variant="ghost" onPress={() => setDiscardDraftOpen(true)}>放弃草稿…</Button>
                <Dialog title="放弃本地草稿？" isOpen={discardDraftOpen} onOpenChange={setDiscardDraftOpen}>
                  <DialogBody>请先确认需要保留的正文已经另存。继续会删除此笔记的恢复草稿，并加载最新已保存正文。</DialogBody>
                  <DialogFooter><DialogClose variant="ghost">取消</DialogClose>
                    <Button onPress={() => { autosave.discardRecoveredDraft(); void noteDraftRecovery.flush().then(() => window.location.reload()).catch(error => onFileStatus(String(error))); }}>确认放弃并加载</Button>
                  </DialogFooter>
                </Dialog>
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
                extendedWritesEnabled={extendedWritesEnabled}
                onRunCommand={runCommand}
                onEditAction={(action) => { void handleEditAction(action); }}
                onInsertImage={() => imageInputRef.current?.click()}
                onCreateAnnotation={() => { void createCurrentAnnotation('selection').catch((error) => onFileStatus(error instanceof Error ? error.message : '创建标注失败')); }}
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
                        onCreateAnnotation={extendedWritesEnabled ? createCurrentAnnotation : undefined}
                        annotations={annotations}
                        focusedAnnotationId={focusedAnnotationId}
                        onChange={autosave.updateDraft}
                        onSelectAnnotation={(ids) => {
                          if (ids.length === 1) {
                            setOverlappingAnnotationIds([]);
                            setFocusedAnnotationId(ids[0]);
                          } else {
                            setOverlappingAnnotationIds(ids);
                            if (!inspectorOpen) onToggleInspector();
                          }
                        }}
                        onStatus={onFileStatus}
                        onRequestNoteLink={session => setLinkEdit({ noteId: note.id, scope: linkScope, session })}
                        onOpenNoteLink={locator => { void openLinkedNote(locator.targetNoteId); }}
                        noteLinkStatuses={noteLinkStatuses}
                        onReady={async () => {
                          const readyContext = linkContext.current;
                          await restoreCurrentScrollPosition();
                          if (!annotationMountedRef.current || linkContext.current !== readyContext || readyContext.noteId !== note.id) return;
                          const navigation = takeNoteLinkNavigation(note.id, linkScope);
                          if (navigation) {
                            const located = calculateContentHash(note.rawMarkdown) === navigation.contentHash
                              && editorRef.current?.matchesMarkdownDocument?.(note.rawMarkdown)
                              && editorRef.current?.selectNoteLinkOccurrence?.(navigation.locator);
                            setLinkNavigationNotice(located ? null : { noteId: note.id, scope: linkScope });
                          }
                        }}
                        onUploadImage={async (file) => {
                          if (!extendedWritesEnabled) throw new Error('离线附件上传尚未开放，请先保留原文件。');
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
      </div>
      <EditorInspector
          nativeTitlebar={desktopTitlebar.enabled}
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
          extendedWritesEnabled={extendedWritesEnabled}
          attachmentActions={attachmentActions ? { ...attachmentActions,
            refreshAttachments: async () => {
              const items = await onListAttachments(note.id);
              if (versionWriteStateRef.current.noteId === note.id) setAttachments(items);
            },
            verifyNoteAttachment: async id => {
              const updated = await attachmentActions.verifyNoteAttachment(id);
              if (versionWriteStateRef.current.noteId === note.id) setAttachments(current => current.map(item => item.id === id ? updated : item));
              return updated;
            },
            restoreNoteAttachment: async (id, bytes) => {
              const updated = await attachmentActions.restoreNoteAttachment(id, bytes);
              if (versionWriteStateRef.current.noteId === note.id) setAttachments(current => current.map(item => item.id === id ? updated : item));
              return updated;
            }
          } : undefined}
          attachments={attachments}
          attachmentsLoading={attachmentsLoading}
          linkedNotes={linkedNotes}
          linkedNotesLoading={linkedNotesLoading}
          noteLinkRelations={noteLinks.relations}
          noteLinkRelationsLoading={noteLinks.loading}
          noteLinkRelationsError={noteLinks.error}
          onOpenLinkedOccurrence={(sourceId, locator) => { void openLinkedNote(sourceId, locator); }}
          onOpenLinkedNote={id => { void openLinkedNote(id); }}
          annotations={annotations}
          annotationsLoading={annotationsLoading}
          focusedAnnotationId={focusedAnnotationId}
          overlappingAnnotationIds={overlappingAnnotationIds}
          onClearOverlappingAnnotations={() => setOverlappingAnnotationIds([])}
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
          onListVersionPage={onListVersionPage}
          onPreviewVersionPrune={onPreviewVersionPrune}
          onRestoreVersion={async (version) => {
            if (!canWrite || version.noteId !== note.id) throw new Error('当前状态无法恢复此历史记录');
            const current = view.showSourceEditor ? autosave.getLatestMarkdown() : editorRef.current?.getMarkdown() ?? autosave.getLatestMarkdown();
            await autosave.saveNow(current);
            if (!versionWriteStateRef.current.canWrite || versionWriteStateRef.current.noteId !== note.id) throw new Error('笔记或写入状态已改变，请重新打开历史记录');
            const latest = view.showSourceEditor ? autosave.getLatestMarkdown() : editorRef.current?.getMarkdown() ?? autosave.getLatestMarkdown();
            if (latest !== current) throw new Error('保存期间正文又有修改，请重新检查差异后恢复');
            autosave.updateDraft(version.content, { immediate: true });
            editorRef.current?.setMarkdown(version.content);
            await autosave.saveNow(version.content);
            onFileStatus('已恢复历史正文；恢复前的正文已保留在历史记录中');
          }}
          onSaveVersionAs={onSaveVersionAs ? async (version) => {
            if (!canWrite || version.noteId !== note.id) throw new Error('当前状态无法另存此历史记录');
            await saveImmediately();
            if (!versionWriteStateRef.current.canWrite || versionWriteStateRef.current.noteId !== note.id) throw new Error('笔记或写入状态已改变，请重新打开历史记录');
            await onSaveVersionAs(version);
          } : undefined}
          onGetVersion={onGetVersion}
          onOrganizeNote={onOrganizeNote}
          onUploadAttachment={uploadAttachmentFile}
          onInsertAttachment={insertStoredAttachment}
          onRenameAttachment={async (attachmentId, fileName) => {
            const updated = await onRenameAttachment(attachmentId, fileName);
            if (versionWriteStateRef.current.noteId === note.id) setAttachments((current) => current.map((item) => item.id === updated.id ? updated : item));
            return updated;
          }}
          onDeleteAttachment={async (attachmentId) => {
            const currentMarkdown = view.showSourceEditor ? autosave.getLatestMarkdown() : editorRef.current?.getMarkdown() ?? autosave.getLatestMarkdown();
            if (isAttachmentReferenced(currentMarkdown, attachmentId)) throw new Error('当前正文或草稿仍引用此附件，请先移除引用');
            await autosave.saveNow(currentMarkdown);
            if (versionWriteStateRef.current.noteId !== note.id || !versionWriteStateRef.current.canWrite) throw new Error('笔记或写入状态已变化，请重新检查');
            const latestMarkdown = autosave.getLatestMarkdown();
            if (isAttachmentReferenced(latestMarkdown, attachmentId)) throw new Error('当前草稿新增了附件引用，已阻止删除');
            if (latestMarkdown !== currentMarkdown) throw new Error('正文在保存期间发生变化，请保存后重新检查');
            const result = await onDeleteAttachment(attachmentId);
            if (versionWriteStateRef.current.noteId === note.id) setAttachments((current) => current.filter((item) => item.id !== attachmentId));
            return result;
          }}
          onCreateAnnotation={createCurrentAnnotation}
          onSelectAnnotation={selectAnnotation}
          onDeleteAnnotation={async (annotationId, expectedRevision) => {
            const deleted = await onDeleteAnnotation(annotationId, expectedRevision);
            setAnnotations((current) => current.filter((item) => item.id !== annotationId));
            setFocusedAnnotationId((current) => current === annotationId ? null : current);
            return deleted;
          }}
          onRestoreAnnotation={onRestoreAnnotation ? async (annotationId, expectedRevision) => replaceAnnotation(await onRestoreAnnotation(annotationId, expectedRevision)) : undefined}
          onReanchorAnnotation={reanchorAnnotation}
          onUpdateAnnotation={onUpdateAnnotation ? async (annotationId, input) => replaceAnnotation(await onUpdateAnnotation(annotationId, input)) : undefined}
          onConfirmAnnotationRange={onConfirmAnnotationRange ? async (id, input) => replaceAnnotation(await onConfirmAnnotationRange(id, input)) : undefined}
          onPreviewAnnotation={onPreviewAnnotation}
          onGetAnnotationKnowledgeLinks={onGetAnnotationKnowledgeLinks}
          onCreateKnowledgeCandidate={onCreateKnowledgeCandidate ? async annotation => {
            const markdown = view.showSourceEditor ? autosave.getLatestMarkdown() : editorRef.current?.getMarkdown() ?? autosave.getLatestMarkdown();
            await autosave.saveNow(markdown);
            if (!versionWriteStateRef.current.canWrite || versionWriteStateRef.current.noteId !== annotation.noteId) throw new Error('已切换笔记或写入状态，请在当前笔记重新创建候选。');
            await onCreateKnowledgeCandidate(annotation);
          } : undefined}
          onOpenKnowledgeItem={onOpenKnowledgeItem}
          onExtractWithAssistant={onExtractWithAssistant ? async () => {
            // 助手读取的是已保存的版本：保存当前草稿，并在保存完成后重新核验——保存期间继续输入、切换笔记或写入状态变化都不能跳转，
            // 否则助手会读到旧内容；保存失败同样留在编辑器。出错时抛出说明，由检查器显示并允许重试。
            const before = analysisContext.current;
            if (!before.canWrite || !before.noteId) throw new Error('当前笔记不可写，无法提炼知识点。');
            const markdown = before.markdown();
            await autosave.saveNow(markdown);
            const now = analysisContext.current;
            if (!annotationMountedRef.current || !now.canWrite || now.noteId !== before.noteId || now.spaceId !== before.spaceId || now.markdown() !== markdown) {
              throw new Error('保存期间笔记或草稿已变化，请确认内容后重试。');
            }
            onExtractWithAssistant(before.noteId);
          } : undefined}
          knowledgeWriteDisabledReason={knowledgeWriteDisabledReason}
          onPreviewAnalysisScope={onPreviewAnalysisScope ? previewSavedAnalysis : undefined}
          onCreateAnalysisScope={onCreateAnalysisScope}
          onListAnalysisScopes={onListAnalysisScopes}
          onTrashAnalysisScope={onTrashAnalysisScope}
          onRestoreAnalysisScope={onRestoreAnalysisScope}
          onCreateAnnotationExclusion={excludeCurrentBlock}
          onDeleteAnnotationExclusion={onDeleteAnnotationExclusion ? async (annotationId, exclusionId, expectedRevision) => replaceAnnotation((await onDeleteAnnotationExclusion(annotationId, exclusionId, expectedRevision)).annotation) : undefined}
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
    </section>
  );
}
