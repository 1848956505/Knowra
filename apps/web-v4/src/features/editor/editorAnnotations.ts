import type { AnnotationEditIntent } from './annotationEditJournal';
import { isHistoryTransaction } from '@milkdown/kit/prose/history';
import { serializerCtx } from '@milkdown/kit/core';
import { mapAnnotationRange, type TrackedAnnotationRange } from './annotationTransactionRanges';
import { editorViewCtx, type Editor } from '@milkdown/kit/core';
import type { Annotation } from '@study-accelerator/web-core';
import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import { Plugin, PluginKey, TextSelection } from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';
import { $prose } from '@milkdown/kit/utils';
import type { AnnotationSelection } from './annotationPayloads';
import { anchorForBlock, anchorFromProjectedRange, projectMarkdown, calculateContentHash, type AnnotationScopeType, type MarkdownProjection } from '@study-accelerator/content-anchor';
export type { AnnotationSelection } from './annotationPayloads';

interface AnnotationPluginState {
  annotations: Annotation[];
  focusedId: string | null;
  decorations: DecorationSet;
  ranges: Map<string, TrackedAnnotationRange>;
  editIntent: AnnotationEditIntent;
  snapshots: Array<{ doc: ProseNode; ranges: Map<string, TrackedAnnotationRange> }>;
}

export const annotationPluginKey = new PluginKey<AnnotationPluginState>('KNOWRA_V4_ANNOTATIONS');

