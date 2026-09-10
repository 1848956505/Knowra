import { editorViewCtx, type Editor } from '@milkdown/kit/core';
import type { Annotation } from '@study-accelerator/web-core';
import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import { Plugin, PluginKey, TextSelection } from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';
import { $prose } from '@milkdown/kit/utils';
import type { AnnotationSelection } from './annotationPayloads';
import { anchorFromProjectedRange, projectMarkdown, type AnnotationScopeType } from '@study-accelerator/content-anchor';
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

export function getAnnotationSelection(editor: Editor, markdown: string, scopeType: AnnotationScopeType = 'selection'): AnnotationSelection | null {
  const view = editor.ctx.get(editorViewCtx);
  const range = scopeRange(view.state.doc, view.state.selection.from, view.state.selection.to, scopeType);
  if (!range) return null;
  const { from, to } = range;
  const visibleText = view.state.doc.textBetween(from, to, '\n', '\uFFFC');
  if (!visibleText.trim()) return null;
  const projection = projectMarkdown(markdown);
  const projectedRange = mapProseRangeToProjection(view.state.doc, projection.text, from, to, visibleText);
  if (!projectedRange) return null;
  const anchor = anchorFromProjectedRange(projection, projectedRange.from, projectedRange.to, { scopeType });
  return {
    quoteText: anchor.quoteText,
    fromPosition: anchor.sourceStart,
    toPosition: anchor.sourceEnd,
    prefixText: anchor.prefixText,
    suffixText: anchor.suffixText,
    headingPath: headingPathAt(view.state.doc, from),
    scopeType,
    anchor
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
  const documentText = doc.textBetween(0, doc.content.size, '\n', '\uFFFC');
  const projectedStart = Number(annotation.anchor?.projectedStart);
  const projectedEnd = Number(annotation.anchor?.projectedEnd);
  if (Number.isInteger(projectedStart) && Number.isInteger(projectedEnd) && projectedEnd > projectedStart) {
    const from = prosePositionForTextOffset(doc, projectedStart, false);
    const to = prosePositionForTextOffset(doc, projectedEnd, true);
    if (doc.textBetween(from, to, '\n', '\uFFFC') === annotation.quoteText) return { from, to };
  }
  const occurrences = findOccurrences(documentText, annotation.quoteText);
  if (occurrences.length !== 1) return null;
  return {
    from: prosePositionForTextOffset(doc, occurrences[0], false),
    to: prosePositionForTextOffset(doc, occurrences[0] + annotation.quoteText.length, true)
  };
}

function mapProseRangeToProjection(doc: ProseNode, projectedText: string, from: number, to: number, quote: string): { from: number; to: number } | null {
  const before = doc.textBetween(0, from, '\n', '\uFFFC');
  if (projectedText.slice(before.length, before.length + quote.length) === quote) return { from: before.length, to: before.length + quote.length };
  const occurrences = findOccurrences(projectedText, quote);
  if (occurrences.length !== 1) return null;
  return { from: occurrences[0], to: occurrences[0] + quote.length };
}

function findOccurrences(text: string, quote: string): number[] {
  const matches: number[] = [];
  for (let offset = 0; quote && offset <= text.length - quote.length;) {
    const match = text.indexOf(quote, offset);
    if (match < 0) break;
    matches.push(match);
    offset = match + Math.max(1, quote.length);
  }
  return matches;
}

function prosePositionForTextOffset(doc: ProseNode, offset: number, preferEnd: boolean): number {
  let low = 0;
  let high = doc.content.size;
  while (low < high) {
    const middle = preferEnd ? Math.ceil((low + high) / 2) : Math.floor((low + high) / 2);
    const length = doc.textBetween(0, middle, '\n', '\uFFFC').length;
    if (preferEnd ? length <= offset : length < offset) low = middle + (preferEnd ? 0 : 1);
    else high = middle - (preferEnd ? 1 : 0);
    if (high < low) break;
  }
  const candidates = [low, high, low - 1, low + 1].filter((value) => value >= 0 && value <= doc.content.size);
  return candidates.reduce((best, value) => {
    const bestDelta = Math.abs(doc.textBetween(0, best, '\n', '\uFFFC').length - offset);
    const delta = Math.abs(doc.textBetween(0, value, '\n', '\uFFFC').length - offset);
    return delta < bestDelta ? value : best;
  }, candidates[0] ?? 0);
}

function scopeRange(doc: ProseNode, from: number, to: number, scopeType: AnnotationScopeType): { from: number; to: number } | null {
  if (scopeType === 'selection') return from === to ? null : { from, to };
  const blocks: Array<{ from: number; to: number; node: ProseNode; offset: number }> = [];
  doc.forEach((node, offset) => blocks.push({ from: offset + 1, to: offset + node.nodeSize - 1, node, offset }));
  if (scopeType === 'blocks') {
    const selected = contentBlocks(doc, from, to);
    return selected.length ? { from: selected[0].from, to: selected.at(-1)!.to } : null;
  }
  let headingIndex = -1;
  for (let index = 0; index < blocks.length; index += 1) {
    if (blocks[index].offset >= from) break;
    if (blocks[index].node.type.name === 'heading') headingIndex = index;
  }
  if (headingIndex < 0) return null;
  const level = Number(blocks[headingIndex].node.attrs.level);
  const next = blocks.slice(headingIndex + 1).find((block) => block.node.type.name === 'heading' && Number(block.node.attrs.level) <= level);
  return { from: blocks[headingIndex].from, to: next ? next.offset : doc.content.size };
}

const CONTENT_BLOCK_NAMES = new Set(['list_item', 'blockquote', 'code_block', 'math_block', 'table', 'paragraph', 'heading']);

function contentBlocks(doc: ProseNode, from: number, to: number): Array<{ from: number; to: number }> {
  const candidates: Array<{ from: number; to: number; name: string }> = [];
  doc.descendants((node, position) => {
    if (!CONTENT_BLOCK_NAMES.has(node.type.name)) return true;
    const range = { from: position + 1, to: position + node.nodeSize - 1, name: node.type.name };
    if (range.to >= from && range.from <= Math.max(from, to)) candidates.push(range);
    return true;
  });
  const preferredContainers = candidates.filter((item) => ['list_item', 'blockquote', 'code_block', 'math_block', 'table'].includes(item.name));
  const selected = candidates.filter((item) => {
    if (preferredContainers.some((container) => container !== item && container.from <= item.from && container.to >= item.to)) return false;
    return item.name !== 'heading' || preferredContainers.length === 0;
  }).sort((left, right) => left.from - right.from || right.to - left.to);
  const nonNested: Array<{ from: number; to: number }> = [];
  for (const item of selected) {
    if (!nonNested.some((known) => known.from <= item.from && known.to >= item.to)) nonNested.push(item);
  }
  return nonNested;
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
