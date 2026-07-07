import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRecorderElement } from '../_support/recorder-elements.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── 源模式断言（compile-time contract）──────────────────────────

const indexSource = fs.readFileSync(
  path.resolve(__dirname, '../../lib/events/aside-events/index.js'),
  'utf8'
);
const clickSource = fs.readFileSync(
  path.resolve(__dirname, '../../lib/events/aside-events/click.js'),
  'utf8'
);
const contextMenuSource = fs.readFileSync(
  path.resolve(__dirname, '../../lib/events/aside-events/context-menu.js'),
  'utf8'
);
const inputSource = fs.readFileSync(
  path.resolve(__dirname, '../../lib/events/aside-events/input.js'),
  'utf8'
);
const formsSource = fs.readFileSync(
  path.resolve(__dirname, '../../lib/events/aside-events/forms.js'),
  'utf8'
);
const tabsSource = fs.readFileSync(
  path.resolve(__dirname, '../../lib/events/aside-events/tabs.js'),
  'utf8'
);

assert.match(indexSource, /export function bindAsideEvents/, 'index.js should export bindAsideEvents');
assert.match(tabsSource, /export function bindAsideTabsEvents/, 'tabs.js should export bindAsideTabsEvents');
assert.match(clickSource, /export function bindAsideContentClickEvents/, 'click.js should export bindAsideContentClickEvents');
assert.match(contextMenuSource, /export function bindAsideContentContextMenuEvents/, 'context-menu.js should export bindAsideContentContextMenuEvents');
assert.match(inputSource, /export function bindAsideContentInputEvents/, 'input.js should export bindAsideContentInputEvents');
assert.match(formsSource, /export function bindAsideContentFormEvents/, 'forms.js should export bindAsideContentFormEvents');

