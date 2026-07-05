import { editorViewCtx } from '@milkdown/kit/core';
import { TextSelection } from '@milkdown/kit/prose/state';
import {
  knowledgePointHighlightPluginKey,
  normalizeKnowledgePointSources,
  resolveKnowledgePointSourceRange
} from '../plugins/knowledge-point-highlight-plugin.js';

export async function setKnowledgePointSources(host, sources = []) {
  await host.ready;
  const view = host.editor.ctx.get(editorViewCtx);
  view.dispatch(
    view.state.tr
      .setMeta(knowledgePointHighlightPluginKey, {
        sources: normalizeKnowledgePointSources(sources),
        activeSourceId: null
      })
      .setMeta('addToHistory', false)
  );
}

export async function selectKnowledgePointSource(host, sourceId) {
  await host.ready;
  const view = host.editor.ctx.get(editorViewCtx);
  const pluginState = knowledgePointHighlightPluginKey.getState(view.state);
  const source = pluginState?.sources?.find((item) => item.id === sourceId);
  if (!source) {
    return false;
  }

  const range = resolveKnowledgePointSourceRange(view.state.doc, source);
  if (!range) {
    return false;
  }

  const selection = TextSelection.create(view.state.doc, range.from, range.to);
  view.dispatch(
    view.state.tr
      .setSelection(selection)
      .setMeta(knowledgePointHighlightPluginKey, {
        sources: pluginState.sources,
        activeSourceId: sourceId
      })
      .setMeta('addToHistory', false)
      .scrollIntoView()
  );
  view.focus();
  return true;
}
