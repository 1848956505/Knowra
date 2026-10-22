import { useRef, type RefObject } from 'react';
import type { Annotation, Note, UpdateAnnotationInput } from '@study-accelerator/web-core';
import type { EditorCommandTarget } from './editorCommands';
import { inlineMarkIdOf, isInlineAnnotation, type InlineAnnotationImportance, type InlineAnnotationScope, type InlineAnnotationSnapshot } from './editorInlineAnnotations';

interface Options {
  note: Note | null;
  canEditContent: boolean;
  editorRef: RefObject<EditorCommandTarget | null>;
  autosave: { saveNow(markdown?: string): Promise<void> };
  annotations: Annotation[];
  annotationsLoading: boolean;
  onListAnnotations(noteId: string): Promise<Annotation[]>;
  onUpdateAnnotation?(annotationId: string, input: UpdateAnnotationInput): Promise<Annotation>;
  setAnnotations(annotations: Annotation[]): void;
  setFocusedAnnotationId(id: string | null): void;
  onFileStatus(message: string): void;
}

const isActive = (annotation: Annotation) => (annotation.lifecycleStatus ?? 'active') === 'active';

/**
 * 重点内联化 I3b：没有活跃旧重点的笔记，重点的新建、取消、改类型和重要程度、重新选择、排除都只改正文标记，
 * 立即保存后由服务端派生 v3 行，再刷新列表并聚焦。还有旧重点的笔记仍走旧链路，等迁移后切换，避免两套重点混用。
 */
export function useInlineAnnotationWrites(options: Options) {
  const { note, canEditContent, editorRef, autosave, annotations, annotationsLoading } = options;
  const snapshots = useRef(new Map<string, InlineAnnotationSnapshot>());
  const legacyActive = annotations.some(annotation => !isInlineAnnotation(annotation) && isActive(annotation));
  const enabled = Boolean(note) && canEditContent && !annotationsLoading && !legacyActive;

  const editorOps = () => {
    const ops = editorRef.current?.inlineAnnotations;
    if (!ops || !note) throw new Error('编辑器尚未就绪，请稍后再试');
    return ops;
  };
  /** 保存正文并刷新重点列表；返回标记对应的 v3 行（服务端已派生）。 */
  const settle = async (markId?: string) => {
    const editor = editorRef.current;
    if (!editor || !note) throw new Error('编辑器尚未就绪，请稍后再试');
    await options.autosave.saveNow(editor.getMarkdown());
    const list = await options.onListAnnotations(note.id);
    options.setAnnotations(list);
    return markId ? list.find(item => isInlineAnnotation(item) && inlineMarkIdOf(item) === markId) ?? null : null;
  };
  const markIdOf = (annotation: Annotation) => {
    const markId = inlineMarkIdOf(annotation);
    if (!markId) throw new Error('这条重点缺少正文标记，请刷新后重试');
    return markId;
  };

  return {
    enabled,
    legacyActive,
    owns: (annotation: Annotation | undefined): annotation is Annotation => Boolean(annotation && isInlineAnnotation(annotation)),
    async create(scope: InlineAnnotationScope, importance: InlineAnnotationImportance = 'normal') {
      const markId = editorOps().create(scope, importance);
      const created = await settle(markId);
      if (created) options.setFocusedAnnotationId(created.id);
      options.onFileStatus('已标为重点');
    },
    async remove(annotation: Annotation) {
      const snapshot = editorOps().remove(markIdOf(annotation));
      snapshots.current.set(annotation.id, snapshot);
      const removed = await settle(snapshot.markId);
      options.setFocusedAnnotationId(null);
      return removed ?? { ...annotation, lifecycleStatus: 'deleted' as const };
    },
    canRestore: (annotationId: string) => snapshots.current.has(annotationId),
    async restore(annotationId: string) {
      const snapshot = snapshots.current.get(annotationId);
      if (!snapshot) throw new Error('这条重点已无法撤销，请重新标记');
      editorOps().restore(snapshot);
      snapshots.current.delete(annotationId);
      const restored = await settle(snapshot.markId);
      if (restored) options.setFocusedAnnotationId(restored.id);
      return restored;
    },
    async update(annotation: Annotation, input: UpdateAnnotationInput) {
      const markId = markIdOf(annotation);
      const kindChanged = input.kind !== undefined && input.kind !== annotation.kind;
      const importanceChanged = input.importance !== undefined && (input.importance ?? 'normal') !== (annotation.importance ?? 'normal');
      let latest: Annotation | null = annotation;
      if (kindChanged || importanceChanged) {
        editorOps().update(markId, { ...(kindChanged ? { kind: input.kind } : {}), ...(importanceChanged ? { importance: (input.importance ?? 'normal') as InlineAnnotationImportance } : {}) });
        latest = await settle(markId);
      }
      // 备注不进正文，仍由服务端保存（v3 只允许改备注）。
      if (input.comment !== undefined && input.comment !== (annotation.comment ?? '') && latest && options.onUpdateAnnotation && note) {
        await options.onUpdateAnnotation(latest.id, { expectedRevision: latest.revision ?? 1, comment: input.comment });
        const list = await options.onListAnnotations(note.id);
        options.setAnnotations(list);
        latest = list.find(item => item.id === latest!.id) ?? latest;
      }
      return latest ?? annotation;
    },
    async reanchor(annotation: Annotation) {
      const markId = markIdOf(annotation);
      editorOps().reanchor(markId, (annotation.scopeType ?? 'selection') as InlineAnnotationScope);
      const updated = await settle(markId);
      if (updated) options.setFocusedAnnotationId(updated.id);
    },
    async exclude(annotation: Annotation) {
      editorOps().exclude(markIdOf(annotation));
      await settle();
      options.onFileStatus('已从所属重点中排除当前内容块');
    }
  };
}
