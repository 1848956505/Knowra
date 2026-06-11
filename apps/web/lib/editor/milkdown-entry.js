import '@milkdown/prose/view/style/prosemirror.css';

import { Editor, defaultValueCtx, editorViewCtx, parserCtx, rootCtx, schemaCtx } from '@milkdown/core';
import { clipboard } from '@milkdown/plugin-clipboard';
import { history, redoCommand, undoCommand } from '@milkdown/plugin-history';
import { listener, listenerCtx } from '@milkdown/plugin-listener';
import { getNodeFromSchema } from '@milkdown/prose';
import { liftEmptyBlock, splitBlock } from '@milkdown/prose/commands';
import { Slice } from '@milkdown/prose/model';
import { Plugin, PluginKey, TextSelection } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';
import {
  commonmark,
  createCodeBlockCommand,
  liftListItemCommand,
  setBlockTypeCommand,
  sinkListItemCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleStrongCommand,
  turnIntoTextCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInHeadingCommand,
  wrapInOrderedListCommand,
  insertHrCommand
} from '@milkdown/preset-commonmark';
import { gfm, toggleStrikethroughCommand, insertTableCommand } from '@milkdown/preset-gfm';
import { $command, $prose, callCommand, getMarkdown, replaceAll } from '@milkdown/utils';
import { resolveEnterBehavior, shouldKeepTrailingBlank } from './enter-behavior.js';
import { resolveMatchNavigationIndex } from './find-navigation.js';
import { removeSpuriousEmptyCodeBlocks, shouldPreferPlainMarkdown } from './markdown-paste.js';

const insertLinkCommand = $command('InsertLink', (ctx) => () => (state, dispatch) => {
  const { selection } = state;
  const { $from, $to, empty } = selection;

  const linkText = empty ? 'link' : state.doc.textBetween($from.pos, $to.pos);
  const markdown = `[${linkText}](https://)`;

  const tr = empty
    ? state.tr.insertText(markdown, $from.pos)
    : state.tr.replaceWith($from.pos, $to.pos, state.schema.text(markdown));

  const urlStart = empty ? $from.pos + linkText.length + 3 : $from.pos + linkText.length + 3;
  const urlEnd = urlStart + 7;
  tr.setSelection(TextSelection.create(tr.doc, urlStart, urlEnd));
  dispatch(tr.scrollIntoView());
  return true;
});

const insertImageCommand = $command('InsertImage', (ctx) => () => (state, dispatch) => {
  const { selection } = state;
  const { $from, $to, empty } = selection;

  const altText = empty ? 'image' : state.doc.textBetween($from.pos, $to.pos);
  const markdown = `![${altText}](https://)`;

  const tr = empty
    ? state.tr.insertText(markdown, $from.pos)
    : state.tr.replaceWith($from.pos, $to.pos, state.schema.text(markdown));

  const urlStart = empty ? $from.pos + altText.length + 4 : $from.pos + altText.length + 4;
  const urlEnd = urlStart + 7;
  tr.setSelection(TextSelection.create(tr.doc, urlStart, urlEnd));
  dispatch(tr.scrollIntoView());
  return true;
});
const insertInternalLinkCommand = $command('InsertInternalLink', (ctx) => () => (state, dispatch) => {
  const { selection } = state;
  const { $from, $to, empty } = selection;

  const linkText = empty ? '内部链接' : state.doc.textBetween($from.pos, $to.pos);
  const markdown = `[[${linkText}]]`;

  const tr = empty
    ? state.tr.insertText(markdown, $from.pos)
    : state.tr.replaceWith($from.pos, $to.pos, state.schema.text(markdown));

  const linkStart = $from.pos + 2;
  const linkEnd = linkStart + linkText.length;
  tr.setSelection(TextSelection.create(tr.doc, linkStart, linkEnd));
  dispatch(tr.scrollIntoView());
  return true;
});
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
  'paragraph': () => ({ key: turnIntoTextCommand.key }),
  'heading-1': () => ({ key: wrapInHeadingCommand.key, payload: 1 }),
  'heading-2': () => ({ key: wrapInHeadingCommand.key, payload: 2 }),
  'heading-3': () => ({ key: wrapInHeadingCommand.key, payload: 3 }),
  'heading-4': () => ({ key: wrapInHeadingCommand.key, payload: 4 }),
  'heading-5': () => ({ key: wrapInHeadingCommand.key, payload: 5 }),
  'heading-6': () => ({ key: wrapInHeadingCommand.key, payload: 6 }),
  bold: () => ({ key: toggleStrongCommand.key }),
  italic: () => ({ key: toggleEmphasisCommand.key }),
  quote: () => ({ key: wrapInBlockquoteCommand.key }),
  bullet: () => ({ key: wrapInBulletListCommand.key }),
  ordered: () => ({ key: wrapInOrderedListCommand.key }),
  code: () => ({ key: toggleInlineCodeCommand.key }),
  codeblock: () => ({ key: createCodeBlockCommand.key, payload: '' }),
  hr: () => ({ key: insertHrCommand.key }),
  'task-list': () => ({ key: turnIntoTaskListCommand.key }),
  strikethrough: () => ({ key: toggleStrikethroughCommand.key }),
  link: () => ({ key: insertLinkCommand.key }),
  image: () => ({ key: insertImageCommand.key }),
  'internal-link': () => ({ key: insertInternalLinkCommand.key }),
  table: () => ({ key: insertTableCommand.key, payload: { row: 3, col: 3 } }),
  undo: () => ({ key: undoCommand.key }),
  redo: () => ({ key: redoCommand.key })
};
const findHighlightPluginKey = new PluginKey('STUDY_FIND_HIGHLIGHTS');

