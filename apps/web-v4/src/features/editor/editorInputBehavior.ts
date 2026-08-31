import { liftEmptyBlock } from '@milkdown/kit/prose/commands';
import type { ResolvedPos } from '@milkdown/kit/prose/model';
import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import { $prose } from '@milkdown/kit/utils';

const STRUCTURED_BLOCKS = new Set(['list_item', 'blockquote']);

export interface EditorBoundaryInput {
  key: string;
  selectionEmpty: boolean;
  parentEmpty: boolean;
  parentOffset: number;
  ancestors: string[];
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  isComposing?: boolean;
  keyCode?: number;
  viewComposing?: boolean;
}

export type EditorBoundaryAction = 'lift-empty-structured-block' | null;

export function resolveEditorBoundaryAction(input: EditorBoundaryInput): EditorBoundaryAction {
  if (
    input.isComposing
    || input.keyCode === 229
    || input.viewComposing
    || input.ctrlKey
    || input.metaKey
    || input.altKey
    || input.shiftKey
  ) {
    return null;
  }
  if (input.key !== 'Enter' && input.key !== 'Backspace') return null;
  if (!input.selectionEmpty || !input.parentEmpty || input.parentOffset !== 0) return null;
  return input.ancestors.some((name) => STRUCTURED_BLOCKS.has(name))
    ? 'lift-empty-structured-block'
    : null;
}

export const editorInputBehavior = $prose(() => new Plugin({
  key: new PluginKey('V4_EDITOR_INPUT_BEHAVIOR'),
  props: {
    handleKeyDown(view, event) {
      const { selection } = view.state;
      const action = resolveEditorBoundaryAction({
        key: event.key,
        selectionEmpty: selection.empty,
        parentEmpty: selection.$from.parent.content.size === 0,
        parentOffset: selection.$from.parentOffset,
        ancestors: collectAncestorNames(selection.$from),
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        isComposing: event.isComposing,
        keyCode: event.keyCode,
        viewComposing: view.composing
      });
      if (action !== 'lift-empty-structured-block') return false;
      return liftEmptyBlock(view.state, view.dispatch);
    }
  }
}));

function collectAncestorNames($from: ResolvedPos): string[] {
  const names: string[] = [];
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    names.push($from.node(depth).type.name);
  }
  return names;
}
