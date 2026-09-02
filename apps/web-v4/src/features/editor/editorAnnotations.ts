import { editorViewCtx, type Editor } from '@milkdown/kit/core';
import type { Annotation } from '@study-accelerator/web-core';
import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import { Plugin, PluginKey, TextSelection } from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';
import { $prose } from '@milkdown/kit/utils';
import type { AnnotationSelection } from './annotationPayloads';
export type { AnnotationSelection } from './annotationPayloads';

interface AnnotationPluginState {
  annotations: Annotation[];
  focusedId: string | null;
  decorations: DecorationSet;
}

export const annotationPluginKey = new PluginKey<AnnotationPluginState>('KNOWRA_V4_ANNOTATIONS');

export function createAnnotationHighlightBehavior(onSelect: (annotationId: string) => void) {
  return $prose(() => new Plugin<AnnotationPluginState>({
    key: annotationPluginKey,
    state: {
      init: () => ({ annotations: [], focusedId: null, decorations: DecorationSet.empty }),
      apply(transaction, previous) {
        const meta = transaction.getMeta(annotationPluginKey) as {
          annotations?: Annotation[];
          focusedId?: string | null;
        } | undefined;
        const annotations = meta?.annotations ?? previous.annotations;
        const focusedId = meta && 'focusedId' in meta ? meta.focusedId ?? null : previous.focusedId;
        if (!meta && !transaction.docChanged) return previous;
        return {
          annotations,
          focusedId,
          decorations: createDecorations(transaction.doc, annotations, focusedId)
        };
      }
    },
    props: {
      decorations(state) {
        return annotationPluginKey.getState(state)?.decorations ?? null;
      },
      handleClick(_view, _position, event) {
        const target = event.target instanceof Element
          ? event.target.closest<HTMLElement>('[data-annotation-id]')
          : null;
        const annotationId = target?.dataset.annotationId;
        if (!annotationId) return false;
        onSelect(annotationId);
        return true;
      }
    }
  }));
}

export function getAnnotationSelection(editor: Editor): AnnotationSelection | null {
  const view = editor.ctx.get(editorViewCtx);
  const { from, to, empty } = view.state.selection;
  if (empty) return null;
  const quoteText = view.state.doc.textBetween(from, to, '\n').trim();
  if (!quoteText) return null;
  return {
    quoteText,
    fromPosition: from,
    toPosition: to,
    prefixText: view.state.doc.textBetween(Math.max(0, from - 64), from, ' ').slice(-64),
    suffixText: view.state.doc.textBetween(to, Math.min(view.state.doc.content.size, to + 64), ' ').slice(0, 64),
    headingPath: headingPathAt(view.state.doc, from)
  };
}

export function setEditorAnnotations(editor: Editor, annotations: Annotation[], focusedId: string | null): void {
  const view = editor.ctx.get(editorViewCtx);
  view.dispatch(view.state.tr
    .setMeta(annotationPluginKey, { annotations, focusedId })
    .setMeta('addToHistory', false));
}

export function selectEditorAnnotation(editor: Editor, annotationId: string): boolean {
  const view = editor.ctx.get(editorViewCtx);
  const annotation = annotationPluginKey.getState(view.state)?.annotations.find((item) => item.id === annotationId);
  const range = annotation && resolveAnnotationRange(view.state.doc, annotation);
  if (!range) return false;
  view.dispatch(view.state.tr
    .setSelection(TextSelection.create(view.state.doc, range.from, range.to))
    .setMeta(annotationPluginKey, { focusedId: annotationId })
    .setMeta('addToHistory', false)
    .scrollIntoView());
  view.focus();
  return true;
}

function createDecorations(doc: ProseNode, annotations: Annotation[], focusedId: string | null): DecorationSet {
  const decorations = annotations
    .filter((annotation) => annotation.status !== 'archived')
    .flatMap((annotation) => {
      const range = resolveAnnotationRange(doc, annotation);
      if (!range) return [];
      return [Decoration.inline(range.from, range.to, {
        class: [
          'editor-annotation',
          annotation.status === 'stale' ? 'editor-annotation-stale' : '',
          annotation.id === focusedId ? 'editor-annotation-active' : ''
        ].filter(Boolean).join(' '),
        'data-annotation-id': annotation.id,
        title: annotation.status === 'stale' ? '原文位置已变化' : '重要内容标注'
      })];
    });
  return DecorationSet.create(doc, decorations);
}

function resolveAnnotationRange(doc: ProseNode, annotation: Annotation): { from: number; to: number } | null {
  const from = Number(annotation.fromPosition);
  const to = Number(annotation.toPosition);
  if (from >= 0 && to > from && to <= doc.content.size) {
    const exact = doc.textBetween(from, to, '\n').trim();
    if (exact === annotation.quoteText) return { from, to };
  }
  let resolved: { from: number; to: number } | null = null;
  doc.descendants((node, position) => {
    if (resolved || !node.isText || !node.text) return;
    const index = node.text.indexOf(annotation.quoteText);
    if (index >= 0) resolved = { from: position + index, to: position + index + annotation.quoteText.length };
  });
  return resolved;
}

function headingPathAt(doc: ProseNode, target: number): string[] {
  const path = new Map<number, string>();
  doc.descendants((node, position) => {
    if (position >= target) return false;
    if (node.type.name === 'heading') {
      const level = Number(node.attrs.level);
      path.set(level, node.textContent);
      for (const knownLevel of [...path.keys()]) if (knownLevel > level) path.delete(knownLevel);
    }
    return true;
  });
  return [...path.entries()].sort(([left], [right]) => left - right).map(([, title]) => title);
}