function findAncestorOfType($pos, typeNames) {
  const names = typeNames instanceof Set ? typeNames : new Set(typeNames);
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (names.has(node.type.name)) {
      return {
        depth,
        node,
        pos: $pos.before(depth)
      };
    }
  }

  return null;
}

function isSelectionInsideSingleTextblock(state, typeName, attrs = null) {
  const { $from, $to } = state.selection;
  if ($from.parent !== $to.parent || $from.parent.type.name !== typeName) {
    return false;
  }

  if (!attrs) {
    return true;
  }

  return Object.entries(attrs).every(([key, value]) => $from.parent.attrs?.[key] === value);
}

function toggleParagraph(editor, schema) {
  const paragraphNodeType = getNodeFromSchema('paragraph', schema);
  if (!paragraphNodeType) {
    return false;
  }

  return executeCallCommand(editor, setBlockTypeCommand.key, {
    nodeType: paragraphNodeType,
    attrs: null
  });
}

function setHeadingLevel(editor, schema, level) {
  const headingNodeType = getNodeFromSchema('heading', schema);
  if (!headingNodeType) {
    return false;
  }

  return executeCallCommand(editor, setBlockTypeCommand.key, {
    nodeType: headingNodeType,
    attrs: { level }
  });
}

function executeCallCommand(editor, key, payload) {
  return editor.action(callCommand(key, payload));
}

async function handleHeadingShortcut(editor, level) {
  const view = editor.ctx.get(editorViewCtx);
  const schema = editor.ctx.get(schemaCtx);

  if (isSelectionInsideSingleTextblock(view.state, 'heading', { level })) {
    return toggleParagraph(editor, schema);
  }

  return setHeadingLevel(editor, schema, level);
}

async function handleParagraphShortcut(editor) {
  const schema = editor.ctx.get(schemaCtx);
  return toggleParagraph(editor, schema);
}

async function handleListShortcut(editor, commandKey) {
  const view = editor.ctx.get(editorViewCtx);
  const schema = editor.ctx.get(schemaCtx);
  const targetTypeName = commandKey === 'ordered' ? 'ordered_list' : 'bullet_list';
  const otherTypeName = commandKey === 'ordered' ? 'bullet_list' : 'ordered_list';
  const targetNodeType = getNodeFromSchema(targetTypeName, schema);
  const listAncestor = findAncestorOfType(view.state.selection.$from, new Set(['bullet_list', 'ordered_list']));

  if (!targetNodeType) {
    return false;
  }

  if (listAncestor?.node.type.name === targetTypeName) {
    return executeCallCommand(editor, liftListItemCommand.key);
  }

  if (listAncestor?.node.type.name === otherTypeName) {
    const attrs = targetTypeName === 'ordered_list'
      ? { order: 1, spread: listAncestor.node.attrs?.spread ?? false }
      : { spread: listAncestor.node.attrs?.spread ?? false };
    const tr = view.state.tr.setNodeMarkup(listAncestor.pos, targetNodeType, attrs);
    view.dispatch(tr.scrollIntoView());
    return true;
  }

  const wrapCommand = commandKey === 'ordered' ? wrapInOrderedListCommand.key : wrapInBulletListCommand.key;
  return executeCallCommand(editor, wrapCommand);
}

