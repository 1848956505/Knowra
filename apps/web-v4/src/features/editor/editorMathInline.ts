import { InputRule } from '@milkdown/kit/prose/inputrules';
import { Plugin, PluginKey, TextSelection, type Command } from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';
import { $inputRule, $nodeSchema, $prose } from '@milkdown/kit/utils';
import { renderMath } from './editorMathBlock';

export const mathInlineSchema = $nodeSchema('math_inline', () => ({
  content: 'text*',
  group: 'inline',
  inline: true,
  marks: '',
  isolating: true,
  parseDOM: [{ tag: 'span[data-math-inline]', preserveWhitespace: 'full' as const }],
  toDOM: () => ['span', { 'data-math-inline': '' }, 0] as const,
  parseMarkdown: {
    match: (node) => node.type === 'inlineMath',
    runner: (state, node, type) => {
      state.openNode(type);
      if (node.value) state.addText(node.value as string);
      state.closeNode();
    }
  },
  toMarkdown: {
    match: (node) => node.type.name === 'math_inline',
    runner: (state, node) => {
      state.addNode('inlineMath', undefined, node.textContent);
    }
  }
}));

/** 输入 `$x$` 的结束符后转为行内公式，光标留在公式内以便继续修改。 */
export const mathInlineInputRule = $inputRule((ctx) => new InputRule(
  /(?:^|[^$\\])\$([^$\s](?:[^$]*[^$\s])?)\$$/,
  (state, match, start, end) => {
    const type = mathInlineSchema.type(ctx);
    const body = match[1]!;
    // 触发时结束符 `$` 尚未写入文档，所以只回退开头符号和正文。
    const from = end - body.length - 1;
    if (from < start || state.selection.$from.parent.type.spec.code) return null;
    const node = type.create(null, state.schema.text(body));
    const tr = state.tr.replaceWith(from, end, node);
    return tr.setSelection(TextSelection.create(tr.doc, from + 1 + body.length));
  }
));

/** 选区包成行内公式；无选区则插入可直接覆盖的占位 `x`。 */
export const insertMathInline: Command = (state, dispatch) => {
  const type = state.schema.nodes.math_inline;
  const { $from, $to, from, to } = state.selection;
  if (!type || !$from.parent.inlineContent || $from.parent.type.spec.code || !$from.sameParent($to)) return false;
  if ($from.parent.type === type) return false;
  if (dispatch) {
    const text = from === to ? 'x' : state.doc.textBetween(from, to);
    const tr = state.tr.replaceWith(from, to, type.create(null, state.schema.text(text)));
    tr.setSelection(TextSelection.create(tr.doc, from + 1, from + 1 + text.length));
    dispatch(tr.scrollIntoView());
  }
  return true;
};

const KEY = new PluginKey('V4_MATH_INLINE');

export const mathInlineBehavior = $prose(() => new Plugin({
  key: KEY,
  props: {
    decorations(state) {
      const { $from, $to } = state.selection;
      if ($from.parent.type.name !== 'math_inline' || !$from.sameParent($to)) return null;
      return DecorationSet.create(state.doc, [Decoration.node($from.before(), $from.after(), { class: 'math-editing' })]);
    },
    handleKeyDown(view, event) {
      const { $from, empty } = view.state.selection;
      if ($from.parent.type.name !== 'math_inline' || event.isComposing || event.keyCode === 229 || view.composing) return false;
      if (event.key === 'Enter' && !event.shiftKey && !event.altKey) {
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, $from.after())).scrollIntoView());
        return true;
      }
      if (event.key === 'ArrowRight' && empty && $from.parentOffset === $from.parent.content.size && !event.shiftKey) {
        view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve($from.after()), 1)).scrollIntoView());
        return true;
      }
      if (event.key === 'ArrowLeft' && empty && $from.parentOffset === 0 && !event.shiftKey) {
        view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve($from.before()), -1)).scrollIntoView());
        return true;
      }
      return false;
    },
    nodeViews: {
      math_inline(initialNode, view, getPos) {
        let node = initialNode;
        let rendered: string | null = null;
        const dom = document.createElement('span');
        dom.dataset.mathInline = '';
        const contentDOM = document.createElement('span');
        contentDOM.dataset.mathSource = '';
        contentDOM.spellcheck = false;
        contentDOM.setAttribute('aria-label', 'LaTeX 行内公式源码');
        const preview = document.createElement('span');
        preview.dataset.mathPreview = '';
        preview.contentEditable = 'false';
        preview.setAttribute('role', 'math');
        dom.append(contentDOM, preview);
        const sync = () => {
          const text = node.textContent;
          if (text === rendered) return;
          rendered = text;
          renderMath(preview, text, false);
        };
        sync();
        preview.addEventListener('mousedown', (event) => {
          event.preventDefault();
          const pos = getPos();
          if (!view.editable || pos === undefined || event.button !== 0) return;
          view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos + 1 + node.content.size)));
          view.focus();
        });
        return {
          dom,
          contentDOM,
          update(next) {
            if (next.type !== node.type) return false;
            node = next;
            sync();
            return true;
          },
          stopEvent: (event) => event.target instanceof Node && preview.contains(event.target),
          ignoreMutation: (mutation) => mutation.type !== 'selection' && preview.contains(mutation.target)
        };
      }
    }
  }
}));