export function createAnnotationHighlightBehavior(onSelect: (annotationIds: string[]) => void, onDocumentChange?: (markdown: string, intent: AnnotationEditIntent) => void) {
  let pendingIntent: AnnotationEditIntent = {};
  let cut: { id: string; text: string; ranges: Array<{ id: string; range: TrackedAnnotationRange; quote: string }> } | null = null;
  let moving: Array<{ id: string; range: TrackedAnnotationRange; quote: string }> = [];
  return $prose((ctx) => new Plugin<AnnotationPluginState>({
    key: annotationPluginKey,
    state: {
      init: () => ({ annotations: [], focusedId: null, decorations: DecorationSet.empty, ranges: new Map(), snapshots: [], editIntent: {} }),
      apply(transaction, previous) {
        const meta = transaction.getMeta(annotationPluginKey) as {
          annotations?: Annotation[];
          focusedId?: string | null;
        } | undefined;
        const annotations = meta?.annotations ?? previous.annotations;
        const focusedId = meta && 'focusedId' in meta ? meta.focusedId ?? null : previous.focusedId;
        if (!meta && !transaction.docChanged) return previous;
        let ranges = new Map(previous.ranges);
        const snapshots = [...previous.snapshots];
        if (transaction.docChanged) {
          if (isHistoryTransaction(transaction)) pendingIntent = { history: true };
          snapshots.push({ doc: transaction.before, ranges: new Map(ranges) });
          const restored = isHistoryTransaction(transaction) ? [...snapshots].reverse().find(snapshot => snapshot.doc.eq(transaction.doc)) : undefined;
          ranges = restored ? new Map(restored.ranges) : new Map([...ranges].map(([id, range]) => [id, mapAnnotationRange(range, transaction)]));
        }
        if (transaction.docChanged && pendingIntent.moveKind === 'cut') {
          for (const item of cut?.ranges ?? []) ranges.set(item.id, { ...item.range, missing: true });
        }
        if (transaction.docChanged && pendingIntent.moveKind === 'paste') {
          for (const item of moving) {
            const annotation = annotations.find(annotation => annotation.id === item.id);
            if (!annotation) continue;
            const relocated = resolveAnnotationRange(transaction.doc, { ...annotation, quoteText: item.quote, anchor: null });
            if (relocated) ranges.set(item.id, { ...relocated, scopeType: item.range.scopeType });
          }
          moving = [];
        }
        if (meta?.annotations) {
          const ids = new Set(annotations.map(annotation => annotation.id));
          for (const id of ranges.keys()) if (!ids.has(id)) ranges.delete(id);
          const currentContentHash = calculateContentHash(ctx.get(serializerCtx)(transaction.doc));
          for (const annotation of annotations) {
            if (ranges.has(annotation.id) && previous.snapshots.length && annotation.noteContentHash !== currentContentHash) continue;
            const resolved = annotation.anchorStatus === 'missing' ? null : resolveAnnotationRange(transaction.doc, annotation);
            if (resolved) ranges.set(annotation.id, { ...resolved, scopeType: annotation.scopeType ?? 'selection', needsReview: annotation.anchorStatus === 'needsReview' });
            else if (!ranges.has(annotation.id)) ranges.set(annotation.id, { from: 0, to: 0, scopeType: annotation.scopeType ?? 'selection', missing: true });
          }
        }
        return {
          editIntent: transaction.docChanged ? {
            ...pendingIntent,
            preserveEmptyBlock: [...ranges.values()].some(range => range.scopeType === 'blocks' && !range.missing && !transaction.doc.textBetween(range.from, range.to).trim()),
            deletedEmptyAnnotationIds: [...previous.ranges].filter(([id, range]) => range.scopeType === 'blocks' && !range.missing && range.from === range.to && ranges.get(id)?.missing).map(([id]) => id)
          } : {},
          ranges, snapshots: snapshots.slice(-200),
          annotations,
          focusedId,
          decorations: createDecorations(transaction.doc, annotations, focusedId, ranges)
        };
      }
    },
    appendTransaction(transactions, _oldState, state) {
      const incoming = transactions.find(transaction => transaction.getMeta(annotationPluginKey)?.annotations && !transaction.getMeta(annotationPluginKey)?.restoredEmpty);
      if (!incoming || (annotationPluginKey.getState(_oldState)?.annotations.length ?? 0) > 0) return null;
      const annotations = annotationPluginKey.getState(state)?.annotations ?? [];
      let tr = state.tr;
      for (const annotation of annotations) {
        if (!annotation.anchor?.tracking?.empty || annotation.anchorStatus === 'missing' || annotation.lifecycleStatus !== 'active') continue;
        if (resolveAnnotationRange(tr.doc, annotation)) continue;
        const path = annotation.anchor.structurePath ?? '';
        if (!/^\d+$/.test(path)) continue;
        const index = Math.min(Number(path), tr.doc.childCount);
        let offset = 0;
        for (let i = 0; i < index; i++) offset += tr.doc.child(i).nodeSize;
        tr = tr.insert(offset, state.schema.nodes.paragraph.create());
      }
      return tr.docChanged ? tr.setMeta('addToHistory', false).setMeta(annotationPluginKey, { annotations, restoredEmpty: true }) : null;
    },
    view: () => ({
      update(view, previousState) {
        if (onDocumentChange && !view.state.doc.eq(previousState.doc)) {
          const intent = annotationPluginKey.getState(view.state)?.editIntent ?? pendingIntent;
          pendingIntent = {};
          onDocumentChange(ctx.get(serializerCtx)(view.state.doc), intent);
        }
      }
    }),
    props: {
      handleDOMEvents: {
        cut(view, event) {
          if (!event.clipboardData || view.state.selection.empty) return false;
          cut = { id: crypto.randomUUID(), text: view.state.doc.textBetween(view.state.selection.from, view.state.selection.to, '\n').trim(), ranges: [...(annotationPluginKey.getState(view.state)?.ranges ?? [])].filter(([, range]) => !range.missing && range.from >= view.state.selection.from && range.to <= view.state.selection.to).map(([id,range]) => ({id,range,quote:view.state.doc.textBetween(range.from,range.to,'\n','\uFFFC')})) };
          pendingIntent = { moveId: cut.id, moveKind: 'cut' };
          const serialized = view.serializeForClipboard(view.state.selection.content());
          event.clipboardData.clearData();
          event.clipboardData.setData('text/html', Array.from(serialized.dom.childNodes, node => new XMLSerializer().serializeToString(node)).join(''));
          event.clipboardData.setData('text/plain', serialized.text);
          event.clipboardData.setData('application/x-knowra-move', cut.id);
          event.preventDefault();
          view.dispatch(view.state.tr.deleteSelection().setMeta('uiEvent', 'cut').scrollIntoView());
          return true;
        },
        copy() { cut = null; pendingIntent = {}; return false; },
        paste(_view, event) {
          if (cut && cut.text && event.clipboardData?.getData('application/x-knowra-move') === cut.id && event.clipboardData.getData('text/plain').trim() === cut.text) { pendingIntent = { moveId: cut.id, moveKind: 'paste' }; moving = cut.ranges; }
          else pendingIntent = {};
          cut = null;
          return false;
        }
      },
      decorations(state) {
        return annotationPluginKey.getState(state)?.decorations ?? null;
      },
      handleClick(_view, _position, event) {
        const target = event.target instanceof Element
          ? event.target.closest<HTMLElement>('[data-annotation-ids]')
          : null;
        if (!target?.dataset.annotationIds) return false;
        const annotationIds = JSON.parse(target.dataset.annotationIds) as string[];
        if (annotationIds.length === 0) return false;
        onSelect(annotationIds);
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
  const codeBlock = scopeType === 'blocks' ? view.state.doc.nodeAt(from - 1) : null;
  let anchor;
  if (codeBlock?.type.name === 'code_block' && to === from + codeBlock.content.size) {
    anchor = anchorForSelectedCodeBlock(view.state.doc, projection, from);
  } else {
    const projectedRange = mapProseRangeToProjection(view.state.doc, projection.text, from, to, visibleText);
    if (!projectedRange) return null;
    anchor = anchorFromProjectedRange(projection, projectedRange.from, projectedRange.to, { scopeType });
  }
  if (!anchor || anchor.quoteText !== visibleText) return null;
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

function anchorForSelectedCodeBlock(doc: ProseNode, projection: MarkdownProjection, from: number) {
  let codeOrdinal = 0;
  let selectedOrdinal = -1;
  doc.descendants((node, position) => {
    if (node.type.name !== 'code_block') return true;
    if (position + 1 === from) selectedOrdinal = codeOrdinal;
    codeOrdinal += 1;
    return false;
  });
  if (selectedOrdinal < 0) return null;
  const markdownCodeBlocks = projection.blocks.filter((block) => block.type === 'code');
  if (markdownCodeBlocks.length !== codeOrdinal) return null;
  const markdownBlock = markdownCodeBlocks[selectedOrdinal];
  return markdownBlock ? anchorForBlock(projection, projection.blocks.indexOf(markdownBlock)) : null;
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
  const tracked = annotationPluginKey.getState(view.state)?.ranges.get(annotationId);
  const range = tracked && !tracked.missing ? tracked : annotation && resolveAnnotationRange(view.state.doc, annotation);
  if (!range) return false;
  view.dispatch(view.state.tr
    .setSelection(TextSelection.create(view.state.doc, range.from, range.to))
    .setMeta(annotationPluginKey, { focusedId: annotationId })
    .setMeta('addToHistory', false)
    .scrollIntoView());
  view.focus();
  return true;
}

function createDecorations(doc: ProseNode, annotations: Annotation[], focusedId: string | null, tracked?: Map<string, TrackedAnnotationRange>): DecorationSet {
  const ranges = annotations
    .filter((annotation) => annotation.lifecycleStatus !== 'deleted' && annotation.lifecycleStatus !== 'archived' && annotation.status !== 'archived')
    .flatMap((annotation) => {
      const mapped = tracked?.get(annotation.id);
      const range = mapped ? (mapped.missing || mapped.needsReview ? null : mapped) : resolveAnnotationRange(doc, annotation);
      if (!range) return [];
      return [{ ...range, annotation }];
    });
  const boundaries = [...new Set(ranges.flatMap(({ from, to }) => [from, to]))].sort((left, right) => left - right);
  const decorations = boundaries.slice(0, -1).flatMap((from, index) => {
    const to = boundaries[index + 1];
    const covering = ranges.filter((range) => range.from < to && range.to > from).map(({ annotation }) => annotation);
    if (covering.length === 0) return [];
    const ids = covering.map((annotation) => annotation.id);
    const importance = (['core', 'important', 'normal'] as const)
      .find((level) => covering.some((annotation) => annotation.importance === level));
    return [Decoration.inline(from, to, {
        class: [
          'editor-annotation',
          covering.some((annotation) => annotation.status === 'stale') ? 'editor-annotation-stale' : '',
          ids.includes(focusedId ?? '') ? 'editor-annotation-active' : '',
        ].filter(Boolean).join(' '),
        ...(ids.length === 1 ? { 'data-annotation-id': ids[0] } : {}),
        ...(importance ? { 'data-importance': importance } : {}),
        'data-annotation-ids': JSON.stringify(ids),
        'data-annotation-count': String(ids.length),
        title: covering.some((annotation) => annotation.status === 'stale') ? '原文位置已变化' : '重要内容标注'
      })];
  });
  for (const [id, range] of tracked ?? []) {
    if (range.scopeType === 'blocks' && !range.missing && !doc.textBetween(range.from, range.to).trim() && range.from > 0 && range.from < doc.content.size) {
      const node = doc.nodeAt(range.from - 1);
      if (node?.isTextblock) decorations.push(Decoration.node(range.from - 1, range.from - 1 + node.nodeSize, { class: 'editor-annotation', 'data-annotation-id': id, 'data-annotation-ids': JSON.stringify([id]) }));
    }
  }
  return DecorationSet.create(doc, decorations);
}

export function resolveAnnotationRange(doc: ProseNode, annotation: Annotation): { from: number; to: number } | null {
  if (annotation.anchor?.tracking?.empty) {
    const target = nodeAtStructurePath(doc, annotation.anchor.structurePath ?? '');
    return target?.node.isTextblock && !target.node.textContent.trim() ? { from: target.position + 1, to: target.position + 1 + target.node.content.size } : null;
  }
  if (isCodeBlockAnchor(doc, annotation)) return resolveCodeBlockRange(doc, annotation);
  // Empty Markdown blocks can shift projected text offsets relative to ProseMirror.
  // A verified current block path still distinguishes the original from copied text.
  if (annotation.anchor?.tracking?.formatVersion === 1 && annotation.scopeType !== 'section') {
    const parts = (annotation.anchor.structurePath ?? '').split('.');
    while (parts.length) {
      const target = nodeAtStructurePath(doc, parts.join('.'));
      if (target?.node.isTextblock && target.node.textContent === annotation.quoteText) return { from: target.position + 1, to: target.position + target.node.nodeSize - 1 };
      if (target?.node.isTextblock) {
        const matches = findOccurrences(target.node.textBetween(0, target.node.content.size, '\n', '\uFFFC'), annotation.quoteText);
        if (matches.length === 1) {
          const offset = doc.textBetween(0, target.position + 1, '\n', '\uFFFC').length + matches[0];
          const from = prosePositionForTextOffset(doc, offset, false);
          const to = prosePositionForTextOffset(doc, offset + annotation.quoteText.length, true);
          if (doc.textBetween(from, to, '\n', '\uFFFC') === annotation.quoteText) return { from, to };
        }
      }
      parts.pop();
    }
  }

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

function isCodeBlockAnchor(doc: ProseNode, annotation: Annotation): boolean {
  const anchor = annotation.anchor;
  if (annotation.scopeType !== 'blocks' || !anchor?.structurePath || !anchor.segments.length) return false;
  if (!anchor.segments.every((segment) => segment.path === anchor.structurePath)) return false;
  return /^\d+$/.test(anchor.structurePath)
    || nodeAtStructurePath(doc, anchor.structurePath)?.node.type.name === 'code_block';
}

function resolveCodeBlockRange(doc: ProseNode, annotation: Annotation): { from: number; to: number } | null {
  const matches: Array<{ from: number; to: number }> = [];
  doc.descendants((node, position) => {
    if (node.type.name !== 'code_block') return true;
    if (node.textContent === annotation.quoteText) matches.push({ from: position + 1, to: position + node.nodeSize - 1 });
    return false;
  });
  if (!matches.length) return null;
  const target = nodeAtStructurePath(doc, annotation.anchor?.structurePath ?? '');
  if (target?.node.type.name === 'code_block') {
    const match = matches.find((candidate) => candidate.from === target.position + 1);
    if (match) return match;
  }
  return matches.length === 1 ? matches[0] : null;
}

function nodeAtStructurePath(doc: ProseNode, path: string): { node: ProseNode; position: number } | null {
  if (!/^\d+(?:\.\d+)*$/.test(path)) return null;
  let node = doc;
  let position = 0;
  for (const [depth, part] of path.split('.').entries()) {
    const index = Number(part);
    if (index >= node.childCount) return null;
    if (depth > 0) position += 1;
    for (let offset = 0; offset < index; offset += 1) position += node.child(offset).nodeSize;
    node = node.child(index);
  }
  return { node, position };
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