async function handleIndentShortcut(editor) {
  const view = editor.ctx.get(editorViewCtx);
  const listItemAncestor = findAncestorOfType(view.state.selection.$from, new Set(['list_item']));
  if (listItemAncestor) {
    return executeCallCommand(editor, sinkListItemCommand.key);
  }

  const tr = view.state.tr.insertText('    ', view.state.selection.from, view.state.selection.to);
  view.dispatch(tr.scrollIntoView());
  return true;
}

async function handleOutdentShortcut(editor) {
  const view = editor.ctx.get(editorViewCtx);
  const listItemAncestor = findAncestorOfType(view.state.selection.$from, new Set(['list_item']));
  if (listItemAncestor) {
    return executeCallCommand(editor, liftListItemCommand.key);
  }

  const { state } = view;
  if (!isSelectionInsideSingleTextblock(state, state.selection.$from.parent.type.name)) {
    return false;
  }

  const text = state.selection.$from.parent.textContent;
  const removeLength = text.startsWith('\t') ? 1 : text.startsWith('  ') ? 2 : text.startsWith(' ') ? 1 : 0;
  if (removeLength === 0) {
    return false;
  }

  const start = state.selection.$from.start();
  const tr = state.tr.delete(start, start + removeLength);
  view.dispatch(tr.scrollIntoView());
  return true;
}

function normalizeMarkdown(markdown) {
  return typeof markdown === 'string' ? markdown : '';
}

function parseMarkdownSlice(ctx, markdown) {
  const text = normalizeMarkdown(markdown);
  if (!text) {
    return null;
  }

  const parser = ctx.get(parserCtx);
  const parsed = parser(text);
  if (!parsed || typeof parsed === 'string') {
    return null;
  }

  let content = parsed.content;
  while (content.size > 0) {
    const first = content.firstChild;
    if (first && first.type.name === 'paragraph' && first.textContent.trim() === '') {
      content = content.cut(first.nodeSize);
    } else {
      break;
    }
  }
  while (content.size > 0) {
    const last = content.lastChild;
    if (last && last.type.name === 'paragraph' && last.textContent.trim() === '') {
      content = content.cut(0, content.size - last.nodeSize);
    } else {
      break;
    }
  }

  return new Slice(content, 0, 0);
}

const markdownPasteBehavior = $prose((ctx) => new Plugin({
  key: new PluginKey('STUDY_MARKDOWN_PASTE_BEHAVIOR'),
  props: {
    handlePaste(view, event, preProcessedSlice) {
      const clipboardData = event.clipboardData;
      if (!clipboardData || view.state.selection.$from.parent.type.spec.code) {
        return false;
      }

      const html = clipboardData.getData('text/html');
      if (html) {
        const cleanedSlice = removeSpuriousEmptyCodeBlocks(preProcessedSlice);
        if (cleanedSlice !== preProcessedSlice) {
          event.preventDefault();
          view.dispatch(view.state.tr.replaceSelection(cleanedSlice).scrollIntoView());
          return true;
        }
        return false;
      }

      const text = clipboardData.getData('text/plain');
      const vscodeData = clipboardData.getData('vscode-editor-data');
      if (!shouldPreferPlainMarkdown({ text, vscodeData })) {
        return false;
      }

      const slice = parseMarkdownSlice(ctx, text);
      if (!slice) {
        return false;
      }

      event.preventDefault();
      view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
      return true;
    }
  }
}));

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

