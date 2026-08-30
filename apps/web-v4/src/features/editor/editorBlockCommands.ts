import { type Editor, editorViewCtx, schemaCtx } from '@milkdown/kit/core';
import { getNodeFromSchema } from '@milkdown/kit/prose';
import {
  liftListItemCommand,
  setBlockTypeCommand,
  wrapInBulletListCommand,
  wrapInOrderedListCommand
} from '@milkdown/kit/preset/commonmark';
import { callCommand } from '@milkdown/kit/utils';

type ListTypeName = 'bullet_list' | 'ordered_list';

export function runParagraphCommand(editor: Editor): boolean {
  const schema = editor.ctx.get(schemaCtx);
  const paragraphNodeType = getNodeFromSchema('paragraph', schema);
  if (!paragraphNodeType) return false;
  return Boolean(editor.action(callCommand(setBlockTypeCommand.key, {
    nodeType: paragraphNodeType,
    attrs: null
  })));
}

export function runHeadingCommand(editor: Editor, level: number): boolean {
  const view = editor.ctx.get(editorViewCtx);
  const schema = editor.ctx.get(schemaCtx);
  if (isSelectionInsideHeading(view.state, level)) return runParagraphCommand(editor);

  const headingNodeType = getNodeFromSchema('heading', schema);
  if (!headingNodeType) return false;
  return Boolean(editor.action(callCommand(setBlockTypeCommand.key, {
    nodeType: headingNodeType,
    attrs: { level }
  })));
}

export function runListCommand(editor: Editor, targetTypeName: ListTypeName): boolean {
  const view = editor.ctx.get(editorViewCtx);
  const schema = editor.ctx.get(schemaCtx);
  const targetNodeType = getNodeFromSchema(targetTypeName, schema);
  const listAncestor = findListAncestor(view.state.selection.$from);
  if (!targetNodeType) return false;

  if (listAncestor?.node.type.name === targetTypeName) {
    return Boolean(editor.action(callCommand(liftListItemCommand.key)));
  }

  if (listAncestor) {
    const attrs = targetTypeName === 'ordered_list'
      ? { order: 1, spread: listAncestor.node.attrs.spread ?? false }
      : { spread: listAncestor.node.attrs.spread ?? false };
    view.dispatch(view.state.tr.setNodeMarkup(listAncestor.pos, targetNodeType, attrs).scrollIntoView());
    return true;
  }

  const command = targetTypeName === 'ordered_list'
    ? wrapInOrderedListCommand
    : wrapInBulletListCommand;
  return Boolean(editor.action(callCommand(command.key)));
}

function isSelectionInsideHeading(state: ReturnType<typeof getEditorState>, level: number): boolean {
  const { $from, $to } = state.selection;
  return $from.parent === $to.parent
    && $from.parent.type.name === 'heading'
    && $from.parent.attrs.level === level;
}

function getEditorState(editor: Editor) {
  return editor.ctx.get(editorViewCtx).state;
}

function findListAncestor($from: ReturnType<typeof getEditorState>['selection']['$from']) {
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === 'bullet_list' || node.type.name === 'ordered_list') {
      return { node, pos: $from.before(depth) };
    }
  }
  return null;
}
