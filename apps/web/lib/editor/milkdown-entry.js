import '@milkdown/prose/view/style/prosemirror.css';

import { Editor, defaultValueCtx, editorViewCtx, rootCtx, schemaCtx } from '@milkdown/core';
import { listener, listenerCtx } from '@milkdown/plugin-listener';
import { getNodeFromSchema } from '@milkdown/prose';
import { liftEmptyBlock, splitBlock } from '@milkdown/prose/commands';
import { Plugin, PluginKey, TextSelection } from '@milkdown/prose/state';
import {
  commonmark,
  createCodeBlockCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleStrongCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInHeadingCommand,
  wrapInOrderedListCommand,
  insertHrCommand
} from '@milkdown/preset-commonmark';
import { gfm } from '@milkdown/preset-gfm';
import { $command, $prose, callCommand, getMarkdown, replaceAll } from '@milkdown/utils';
import { resolveEnterBehavior, shouldKeepTrailingBlank } from './enter-behavior.js';


const turnIntoTaskListCommand = $command('TurnIntoTaskList', (ctx) => () => (state, dispatch) => {
  const schema = ctx.get(schemaCtx);
  const paragraphNodeType = getNodeFromSchema('paragraph', schema);
  const listItemNodeType = getNodeFromSchema('list_item', schema);
  const bulletListNodeType = getNodeFromSchema('bullet_list', schema);

  if (!paragraphNodeType || !listItemNodeType || !bulletListNodeType) {
    return false;
  }

  const { $from, $to } = state.selection;
  const from = $from.start($from.depth);
  const to = $to.end($to.depth);

  const paragraphContent = state.doc.slice(from, to).content;
  const taskListItem = listItemNodeType.create(
    { checked: false },
    [paragraphNodeType.create(null, paragraphContent)]
  );
  const bulletList = bulletListNodeType.create(null, [taskListItem]);
  const tr = state.tr.replaceRangeWith(from, to, bulletList);
  dispatch(tr.scrollIntoView());
  return true;
});

const commandResolvers = {
  'heading-1': () => ({ key: wrapInHeadingCommand.key, payload: 1 }),
  'heading-2': () => ({ key: wrapInHeadingCommand.key, payload: 2 }),
  'heading-3': () => ({ key: wrapInHeadingCommand.key, payload: 3 }),
  'heading-4': () => ({ key: wrapInHeadingCommand.key, payload: 4 }),
  bold: () => ({ key: toggleStrongCommand.key }),
  italic: () => ({ key: toggleEmphasisCommand.key }),
  quote: () => ({ key: wrapInBlockquoteCommand.key }),
  bullet: () => ({ key: wrapInBulletListCommand.key }),
  ordered: () => ({ key: wrapInOrderedListCommand.key }),
  code: () => ({ key: toggleInlineCodeCommand.key }),
  codeblock: () => ({ key: createCodeBlockCommand.key, payload: '' }),
  hr: () => ({ key: insertHrCommand.key }),
  'task-list': () => ({ key: turnIntoTaskListCommand.key })
};

function normalizeMarkdown(markdown) {
  return typeof markdown === 'string' ? markdown : '';
}

function getLastTextblockInfo(doc) {
  let lastBlock = null;
  doc.descendants((node, pos) => {
    if (node.isTextblock) {
      lastBlock = { node, pos };
    }
  });
  return lastBlock;
}

function getTrailingBlankCount(doc) {
  const textblocks = [];
  doc.descendants((node) => {
    if (node.isTextblock) {
      textblocks.push(node);
    }
  });

  let count = 0;
  for (let index = textblocks.length - 1; index >= 0; index -= 1) {
    const node = textblocks[index];
    if (node.type.name !== 'paragraph' || node.textContent.trim().length > 0) {
      break;
    }
    count += 1;
  }

  return count;
}

function getStructuredContext($from) {
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const typeName = $from.node(depth).type.name;
    if (typeName === 'code_block' || typeName === 'list_item' || typeName === 'blockquote') {
      return { type: typeName, depth };
    }
  }

  return null;
}

function getCurrentLineText(textContent, parentOffset) {
  const nextBreak = textContent.indexOf('\n', parentOffset);
  const lineEnd = nextBreak === -1 ? textContent.length : nextBreak;
  const previousBreak = textContent.lastIndexOf('\n', Math.max(0, parentOffset - 1));
  const lineStart = previousBreak === -1 ? 0 : previousBreak + 1;
  return textContent.slice(lineStart, lineEnd);
}

function exitCodeBlock(view, paragraphNodeType, depth) {
  if (!paragraphNodeType) {
    return false;
  }

  const { state } = view;
  const insertPos = state.selection.$from.after(depth);
  const tr = state.tr.insert(insertPos, paragraphNodeType.create());
  tr.setSelection(TextSelection.create(tr.doc, insertPos + 1));

  view.dispatch(tr.scrollIntoView());
  return true;
}

function handleTrailingBlankEnter(view, paragraphNodeType) {
  if (!paragraphNodeType) {
    return false;
  }

  let nextTransaction = null;
  const didSplit = splitBlock(view.state, (tr) => {
    nextTransaction = tr;
  });

  if (!didSplit || !nextTransaction) {
    return false;
  }

  const selectionPos = nextTransaction.selection.from;
  const insertPos = nextTransaction.selection.$from.after(nextTransaction.selection.$from.depth);
  nextTransaction.insert(insertPos, paragraphNodeType.create());
  nextTransaction.setSelection(TextSelection.create(nextTransaction.doc, selectionPos));
  view.dispatch(nextTransaction.scrollIntoView());
  return true;
}

