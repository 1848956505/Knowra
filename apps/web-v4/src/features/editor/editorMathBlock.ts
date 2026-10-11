import katex from 'katex';
import 'katex/dist/katex.min.css';
import { mathFromMarkdown, mathToMarkdown } from 'mdast-util-math';
import { math } from 'micromark-extension-math';
import { setBlockType } from '@milkdown/kit/prose/commands';
import { Plugin, PluginKey, TextSelection, type Command } from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';
import { $nodeSchema, $prose, $remark } from '@milkdown/kit/utils';

interface MarkdownNode {
  type: string;
  value?: string;
  children?: MarkdownNode[];
  position?: { start: { offset?: number }; end: { offset?: number } };
}

/**
 * 块级 `$$`、行内 `$x$` 解析。只保留 mdast-util-math 的 handlers，不加入会转义每个普通 `$` 的 unsafe 规则，
 * 避免保存时改写含金额的正文。
 */
export const mathRemark = $remark('mathBlock', () => function mathPlugin(this: unknown) {
  const data = (this as { data(): Record<string, unknown[] | undefined> }).data();
  (data.micromarkExtensions ??= []).push(math({ singleDollarTextMath: true }));
  (data.fromMarkdownExtensions ??= []).push(mathFromMarkdown());
  (data.toMarkdownExtensions ??= []).push({
    handlers: mathToMarkdown().handlers,
    unsafe: [
      { character: '\r', inConstruct: 'mathFlowMeta' },
      { character: '\n', inConstruct: 'mathFlowMeta' },
      { character: '$', inConstruct: 'mathFlowMeta' },
      { atBreak: true, character: '$', after: '\\$' }
    ]
  });
} as never);

/** 单个 `$` 的行内公式按 Pandoc 规则判定：首尾不得是空白，结束符后不得紧跟数字；否则还原为普通文本（如 “$5 和 $6”）。 */
export const mathInlineGuardRemark = $remark('mathInlineGuard', () => () => (tree, file) => {
  const source = String(file.value ?? '');
  const visit = (node: MarkdownNode) => {
    if (!node.children) return;
    node.children = node.children.map((child) => {
      if (child.type !== 'inlineMath') return child;
      const start = child.position?.start.offset;
      const end = child.position?.end.offset;
      if (start === undefined || end === undefined) return child;
      const raw = source.slice(start, end);
      if (raw.startsWith('$$')) return child;
      const value = child.value ?? '';
      if (/^\s|\s$/.test(value) || /\d/.test(source[end] ?? '')) return { type: 'text', value: raw };
      return child;
    });
    node.children.forEach(visit);
  };
  visit(tree as unknown as MarkdownNode);
});

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

/** 去掉从 LaTeX 文档/AI 回答复制来的最外层 `\[ \]` 或 `\( \)`，公式块本身已是行间环境。 */
export function stripTexDelimiters(source: string): string {
  const match = /^\s*(?:\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\))\s*$/.exec(source);
  return match ? (match[1] ?? match[2] ?? '') : source;
}

/** 粘贴文本里的 `\[…\]` / `\(…\)` 转为 `$$` 块与 `$…$` 行内公式。 */
export function convertTexMathDelimiters(text: string): string {
  return text
    .replace(/\\\[([\s\S]+?)\\\]/g, (all, body: string) => (body.trim() ? `\n\n$$\n${body.trim()}\n$$\n\n` : all))
    .replace(/\\\(([\s\S]+?)\\\)/g, (all, body: string) => (body.trim() ? `$${body.trim()}$` : all));
}

export function renderMath(target: HTMLElement, source: string, displayMode = true): void {
  target.classList.remove('math-error');
  source = stripTexDelimiters(source);
  if (!source.trim()) {
    target.textContent = '';
    target.dataset.empty = '';
    return;
  }
  delete target.dataset.empty;
  try {
    katex.render(source, target, { displayMode, throwOnError: true, strict: 'ignore', trust: false, output: 'htmlAndMathml' });
  } catch (error) {
    target.classList.add('math-error');
    target.textContent = error instanceof Error ? error.message.replace(/^KaTeX parse error:\s*/, '') : '公式无法渲染';
  }
}

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
      math_block(initialNode, view, getPos) {
        let node = initialNode;
        let rendered: string | null = null;
        const dom = document.createElement('div');
        dom.dataset.mathBlock = '';
        const source = document.createElement('pre');
        source.dataset.mathSource = '';
        const contentDOM = document.createElement('code');
        contentDOM.spellcheck = false;
        contentDOM.setAttribute('aria-label', 'LaTeX 公式源码');
        source.append(contentDOM);
        const preview = document.createElement('div');
        preview.dataset.mathPreview = '';
        preview.contentEditable = 'false';
        preview.setAttribute('role', 'math');
        dom.append(source, preview);
        const sync = () => {
          const text = node.textContent;
          if (text === rendered) return;
          rendered = text;
          renderMath(preview, text);
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