assert.match(tabsSource, /elements\.asideTabs\?\.addEventListener\('click'/, 'tabs.js should register click on asideTabs');
assert.equal(
  (clickSource.match(/elements\.asideContent\?\.addEventListener\('click'/g) ?? []).length,
  1,
  'click.js should register exactly 1 click on asideContent'
);
assert.equal(
  (contextMenuSource.match(/elements\.asideContent\?\.addEventListener\('contextmenu'/g) ?? []).length,
  1,
  'context-menu.js should register exactly 1 contextmenu on asideContent'
);
assert.equal(
  (inputSource.match(/elements\.asideContent\?\.addEventListener\('input'/g) ?? []).length,
  1,
  'input.js should register exactly 1 input on asideContent'
);
assert.equal(
  (formsSource.match(/elements\.asideContent\?\.addEventListener\('submit'/g) ?? []).length,
  1,
  'forms.js should register exactly 1 submit on asideContent'
);
assert.equal(
  (formsSource.match(/elements\.asideContent\?\.addEventListener\('keydown'/g) ?? []).length,
  1,
  'forms.js should register exactly 1 keydown on asideContent'
);

// ─── Handler-recorder 断言（behavioral）──────────────────────────

const tests = [];

function runTest(name, callback) {
  const run = async () => {
    try {
      await callback();
      console.log(`ok - ${name}`);
    } catch (error) {
      console.error(`not ok - ${name}`);
      throw error;
    }
  };
  tests.push(run);
}

function makeClosest(map) {
  return (selector) => {
    for (const [key, value] of map.entries()) {
      if (selector === key) return value;
    }
    return null;
  };
}

function makeElements() {
  return {
    asideTabs: createRecorderElement(),
    asideContent: createRecorderElement()
  };
}

function makeState(overrides = {}) {
  return {
    asideTab: 'info',
    noteTagComposer: { isExpanded: false, draft: '' },
    knowledgePointFilters: { query: '', tagIds: [], isOpen: false },
    knowledgePoints: [],
    knowledgePointEditing: null,
    knowledgePointAttachComposer: { query: '', isOpen: false },
    outlineCollapsedHeadingIdsByNote: {},
    expandedKnowledgePointIds: {},
    ...overrides
  };
}

function makeDeps(overrides = {}) {
  return {
    getCurrentNote: () => ({ id: 'n-1' }),
    selectNote: async () => {},
    flashStatus: () => {},
    openContextMenu: () => {},
    openAttachment: async () => {},
    jumpToAttachmentReference: async () => {},
    addTagToCurrentNote: async () => {},
    removeTagFromCurrentNote: async () => {},
    createTagAndAssignToCurrentNote: async () => {},
    updateCurrentKnowledgePoint: async () => {},
    attachSelectionToExistingKnowledgePoint: async () => {},
    removeKnowledgePointSourceFromCurrentNote: async () => {},
    deleteKnowledgePointFromLibrary: async () => {},
    selectKnowledgePointSource: async () => {},
    findOutlineHeadingTarget: () => null,
    renderSidebar: () => {},
    ...overrides
  };
}

runTest('asideTabs click: switches tab and re-renders sidebar', async () => {
  const { bindAsideEvents } = await import('../../lib/events/aside-events/index.js');
  const elements = makeElements();
  const state = makeState({ asideTab: 'info' });
  let rendered = 0;
  const deps = makeDeps({ renderSidebar: () => { rendered += 1; } });

  bindAsideEvents({ state, elements, deps });

  // 命中同一 tab：跳过
  const sameTab = { dataset: { asideTab: 'info' } };
  sameTab.closest = makeClosest(new Map([['[data-aside-tab]', sameTab]]));
  elements.asideTabs.dispatch('click', sameTab);
  assert.equal(state.asideTab, 'info');
  assert.equal(rendered, 0);

  // 切换到 concepts
  const newTab = { dataset: { asideTab: 'concepts' } };
  newTab.closest = makeClosest(new Map([['[data-aside-tab]', newTab]]));
  elements.asideTabs.dispatch('click', newTab);
  assert.equal(state.asideTab, 'concepts');
  assert.equal(rendered, 1);
});

runTest('asideContent click: data-linked-id dispatches selectNote', async () => {
  const { bindAsideEvents } = await import('../../lib/events/aside-events/index.js');
  const elements = makeElements();
  let arg = null;
  let opts = null;
  const deps = makeDeps({ selectNote: async (id, o) => { arg = id; opts = o; } });

  bindAsideEvents({ state: makeState(), elements, deps });

  const target = { dataset: { linkedId: 'n-9' } };
  target.closest = makeClosest(new Map([['[data-linked-id]', target]]));
  elements.asideContent.dispatch('click', target);
  assert.equal(arg, 'n-9');
  assert.deepEqual(opts, { syncFolder: true });
});

runTest('asideContent click: text-node-like target still resolves linked note button', async () => {
  const { bindAsideEvents } = await import('../../lib/events/aside-events/index.js');
  const elements = makeElements();
  let arg = null;
  const deps = makeDeps({ selectNote: async (id) => { arg = id; } });

  bindAsideEvents({ state: makeState(), elements, deps });

  const button = { dataset: { linkedId: 'n-text' } };
  button.closest = makeClosest(new Map([['[data-linked-id]', button]]));
  elements.asideContent.dispatch('click', { parentElement: button });

  assert.equal(arg, 'n-text');
});

runTest('asideContent click: referenced attachment jumps to its正文位置', async () => {
  const { bindAsideEvents } = await import('../../lib/events/aside-events/index.js');
  const elements = makeElements();
  let arg = null;
  const deps = makeDeps({ jumpToAttachmentReference: async (id) => { arg = id; } });

  bindAsideEvents({ state: makeState(), elements, deps });

  const target = {
    dataset: {
      attachmentId: 'attachment-1',
      attachmentReferenced: 'true',
      attachmentName: 'diagram.png'
    }
  };
  target.closest = makeClosest(new Map([['[data-attachment-id]', target]]));
  elements.asideContent.dispatch('click', target);

  assert.equal(arg, 'attachment-1');
});

runTest('asideContent contextmenu: attachment opens the shared context menu', async () => {
  const { bindAsideEvents } = await import('../../lib/events/aside-events/index.js');
  const elements = makeElements();
  let payload = null;
  const deps = makeDeps({ openContextMenu: (value) => { payload = value; } });

  bindAsideEvents({ state: makeState(), elements, deps });

  const attachmentTarget = { dataset: { attachmentId: 'attachment-2' } };
  attachmentTarget.closest = makeClosest(new Map([['[data-attachment-id]', attachmentTarget]]));

  let prevented = false;
  elements.asideContent.dispatch('contextmenu', attachmentTarget, {
    clientX: 14,
    clientY: 28,
    preventDefault() {
      prevented = true;
    }
  });

  assert.equal(prevented, true);
  assert.deepEqual(payload, {
    x: 14,
    y: 28,
    targetKind: 'attachment',
    targetId: 'attachment-2'
  });
});

runTest('asideContent click: data-note-tag-add expands composer and dispatches addTag', async () => {
  const { bindAsideEvents } = await import('../../lib/events/aside-events/index.js');
  const elements = makeElements();
  const state = makeState();
  let arg = null;
  const deps = makeDeps({ addTagToCurrentNote: async (id) => { arg = id; } });

  bindAsideEvents({ state, elements, deps });

  const target = { dataset: { noteTagAdd: 't-1' } };
  target.closest = makeClosest(new Map([['[data-note-tag-add]', target]]));
  elements.asideContent.dispatch('click', target);
  assert.equal(state.noteTagComposer.isExpanded, true);
  assert.equal(arg, 't-1');
});

runTest('asideContent click: data-note-tag-toggle flips composer expanded', async () => {
  const { bindAsideEvents } = await import('../../lib/events/aside-events/index.js');
  const elements = makeElements();
  const state = makeState({ noteTagComposer: { isExpanded: false, draft: '' } });
  let rendered = 0;
  const deps = makeDeps({ renderSidebar: () => { rendered += 1; } });

  bindAsideEvents({ state, elements, deps });

  const target = {};
  target.closest = makeClosest(new Map([['[data-note-tag-toggle]', target]]));
  elements.asideContent.dispatch('click', target);
  assert.equal(state.noteTagComposer.isExpanded, true);
  assert.equal(rendered, 1);
});

runTest('asideContent click: data-knowledge-point-filter-tag toggles tagId in state', async () => {
  const { bindAsideEvents } = await import('../../lib/events/aside-events/index.js');
  const elements = makeElements();
  const state = makeState();
  let rendered = 0;
  const deps = makeDeps({ renderSidebar: () => { rendered += 1; } });

  bindAsideEvents({ state, elements, deps });

  const target = { dataset: { knowledgePointFilterTag: 't-a' } };
  target.closest = makeClosest(new Map([['[data-knowledge-point-filter-tag]', target]]));
  elements.asideContent.dispatch('click', target);
  assert.deepEqual(state.knowledgePointFilters.tagIds, ['t-a']);
  assert.equal(state.knowledgePointFilters.isOpen, true);
  assert.equal(rendered, 1);

  // 再次点击 → 移除
  elements.asideContent.dispatch('click', target);
  assert.deepEqual(state.knowledgePointFilters.tagIds, []);
});

runTest('asideContent click: data-knowledge-point-toggle flips expanded id', async () => {
  const { bindAsideEvents } = await import('../../lib/events/aside-events/index.js');
  const elements = makeElements();
  const state = makeState({ expandedKnowledgePointIds: {} });
  const deps = makeDeps();

  bindAsideEvents({ state, elements, deps });

  const target = { dataset: { knowledgePointToggle: 'p-1' } };
  target.closest = makeClosest(new Map([['[data-knowledge-point-toggle]', target]]));
  elements.asideContent.dispatch('click', target);
  assert.equal(state.expandedKnowledgePointIds['p-1'], true);

  // 再次点击 → 折叠
  elements.asideContent.dispatch('click', target);
  assert.equal(state.expandedKnowledgePointIds['p-1'], false);
});

runTest('asideContent click: data-knowledge-point-edit sets editing state', async () => {
  const { bindAsideEvents } = await import('../../lib/events/aside-events/index.js');
  const elements = makeElements();
  const state = makeState({
    knowledgePoints: [{ id: 'p-1', title: 'T1', comment: 'C1' }]
  });
  const deps = makeDeps();

  bindAsideEvents({ state, elements, deps });

  const target = { dataset: { knowledgePointEdit: 'p-1' } };
  target.closest = makeClosest(new Map([['[data-knowledge-point-edit]', target]]));
  elements.asideContent.dispatch('click', target);

  assert.deepEqual(state.knowledgePointEditing, { id: 'p-1', title: 'T1', comment: 'C1' });
  assert.equal(state.expandedKnowledgePointIds['p-1'], true);
});

runTest('asideContent click: data-knowledge-point-source-remove dispatches remove', async () => {
  const { bindAsideEvents } = await import('../../lib/events/aside-events/index.js');
  const elements = makeElements();
  let arg = null;
  const deps = makeDeps({
    removeKnowledgePointSourceFromCurrentNote: async (id) => { arg = id; }
  });

  bindAsideEvents({ state: makeState(), elements, deps });

  const target = { dataset: { knowledgePointSourceRemove: 's-1' } };
  target.closest = makeClosest(new Map([['[data-knowledge-point-source-remove]', target]]));
  elements.asideContent.dispatch('click', target);
  assert.equal(arg, 's-1');
});

runTest('asideContent click: data-outline-id scrollIntoView when target found', async () => {
  const { bindAsideEvents } = await import('../../lib/events/aside-events/index.js');
  const elements = makeElements();
  let scrolled = false;
  const target = { dataset: { outlineId: 'o-1', outlineIndex: '0' } };
  target.closest = makeClosest(new Map([['[data-outline-id]', target]]));
  const deps = makeDeps({
    findOutlineHeadingTarget: () => ({ scrollIntoView() { scrolled = true; } })
  });

  bindAsideEvents({ state: makeState(), elements, deps });
  elements.asideContent.dispatch('click', target);
  assert.equal(scrolled, true);
});

runTest('asideContent click: data-outline-toggle-id flips collapsed state and re-renders', async () => {
  const { bindAsideEvents } = await import('../../lib/events/aside-events/index.js');
  const elements = makeElements();
  const state = makeState();
  let rendered = 0;
  const deps = makeDeps({ renderSidebar: () => { rendered += 1; } });
  const target = {
    dataset: {
      outlineToggleId: 'intro',
      outlineNoteId: 'note-1'
    }
  };
  target.closest = makeClosest(new Map([['[data-outline-toggle-id]', target]]));

  bindAsideEvents({ state, elements, deps });

  elements.asideContent.dispatch('click', target);
  assert.equal(state.outlineCollapsedHeadingIdsByNote['note-1'].intro, true);
  assert.equal(rendered, 1);

  elements.asideContent.dispatch('click', target);
  assert.equal(state.outlineCollapsedHeadingIdsByNote['note-1'].intro, false);
  assert.equal(rendered, 2);
});

runTest('asideContent click: data-outline-id flashes status when target missing', async () => {
  const { bindAsideEvents } = await import('../../lib/events/aside-events/index.js');
  const elements = makeElements();
  let msg = null;
  const deps = makeDeps({
    findOutlineHeadingTarget: () => null,
    flashStatus: (m) => { msg = m; }
  });
  const target = { dataset: { outlineId: 'o-missing' } };
  target.closest = makeClosest(new Map([['[data-outline-id]', target]]));

  bindAsideEvents({ state: makeState(), elements, deps });
  elements.asideContent.dispatch('click', target);
  assert.equal(msg, '当前标题尚未出现在预览区');
});

runTest('asideContent input: data-knowledge-point-filter-input updates filter and re-renders', async () => {
  const { bindAsideEvents } = await import('../../lib/events/aside-events/index.js');
  const elements = makeElements();
  const state = makeState();
  let rendered = 0;
  const deps = makeDeps({ renderSidebar: () => { rendered += 1; } });

  bindAsideEvents({ state, elements, deps });

  const target = { value: 'kp' };
  target.closest = makeClosest(new Map([['[data-knowledge-point-filter-input]', target]]));
  elements.asideContent.dispatch('input', target);
  assert.equal(state.knowledgePointFilters.query, 'kp');
  assert.equal(state.knowledgePointFilters.isOpen, true);
  assert.equal(rendered, 1);
});

runTest('asideContent input: data-note-tag-input updates draft (no re-render)', async () => {
  const { bindAsideEvents } = await import('../../lib/events/aside-events/index.js');
  const elements = makeElements();
  const state = makeState();
  let rendered = 0;
  const deps = makeDeps({ renderSidebar: () => { rendered += 1; } });

  bindAsideEvents({ state, elements, deps });

  const target = { value: 'react' };
  target.closest = makeClosest(new Map([['[data-note-tag-input]', target]]));
  elements.asideContent.dispatch('input', target);
  assert.equal(state.noteTagComposer.draft, 'react');
  assert.equal(rendered, 0);
});

runTest('asideContent submit: data-knowledge-point-edit-form dispatches updateCurrentKnowledgePoint', async () => {
  const { bindAsideEvents } = await import('../../lib/events/aside-events/index.js');
  const elements = makeElements();
  let argId = null;
  let argForm = null;
  let prevented = false;
  const deps = makeDeps({
    updateCurrentKnowledgePoint: async (id, form) => { argId = id; argForm = form; }
  });

  bindAsideEvents({ state: makeState(), elements, deps });

  const form = { dataset: { knowledgePointEditForm: 'p-2' } };
  form.closest = makeClosest(new Map([['[data-knowledge-point-edit-form]', form]]));
  const submitHandler = elements.asideContent.listeners.get('submit');
  submitHandler({
    target: form,
    preventDefault() { prevented = true; }
  });
  assert.equal(argId, 'p-2');
  assert.equal(argForm, form);
  assert.equal(prevented, true);
});

runTest('asideContent keydown: Enter on data-note-tag-input dispatches createTag', async () => {
  const { bindAsideEvents } = await import('../../lib/events/aside-events/index.js');
  const elements = makeElements();
  let arg = null;
  let prevented = false;
  const deps = makeDeps({
    createTagAndAssignToCurrentNote: async (v) => { arg = v; }
  });

  bindAsideEvents({ state: makeState(), elements, deps });

  const target = { value: 'react' };
  target.closest = makeClosest(new Map([['[data-note-tag-input]', target]]));
  const keydownHandler = elements.asideContent.listeners.get('keydown');
  keydownHandler({
    target,
    key: 'Enter',
    preventDefault() { prevented = true; }
  });
  assert.equal(arg, 'react');
  assert.equal(prevented, true);
});

runTest('asideContent keydown: non-Enter on data-note-tag-input is ignored', async () => {
  const { bindAsideEvents } = await import('../../lib/events/aside-events/index.js');
  const elements = makeElements();
  let arg = null;
  const deps = makeDeps({
    createTagAndAssignToCurrentNote: async (v) => { arg = v; }
  });

  bindAsideEvents({ state: makeState(), elements, deps });

  const target = { value: 'react' };
  target.closest = makeClosest(new Map([['[data-note-tag-input]', target]]));
  const keydownHandler = elements.asideContent.listeners.get('keydown');
  keydownHandler({ target, key: 'a' });
  assert.equal(arg, null);
});

runTest('asideContent keydown: Enter is ignored during IME composition', async () => {
  const { bindAsideEvents } = await import('../../lib/events/aside-events/index.js');
  const elements = makeElements();
  let arg = null;
  let prevented = false;
  const deps = makeDeps({
    createTagAndAssignToCurrentNote: async (v) => { arg = v; }
  });

  bindAsideEvents({ state: makeState(), elements, deps });

  const target = { value: 'zhong' };
  target.closest = makeClosest(new Map([['[data-note-tag-input]', target]]));
  const keydownHandler = elements.asideContent.listeners.get('keydown');
  keydownHandler({
    target,
    key: 'Enter',
    isComposing: true,
    preventDefault() { prevented = true; }
  });

  assert.equal(arg, null);
  assert.equal(prevented, false);
});

// 串行执行所有测试用例。
(async () => {
  for (const run of tests) {
    await run();
  }
})();