const findHighlightBehavior = $prose(() => new Plugin({
  key: findHighlightPluginKey,
  state: {
    init: () => ({
      query: '',
      activeIndex: -1,
      decorations: DecorationSet.empty
    }),
    apply(transaction, pluginState) {
      const meta = transaction.getMeta(findHighlightPluginKey);
      const query = typeof meta?.query === 'string' ? meta.query : pluginState.query;
      const activeIndex = typeof meta?.activeIndex === 'number' ? meta.activeIndex : pluginState.activeIndex;

      if (!meta && !transaction.docChanged) {
        return pluginState;
      }

      return {
        query,
        activeIndex,
        decorations: buildFindDecorations(transaction.doc, query, activeIndex)
      };
    }
  },
  props: {
    decorations(state) {
      return findHighlightPluginKey.getState(state)?.decorations ?? null;
    }
  }
}));

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
      .use(history)
      .use(markdownPasteBehavior)
      .use(clipboard)
      .use(gfm)
      .use(enhancedEnterBehavior)
      .use(findHighlightBehavior);

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
    const view = this.editor.ctx.get(editorViewCtx);
    if (commandKey === 'indent') {
      return handleIndentShortcut(this.editor);
    }
    if (commandKey === 'outdent') {
      return handleOutdentShortcut(this.editor);
    }
    if (commandKey === 'paragraph') {
      return handleParagraphShortcut(this.editor);
    }
    if (commandKey.startsWith('heading-')) {
      const level = Number(commandKey.split('-')[1]);
      if (Number.isInteger(level) && level >= 1 && level <= 6) {
        return handleHeadingShortcut(this.editor, level);
      }
    }
    if (commandKey === 'bullet' || commandKey === 'ordered') {
      return handleListShortcut(this.editor, commandKey);
    }

    const resolve = commandResolvers[commandKey];
    if (!resolve) {
      return false;
    }

    const { key, payload } = resolve();
    const result = await this.editor.action(callCommand(key, payload));
    view.focus();
    return result;
  }

  async focus() {
    await this.ready;
    const view = this.editor.ctx.get(editorViewCtx);
    view.focus();
  }

  async pasteMarkdown(markdown) {
    await this.ready;

    const text = normalizeMarkdown(markdown);
    if (!text) {
      return false;
    }

    const view = this.editor.ctx.get(editorViewCtx);
    const slice = parseMarkdownSlice(this.editor.ctx, text);
    if (!slice) {
      return false;
    }

    view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
    view.focus();
    return true;
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
    return this.findAndSelect(query, previousMatchIndex, 'next');
  }

  async findAndSelectPrevious(query, previousMatchIndex = -1) {
    return this.findAndSelect(query, previousMatchIndex, 'previous');
  }

  async findAndSelect(query, previousMatchIndex = -1, direction = 'next') {
    await this.ready;

    const needle = typeof query === 'string' ? query.trim() : '';
    if (!needle) {
      await this.clearSearchHighlights();
      return { found: false, count: 0, index: -1 };
    }

    const view = this.editor.ctx.get(editorViewCtx);
    const matches = collectDocumentTextMatches(view.state.doc, needle);
    if (!matches.length) {
      view.dispatch(
        view.state.tr
          .setMeta(findHighlightPluginKey, { query: needle, activeIndex: -1 })
          .setMeta('addToHistory', false)
      );
      return { found: false, count: 0, index: -1 };
    }

    const index = resolveMatchNavigationIndex({
      currentIndex: previousMatchIndex,
      matchCount: matches.length,
      direction
    });
    const match = matches[index];
    const selection = TextSelection.create(view.state.doc, match.from, match.to);
    view.dispatch(
      view.state.tr
        .setSelection(selection)
        .setMeta(findHighlightPluginKey, { query: needle, activeIndex: index })
        .setMeta('addToHistory', false)
        .scrollIntoView()
    );
    view.focus();

    return {
      found: true,
      count: matches.length,
      index
    };
  }

  async clearSearchHighlights() {
    await this.ready;
    const view = this.editor.ctx.get(editorViewCtx);
    view.dispatch(
      view.state.tr
        .setMeta(findHighlightPluginKey, { query: '', activeIndex: -1 })
        .setMeta('addToHistory', false)
    );
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

function buildFindDecorations(doc, query, activeIndex) {
  const needle = typeof query === 'string' ? query.trim() : '';
  if (!needle) {
    return DecorationSet.empty;
  }

  const matches = collectDocumentTextMatches(doc, needle);
  if (!matches.length) {
    return DecorationSet.empty;
  }

  return DecorationSet.create(
    doc,
    matches.map((match, index) => Decoration.inline(match.from, match.to, {
      class: index === activeIndex
        ? 'editor-find-match editor-find-match-active'
        : 'editor-find-match'
    }))
  );
}
