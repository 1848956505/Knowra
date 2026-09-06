import { liftEmptyBlock } from '@milkdown/kit/prose/commands';
import type { ResolvedPos } from '@milkdown/kit/prose/model';
import { Plugin, PluginKey, TextSelection } from '@milkdown/kit/prose/state';
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

export interface TrailingCodeBlockClickInput {
  button: number;
  clientY: number;
  lastBlockBottom: number;
  lastNodeType: string | null;
  editable: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}

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

export function shouldInsertParagraphAfterTrailingCodeBlock(
  input: TrailingCodeBlockClickInput
): boolean {
  return input.editable
    && input.button === 0
    && !input.ctrlKey
    && !input.metaKey
    && !input.altKey
    && !input.shiftKey
    && input.lastNodeType === 'code_block'
    && input.clientY > input.lastBlockBottom;
}

export const editorInputBehavior = $prose(() => new Plugin({
  key: new PluginKey('V4_EDITOR_INPUT_BEHAVIOR'),
  props: {
    handleDOMEvents: {
      mousedown(view, event) {
        const lastElement = view.dom.lastElementChild;
        if (!(event instanceof MouseEvent) || !(lastElement instanceof HTMLElement)) return false;
        if (!shouldInsertParagraphAfterTrailingCodeBlock({
          button: event.button,
          clientY: event.clientY,
          lastBlockBottom: lastElement.getBoundingClientRect().bottom,
          lastNodeType: view.state.doc.lastChild?.type.name ?? null,
          editable: view.editable,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          altKey: event.altKey,
          shiftKey: event.shiftKey
        })) return false;

        const paragraphNodeType = view.state.schema.nodes.paragraph;
        if (!paragraphNodeType) return false;
        const insertPos = view.state.doc.content.size;
        const transaction = view.state.tr.insert(insertPos, paragraphNodeType.create());
        transaction.setSelection(TextSelection.create(transaction.doc, insertPos + 1));
        view.dispatch(transaction.scrollIntoView());
        view.focus();
        event.preventDefault();
        return true;
      }
    },
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
