import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';
import { $prose } from '@milkdown/kit/utils';

export const annotationHighlightPluginKey = new PluginKey('KNOWRA_ANNOTATION_HIGHLIGHTS');
const normalized = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();
export function resolveAnnotationRange(doc, annotation) {
  const direct = { from: annotation.fromPosition, to: annotation.toPosition };
  if (Number.isInteger(direct.from) && Number.isInteger(direct.to) && normalized(doc.textBetween(direct.from, direct.to, '\n', '\n')) === normalized(annotation.quoteText)) return direct;
  const matches = []; doc.descendants((node, position) => { if (!node.isText) return; let index = node.text.indexOf(annotation.quoteText); while (index >= 0) { matches.push({ from: position + index, to: position + index + annotation.quoteText.length }); index = node.text.indexOf(annotation.quoteText, index + 1); } });
  return matches.length === 1 ? matches[0] : null;
}
export const annotationHighlightBehavior = $prose(() => new Plugin({ key: annotationHighlightPluginKey, state: { init: () => ({ annotations: [], decorations: DecorationSet.empty }), apply(tr, old) { const annotations = tr.getMeta(annotationHighlightPluginKey)?.annotations ?? old.annotations; if (!tr.docChanged && !tr.getMeta(annotationHighlightPluginKey)) return old; const decorations = annotations.filter((item) => item.status === 'active').map((item) => { const range = resolveAnnotationRange(tr.doc, item); return range && Decoration.inline(range.from, range.to, { class: 'annotation-marker', 'data-annotation-id': item.id, title: '重要内容标注' }); }).filter(Boolean); return { annotations, decorations: decorations.length ? DecorationSet.create(tr.doc, decorations) : DecorationSet.empty }; } }, props: { decorations: (state) => annotationHighlightPluginKey.getState(state)?.decorations ?? null, handleDOMEvents: { click(view, event) { const marker = event.target instanceof Element ? event.target.closest('[data-annotation-id]') : null; if (!marker) return false; event.preventDefault(); view.dom.dispatchEvent(new CustomEvent('annotation-marker-click', { bubbles: true, detail: { annotationId: marker.dataset.annotationId } })); return true; } } } }));
