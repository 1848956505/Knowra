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

export function findCodeBlockPosition(view, event, codeElement) {
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
  if (!Number.isInteger(domPosition)) {
    return null;
  }

  const resolved = view.state.doc.resolve(domPosition);
  return findCodeBlockDepth(resolved) !== null ? domPosition : null;
}

function handleCodeBlockClick(view, event) {
  const currentSelection = view.state.selection;
  if (
    event.button !== 0
    || event.shiftKey
    || event.altKey
    || event.metaKey
    || event.ctrlKey
    || (
      !currentSelection.empty
      && findCodeBlockDepth(currentSelection.$from) !== null
    )
  ) {
    return false;
  }

  const pre = closestFromEventTarget(event.target, 'pre');
  if (!(pre instanceof HTMLElement)) {
    return false;
  }

  const codeElement = pre.querySelector('code');
  if (!(codeElement instanceof HTMLElement)) {
    return false;
  }

  const position = findCodeBlockPosition(view, event, codeElement);
  if (!Number.isInteger(position)) {
    return false;
  }

  const resolved = view.state.doc.resolve(position);
  if (findCodeBlockDepth(resolved) === null) {
    return false;
  }

  event.preventDefault();
  view.dispatch(
    view.state.tr
      .setSelection(TextSelection.near(resolved, 1))
      .scrollIntoView()
  );
  view.focus();
  return true;
}

export const codeBlockInputBehavior = $prose(() => new Plugin({
  key: new PluginKey('KNOWRA_CODE_BLOCK_INPUT'),
  props: {
    handleClick(view, _position, event) {
      return handleCodeBlockClick(view, event);
    }
  }
}));
