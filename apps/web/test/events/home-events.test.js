import assert from 'node:assert/strict';
import { bindHomeEvents } from '../../lib/events/home-events.js';
import { createRecorderElement } from '../_support/recorder-elements.js';

function closestMap(entries) {
  const map = new Map(entries);
  return (selector) => map.get(selector) ?? null;
}

const elements = { homeWorkspaceView: createRecorderElement() };
const calls = { returns: [], opened: [] };
bindHomeEvents({
  elements,
  deps: {
    returnToLibraryIndex: async (options) => calls.returns.push(options),
    selectNote: async (id, options) => calls.opened.push({ id, options })
  }
});

const libraryButton = { dataset: { homeAction: 'open-library' } };
libraryButton.closest = closestMap([['[data-home-action]', libraryButton]]);
elements.homeWorkspaceView.dispatch('click', libraryButton);

const noteButton = { dataset: { homeNoteOpen: 'note-42' } };
noteButton.closest = closestMap([['[data-home-note-open]', noteButton]]);
elements.homeWorkspaceView.dispatch('click', noteButton);

assert.deepEqual(calls.returns, [{ global: true }]);
assert.deepEqual(calls.opened, [{
  id: 'note-42',
  options: { syncFolder: true, ensureTab: true }
}]);
console.log('ok - home actions reuse the formal library navigation and note selection paths');
