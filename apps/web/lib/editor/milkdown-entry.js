import '@milkdown/prose/view/style/prosemirror.css';

import { Editor, defaultValueCtx, editorViewCtx, rootCtx } from '@milkdown/core';
import { listener, listenerCtx } from '@milkdown/plugin-listener';
import {
  commonmark,
  createCodeBlockCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleStrongCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInHeadingCommand,
  wrapInOrderedListCommand
} from '@milkdown/preset-commonmark';
import { callCommand, getMarkdown, replaceAll } from '@milkdown/utils';

const commandResolvers = {
  'heading-1': () => ({ key: wrapInHeadingCommand.key, payload: 1 }),
  'heading-2': () => ({ key: wrapInHeadingCommand.key, payload: 2 }),
  'heading-3': () => ({ key: wrapInHeadingCommand.key, payload: 3 }),
  bold: () => ({ key: toggleStrongCommand.key }),
  italic: () => ({ key: toggleEmphasisCommand.key }),
  quote: () => ({ key: wrapInBlockquoteCommand.key }),
  bullet: () => ({ key: wrapInBulletListCommand.key }),
  ordered: () => ({ key: wrapInOrderedListCommand.key }),
  code: () => ({ key: toggleInlineCodeCommand.key }),
  codeblock: () => ({ key: createCodeBlockCommand.key, payload: '' })
};

function normalizeMarkdown(markdown) {
  return typeof markdown === 'string' ? markdown : '';
}

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
      .use(listener);

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
