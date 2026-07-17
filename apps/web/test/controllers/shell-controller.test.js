import assert from 'node:assert/strict';
import { createShellController } from '../../src/controllers/shell-controller.js';

function createElements() {
  return {
    moduleRail: { innerHTML: '' },
    workspace: { dataset: {} },
    sidebar: { hidden: false },
    aside: { hidden: false },
    statusIndicators: { innerHTML: '' },
    statusMeta: { innerHTML: '' }
  };
}

function createState(overrides = {}) {
  return {
    statusMessage: 'Ready',
    foldersById: {
      'folder-1': { id: 'folder-1' },
      'folder-2': { id: 'folder-2' }
    },
    dataMode: 'api',
    currentSpaceId: 'space-1',
    view: {
      mode: 'focus',
      showLeftSidebar: true,
      showRightSidebar: true,
      showSourceEditor: false
    },
    ...overrides
  };
}

function createDeps({ state = createState(), elements = createElements(), overrides = {} } = {}) {
  const calls = [];
  const errors = [];
  const controller = createShellController({
    state,
    elements,
    railItems: [{ key: 'knowledge', active: true }],
    getCurrentNote: () => ({ id: 'note-1' }),
    getVisibleNotes: () => [{ id: 'note-1' }, { id: 'note-2' }],
    renderEditor: (note) => calls.push(['editor', note.id]),
    renderEditorContextMenu: () => calls.push(['editor-context-menu']),
    renderEditorMenuBar: () => calls.push(['editor-menu']),
    renderFolders: () => calls.push(['navigation']),
    renderSearchShell: () => calls.push(['search']),
    renderSidebar: (note) => calls.push(['sidebar', note.id]),
    renderTabs: () => calls.push(['tabs']),
    reportRuntimeError: (name, error) => errors.push([name, error.message]),
    ...overrides
  });

  return { controller, state, elements, calls, errors };
}

function runTest(name, callback) {
  try {
    callback();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

runTest('renderAll renders shell sections and isolates failed steps', () => {
  const { controller, calls, errors, elements } = createDeps({
    overrides: {
      renderFolders: () => {
        throw new Error('navigation failed');
      }
    }
  });

  controller.renderAll();

  assert.deepEqual(calls, [
    ['search'],
    ['tabs'],
    ['editor-menu'],
    ['editor', 'note-1'],
    ['sidebar', 'note-1'],
    ['editor-context-menu']
  ]);
  assert.deepEqual(errors, [['navigation', 'navigation failed']]);
  assert.match(elements.statusIndicators.innerHTML, /Ready/);
});

runTest('renderWorkspaceViewState applies effective focus layout', () => {
  const { controller, elements } = createDeps();

  controller.renderWorkspaceViewState();

  assert.equal(elements.workspace.dataset.leftHidden, 'true');
  assert.equal(elements.workspace.dataset.rightHidden, 'true');
  assert.equal(elements.workspace.dataset.viewMode, 'focus');
  assert.equal(elements.sidebar.hidden, true);
  assert.equal(elements.aside.hidden, true);
});

runTest('renderRail and renderStatus write shell markup', () => {
  const { controller, elements } = createDeps();

  controller.renderRail();
  controller.renderStatus();

  assert.match(elements.moduleRail.innerHTML, /class="rail-item"/);
  assert.match(elements.moduleRail.innerHTML, /data-active="true"/);
  assert.match(elements.statusIndicators.innerHTML, /Ready/);
  assert.match(elements.statusIndicators.innerHTML, /2/);
  assert.match(elements.statusMeta.innerHTML, /云端已连接/);
  assert.match(elements.statusMeta.innerHTML, /data-status-action="toggle-right-sidebar"/);
});

console.log('shell-controller tests passed');
