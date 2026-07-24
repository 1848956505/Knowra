import assert from 'node:assert/strict';
import { createEditorViewCommandController } from '../../src/controllers/editor/commands/view-command-controller.js';

const state = {
  view: {
    mode: 'edit',
    showLeftSidebar: true,
    showRightSidebar: true,
    showSourceEditor: true
  }
};
let renderCount = 0;
let closeCount = 0;

const controller = createEditorViewCommandController({
  state,
  getCurrentNote: () => ({ id: 'note-1' }),
  renderAll: () => { renderCount += 1; },
  flashStatus: () => {}
}, () => ({}), {
  closeEditorMenuBar: () => { closeCount += 1; }
});

await controller.handleViewMenuAction('toggle-focus');
assert.equal(state.view.mode, 'focus');
assert.equal(state.view.showSourceEditor, false);

await controller.handleViewMenuAction('toggle-focus');
assert.equal(state.view.mode, 'edit');
assert.equal(renderCount, 2);
assert.equal(closeCount, 2);

console.log('ok - editor view command controller toggles focus mode from the status bar');
