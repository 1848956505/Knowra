import { setBlockType } from '@milkdown/kit/prose/commands';
import { Plugin, PluginKey, TextSelection, type Command } from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';
import { $nodeSchema, $prose } from '@milkdown/kit/utils';
import { createMathNodeView } from './editorMathNodeView';

export const mathBlockSchema = $nodeSchema('math_block', () => ({
  content: 'text*',
  group: 'block',
  marks: '',
  code: true,
  defining: true,
  isolating: true,
  parseDOM: [{ tag: 'pre[data-math-block]', preserveWhitespace: 'full' as const, contentElement: 'code' }],
  toDOM: () => ['pre', { 'data-math-block': '' }, ['code', 0]] as const,
  parseMarkdown: {
    match: (node) => node.type === 'math',
    runner: (state, node, type) => {
      state.openNode(type);
      if (node.value) state.addText(node.value as string);
      state.closeNode();
    }
  },
  toMarkdown: {
    match: (node) => node.type.name === 'math_block',
    runner: (state, node) => {
      state.addNode('math', undefined, node.textContent);
    }
  }
}));

/** 在空段落输入 `$$` 后回车，转为公式块（对齐 Typora）。 */
export const createMathFromFence: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.parent.type.name !== 'paragraph' || $from.parentOffset !== $from.parent.content.size) return false;
  const type = state.schema.nodes.math_block;
  if (!type || !/^\s{0,3}\$\$\s*$/.test($from.parent.textContent)) return false;
  const tr = state.tr.delete($from.start(), $from.end()).setBlockType($from.before(), $from.before() + 1, type);
  dispatch?.(tr.scrollIntoView());
  return true;
};

/** 菜单/快捷键：空段落直接转换，否则在当前块下方插入；已在公式块内则还原为正文。 */
export const insertMathBlock: Command = (state, dispatch) => {
  const type = state.schema.nodes.math_block;
  const paragraph = state.schema.nodes.paragraph;
  if (!type || !paragraph) return false;
  const { $from } = state.selection;
  if ($from.parent.type === type) {
    return setBlockType(paragraph)(state, dispatch);
  }
  const depth = $from.depth;
  if (depth < 1 || !$from.parent.isTextblock) return false;
  if ($from.parent.content.size === 0) return setBlockType(type)(state, dispatch ? (tr) => dispatch(tr.scrollIntoView()) : undefined);
  const container = $from.node(depth - 1);
  const index = $from.indexAfter(depth - 1);
  if (!container.canReplaceWith(index, index, type)) return false;
  if (dispatch) {
    const pos = $from.after(depth);
    const node = type.create();
    const tr = state.tr.insert(pos, node);
    if (depth === 1 && pos === state.doc.content.size) tr.insert(pos + node.nodeSize, paragraph.create());
    tr.setSelection(TextSelection.create(tr.doc, pos + 1));
    dispatch(tr.scrollIntoView());
  }
  return true;
};

const EDITING_KEY = new PluginKey<DecorationSet>('V4_MATH_BLOCK_EDITING');

/** 光标在公式块内时显示源码；离开后仅显示渲染结果。 */
export const mathBlockBehavior = $prose(() => new Plugin({
  key: EDITING_KEY,
  props: {
    decorations(state) {
      const { $from, $to } = state.selection;
      if ($from.parent.type.name !== 'math_block' || !$from.sameParent($to)) return null;
      return DecorationSet.create(state.doc, [Decoration.node($from.before(), $from.after(), { class: 'math-editing' })]);
    },
    nodeViews: {
      math_block: createMathNodeView(true)
    }
  }
}));
