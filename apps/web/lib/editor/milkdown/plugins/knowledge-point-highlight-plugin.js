import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';
import { $prose } from '@milkdown/kit/utils';
import { collectDocumentTextMatches } from './find-highlight-plugin.js';

export const knowledgePointHighlightPluginKey = new PluginKey('STUDY_KNOWLEDGE_POINT_HIGHLIGHTS');

export const knowledgePointHighlightBehavior = $prose(() => new Plugin({
  key: knowledgePointHighlightPluginKey,
  state: {
    init: () => ({
      sources: [],
      activeSourceId: null,
      decorations: DecorationSet.empty
    }),
    apply(transaction, pluginState) {
      const meta = transaction.getMeta(knowledgePointHighlightPluginKey);
      const sources = Array.isArray(meta?.sources)
        ? normalizeKnowledgePointSources(meta.sources)
        : pluginState.sources;
      const activeSourceId = Object.hasOwn(meta ?? {}, 'activeSourceId')
        ? meta.activeSourceId
        : pluginState.activeSourceId;

      if (!meta && !transaction.docChanged) {
        return pluginState;
      }

      return {
        sources,
        activeSourceId,
        decorations: buildKnowledgePointDecorations(transaction.doc, sources, activeSourceId)
      };
    }
  },
  props: {
    decorations(state) {
      return knowledgePointHighlightPluginKey.getState(state)?.decorations ?? null;
    },
    handleDOMEvents: {
      click(view, event) {
        const target = event.target instanceof Element ? event.target : null;
        const marker = target?.closest?.('[data-knowledge-point-source-id]');
        if (!marker) {
          return false;
        }

        event.preventDefault();
        view.dom.dispatchEvent(new CustomEvent('knowledge-point-marker-click', {
          bubbles: true,
          detail: {
            sourceId: marker.dataset.knowledgePointSourceId,
            knowledgePointId: marker.dataset.knowledgePointId
          }
        }));
        return true;
      }
    }
  }
}));
export function normalizeKnowledgePointSources(sources = []) {
  return sources
    .filter((source) => source?.id && source?.sourceText)
    .map((source) => ({
      id: source.id,
      knowledgePointId: source.knowledgePointId ?? '',
      sourceText: String(source.sourceText ?? '').replace(/\s+/g, ' ').trim(),
      anchor: source.anchor ?? null,
      startOffset: Number.isInteger(source.startOffset) ? source.startOffset : null,
      endOffset: Number.isInteger(source.endOffset) ? source.endOffset : null
    }));
}

export function rangeMatchesSource(doc, range, sourceText) {
  if (!range || range.from >= range.to) {
    return false;
  }

  const text = doc.textBetween(range.from, range.to, '\n', '\n').replace(/\s+/g, ' ').trim();
  return text === sourceText;
}

export function resolveKnowledgePointSourceRange(doc, source) {
  const anchoredRange = Number.isInteger(source.anchor?.from) && Number.isInteger(source.anchor?.to)
    ? { from: source.anchor.from, to: source.anchor.to }
    : null;
  if (rangeMatchesSource(doc, anchoredRange, source.sourceText)) {
    return anchoredRange;
  }

  const offsetRange = Number.isInteger(source.startOffset) && Number.isInteger(source.endOffset)
    ? { from: source.startOffset, to: source.endOffset }
    : null;
  if (rangeMatchesSource(doc, offsetRange, source.sourceText)) {
    return offsetRange;
  }

  return collectDocumentTextMatches(doc, source.sourceText)[0] ?? null;
}

export function buildKnowledgePointDecorations(doc, sources, activeSourceId) {
  const decorations = sources
    .map((source) => {
      const range = resolveKnowledgePointSourceRange(doc, source);
      if (!range) {
        return null;
      }

      return Decoration.inline(range.from, range.to, {
        class: source.id === activeSourceId
          ? 'knowledge-point-marker knowledge-point-marker-active'
          : 'knowledge-point-marker',
        'data-knowledge-point-source-id': source.id,
        'data-knowledge-point-id': source.knowledgePointId,
        title: '知识点原文片段'
      });
    })
    .filter(Boolean);

  return decorations.length ? DecorationSet.create(doc, decorations) : DecorationSet.empty;
}

