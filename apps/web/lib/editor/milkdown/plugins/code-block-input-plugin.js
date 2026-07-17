import { Plugin, PluginKey, TextSelection } from '@milkdown/kit/prose/state';
import { $prose } from '@milkdown/kit/utils';
import { closestFromEventTarget } from '../../../dom/event-target.js';

export function findCodeBlockDepth(resolvedPosition) {
  for (let depth = resolvedPosition.depth; depth > 0; depth -= 1) {
    if (resolvedPosition.node(depth).type.name === 'code_block') {
      return depth;
    }
  }
  return null;
}

function getCodeBlockPosition(view, event, codeElement) {
  const coordinatePosition = view.posAtCoords({
    left: event.clientX,
    top: event.clientY
  })?.pos;
  if (Number.isInteger(coordinatePosition)) {
    const resolved = view.state.doc.resolve(coordinatePosition);
    if (findCodeBlockDepth(resolved) !== null) {
      return coordinatePosition;
    }
  }

  const domPosition = view.posAtDOM(codeElement, 0);
  return Number.isInteger(domPosition) ? domPosition : null;
}

export const codeBlockInputBehavior = $prose(() => new Plugin({
  key: new PluginKey('KNOWRA_CODE_BLOCK_INPUT'),
  props: {
    handleDOMEvents: {
      click(view, event) {
        if (
          event.button !== 0
          || event.shiftKey
          || event.altKey
          || event.metaKey
          || event.ctrlKey
          || !view.state.selection.empty
        ) {
          return false;
        }

        const pre = closestFromEventTarget(event.target, 'pre');
        const codeElement = pre?.querySelector('code');
        if (!(pre instanceof HTMLElement) || !(codeElement instanceof HTMLElement)) {
          return false;
        }

        const currentDepth = findCodeBlockDepth(view.state.selection.$from);
        if (currentDepth !== null) {
          return false;
        }

        const position = getCodeBlockPosition(view, event, codeElement);
        if (!Number.isInteger(position)) {
          return false;
        }

        event.preventDefault();
        view.dispatch(
          view.state.tr
            .setSelection(TextSelection.create(view.state.doc, position))
            .scrollIntoView()
        );
        view.focus();
        return true;
      }
    }
  }
}));