const enhancedEnterBehavior = $prose((ctx) => {
  const schema = ctx.get(schemaCtx);
  const paragraphNodeType = getNodeFromSchema('paragraph', schema);

  return new Plugin({
    key: new PluginKey('STUDY_ENHANCED_ENTER_BEHAVIOR'),
    props: {
      handleKeyDown(view, event) {
        if (
          event.key !== 'Enter'
          || event.shiftKey
          || event.altKey
          || event.metaKey
          || event.ctrlKey
        ) {
          return false;
        }

        const { state } = view;
        if (!state.selection.empty || !state.selection.$from.parent.isTextblock) {
          return false;
        }

        const { $from } = state.selection;
        const structuredContext = getStructuredContext($from);
        const parentType = structuredContext?.type ?? $from.parent.type.name;
        const parentIsBlank = structuredContext?.type === 'code_block'
          ? getCurrentLineText($from.parent.textContent, $from.parentOffset).trim().length === 0
          : $from.parent.textContent.trim().length === 0;
        const behavior = resolveEnterBehavior({ parentType, parentIsBlank });

        if (behavior === 'exit-structured-block') {
          if (structuredContext?.type === 'code_block') {
            event.preventDefault();
            return exitCodeBlock(view, paragraphNodeType, structuredContext.depth);
          }

          const lifted = liftEmptyBlock(state, (tr) => {
            view.dispatch(tr.scrollIntoView());
          });
          if (lifted) {
            event.preventDefault();
          }
          return lifted;
        }

        const lastTextblock = getLastTextblockInfo(state.doc);
        const currentBlockPos = $from.before($from.depth);
        const shouldAppendTrailingBlank = shouldKeepTrailingBlank({
          docIsEmpty: state.doc.textContent.trim().length === 0,
          atDocEnd: (
            $from.parentOffset === $from.parent.content.size
            && lastTextblock?.pos === currentBlockPos
          ),
          currentBlockIsBlank: $from.parent.textContent.trim().length === 0,
          trailingBlankCount: getTrailingBlankCount(state.doc),
          parentType: $from.parent.type.name
        });

        if (!shouldAppendTrailingBlank) {
          return false;
        }

        event.preventDefault();
        return handleTrailingBlankEnter(view, paragraphNodeType);
      }
    }
  });
});

export class MilkdownHost {
  constructor({ root, markdown = '', onChange } = {}) {
    if (!(root instanceof HTMLElement)) {
      throw new Error('MilkdownHost requires a valid root element.');
    }

    this.root = root;
    this.onChange = typeof onChange === 'function' ? onChange : null;
    this.editor = null;
    this.ready = this.mount(normalizeMarkdown(markdown));
  }

  async mount(markdown) {
    const host = this;

    this.editor = Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, host.root);
        ctx.set(defaultValueCtx, markdown);
        ctx.get(listenerCtx).markdownUpdated((listenerCtxValue, nextMarkdown) => {
          host.onChange?.(nextMarkdown, listenerCtxValue);
        });
      })
      .use(commonmark)
      .use(listener)
      .use(gfm)
      .use(enhancedEnterBehavior);

    await this.editor.create();
    this.root.dataset.editorReady = 'true';
    return this;
  }

  async setMarkdown(markdown) {
    await this.ready;
    this.editor.action(replaceAll(normalizeMarkdown(markdown), true));
  }

  async getMarkdown() {
    await this.ready;
    return this.editor.action(getMarkdown());
  }

  async run(commandKey) {
    await this.ready;
    const resolve = commandResolvers[commandKey];
    if (!resolve) {
      return false;
    }

    const { key, payload } = resolve();
    return this.editor.action(callCommand(key, payload));
  }

  async focus() {
    await this.ready;
    const view = this.editor.ctx.get(editorViewCtx);
    view.focus();
  }

  async selectTextRange({ startNode, startOffset, endNode, endOffset } = {}) {
    await this.ready;

    if (!startNode || !endNode) {
      return false;
    }

    const view = this.editor.ctx.get(editorViewCtx);
    const from = view.posAtDOM(startNode, startOffset ?? 0);
    const to = view.posAtDOM(endNode, endOffset ?? 0);

    if (typeof from !== 'number' || typeof to !== 'number') {
      return false;
    }

    const selection = TextSelection.create(view.state.doc, Math.min(from, to), Math.max(from, to));
    const transaction = view.state.tr.setSelection(selection).scrollIntoView();
    view.dispatch(transaction);
    view.focus();
    return true;
  }

  async findAndSelectNext(query, previousMatchIndex = -1) {
    await this.ready;

    const needle = typeof query === 'string' ? query.trim() : '';
    if (!needle) {
      return { found: false, count: 0, index: -1 };
    }

    const view = this.editor.ctx.get(editorViewCtx);
    const matches = collectDocumentTextMatches(view.state.doc, needle);
    if (!matches.length) {
      return { found: false, count: 0, index: -1 };
    }

    const index = previousMatchIndex >= 0 ? (previousMatchIndex + 1) % matches.length : 0;
    const match = matches[index];
    const selection = TextSelection.create(view.state.doc, match.from, match.to);
    view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());
    view.focus();

    return {
      found: true,
      count: matches.length,
      index
    };
  }

  async destroy() {
    if (!this.editor) {
      return;
    }

    await this.ready;
    await this.editor.destroy();
    this.root.dataset.editorReady = 'false';
    this.editor = null;
  }
}

export function createMilkdownHost(options) {
  return new MilkdownHost(options);
}

function collectDocumentTextMatches(doc, needle) {
  const matches = [];

  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) {
      return;
    }

    let startIndex = node.text.indexOf(needle);
    while (startIndex !== -1) {
      const from = pos + startIndex;
      const to = from + needle.length;
      matches.push({ from, to });
      startIndex = node.text.indexOf(needle, startIndex + Math.max(1, needle.length));
    }
  });

  return matches;
}
