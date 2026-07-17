import {
  captureScrollPosition,
  getSavedScrollTop,
  readScrollPositions,
  writeScrollPositions
} from '../../../lib/editor/scroll-positions.js';

export function createEditorScrollController(deps) {
  const {
    editorRuntime,
    storageKey
  } = deps;

  const positions = {};
  const getStorage = () => deps.storage ?? globalThis.window?.localStorage;
  const getDocument = () => deps.documentRef ?? globalThis.document;
  const requestFrame = (callback) => {
    const schedule = deps.requestAnimationFrameRef ?? globalThis.requestAnimationFrame;
    if (typeof schedule === 'function') {
      schedule(callback);
      return;
    }
    callback();
  };

function getEditorScrollRoot() {
  const documentRef = getDocument();
  return documentRef?.getElementById?.('editor-scroll-region')
    ?? documentRef?.getElementById?.('milkdown-editor')
    ?? null;
}

function saveCurrentEditorScrollPosition() {
  const root = getEditorScrollRoot();
  if (root) {
    captureScrollPosition(positions, editorRuntime.currentEditorNoteId, root.scrollTop);
  }
}

function restoreEditorScrollPosition(noteId) {
  const root = getEditorScrollRoot();
  const saved = getSavedScrollTop(positions, noteId);
  if (root && saved) {
    requestFrame(() => {
      root.scrollTop = saved;
    });
  }
}

function persistScrollPositions() {
  writeScrollPositions(getStorage(), storageKey, positions);
}

function loadScrollPositions() {
  Object.assign(positions, readScrollPositions(getStorage(), storageKey));
}

  return {
    saveCurrentEditorScrollPosition,
    restoreEditorScrollPosition,
    persistScrollPositions,
    loadScrollPositions
  };
}
