import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── 源模式断言（compile-time contract）──────────────────────────

const binderSource = fs.readFileSync(
  path.resolve(__dirname, '../../lib/events/editor-content-events.js'),
  'utf8'
);

assert.match(
  binderSource,
  /export function bindEditorContentEvents/,
  'editor-content-events.js should export bindEditorContentEvents'
);
[
  'contextmenu',
  'knowledge-point-marker-click',
  'input',
  'click'
].forEach((type) => {
  assert.equal(
    (binderSource.match(new RegExp(`elements\\.editorContent\\?\\.addEventListener\\('${type}'`, 'g')) ?? []).length,
    1,
    `editor-content binder should register exactly 1 ${type} listener on editorContent`
  );
});
assert.equal(
  (binderSource.match(/elements\.editorContextMenu\?\.addEventListener\('click'/g) ?? []).length,
  1,
  'editor-content binder should register exactly 1 click listener on editorContextMenu'
);

// ─── Handler-recorder 断言（behavioral）──────────────────────────

// 在 Node 测试环境里把 Element 模拟成基类，便于 binder 内的
// `event.target instanceof Element` 判定。
class FakeElement {}
globalThis.Element = FakeElement;

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

function makeElements() {
  const editorContentTypes = ['contextmenu', 'knowledge-point-marker-click', 'input', 'click'];
  const listeners = { editorContent: {}, editorContextMenu: {} };
  for (const t of editorContentTypes) listeners.editorContent[t] = [];
  listeners.editorContextMenu.click = [];
  return {
    elements: {
      editorContent: {
        addEventListener(type, fn) { listeners.editorContent[type].push(fn); }
      },
      editorContextMenu: {
        addEventListener(type, fn) { listeners.editorContextMenu[type].push(fn); }
      }
    },
    listeners
  };
}

function makeClosest(map) {
  return (selector) => {
    for (const [key, value] of map.entries()) {
      if (selector === key) return value;
    }
    return null;
  };
}

function makeState() {
  return {
    view: { showSourceEditor: false },
    draftMarkdown: ''
  };
}

function makeDeps(overrides = {}) {
  return {
    getCurrentEditorHost: () => null,
    getCurrentNote: () => null,
    openEditorContextMenu: () => {},
    focusKnowledgePointFromMarker: () => {},
    handleEditorContextMenuAction: async () => {},
    scheduleAutosave: () => {},
    syncSourcePreview: () => {},
    persistDraft: async () => {},
    ...overrides
  };
}

runTest('editorContent contextmenu: gates on host/note/sourceEditor', async () => {
  const { bindEditorContentEvents } = await import(
    '../../lib/events/editor-content-events.js'
  );
  const host = new FakeElement();
  host.closest = () => host;

  // 缺少 host：跳过
  {
    const { elements, listeners } = makeElements();
    let openArgs = null;
    bindEditorContentEvents({
      state: makeState(),
      elements,
      deps: makeDeps({
        getCurrentEditorHost: () => null,
        getCurrentNote: () => ({ id: 'n-1' }),
        openEditorContextMenu: (a) => { openArgs = a; }
      })
    });
    listeners.editorContent.contextmenu[0]({
      target: host, clientX: 10, clientY: 20, preventDefault() {}
    });
    assert.equal(openArgs, null);
  }

  // 处于源码模式：跳过
  {
    const { elements, listeners } = makeElements();
    let openArgs = null;
    const state = makeState();
    state.view.showSourceEditor = true;
    bindEditorContentEvents({
      state,
      elements,
      deps: makeDeps({
        getCurrentEditorHost: () => ({ run: () => {} }),
        getCurrentNote: () => ({ id: 'n-1' }),
        openEditorContextMenu: (a) => { openArgs = a; }
      })
    });
    listeners.editorContent.contextmenu[0]({
      target: host, clientX: 10, clientY: 20, preventDefault() {}
    });
    assert.equal(openArgs, null);
  }

  // 命中 milkdown-host：打开菜单
  {
    const { elements, listeners } = makeElements();
    let openArgs = null;
    let prevented = false;
    bindEditorContentEvents({
      state: makeState(),
      elements,
      deps: makeDeps({
        getCurrentEditorHost: () => ({ run: () => {} }),
        getCurrentNote: () => ({ id: 'n-1' }),
        openEditorContextMenu: (a) => { openArgs = a; }
      })
    });
    listeners.editorContent.contextmenu[0]({
      target: host,
      clientX: 30,
      clientY: 40,
      preventDefault() { prevented = true; }
    });
    assert.deepEqual(openArgs, { x: 30, y: 40 });
    assert.equal(prevented, true);
  }

  // target 不在 milkdown-host / preview-rendered：跳过
  {
    const { elements, listeners } = makeElements();
    let openArgs = null;
    const outside = new FakeElement();
    outside.closest = () => null;
    bindEditorContentEvents({
      state: makeState(),
      elements,
      deps: makeDeps({
        getCurrentEditorHost: () => ({ run: () => {} }),
        getCurrentNote: () => ({ id: 'n-1' }),
        openEditorContextMenu: (a) => { openArgs = a; }
      })
    });
    listeners.editorContent.contextmenu[0]({
      target: outside, clientX: 0, clientY: 0, preventDefault() {}
    });
    assert.equal(openArgs, null);
  }
});

runTest('editorContent contextmenu: text-node-like target still opens context menu', async () => {
  const { bindEditorContentEvents } = await import(
    '../../lib/events/editor-content-events.js'
  );
  const { elements, listeners } = makeElements();
  let openArgs = null;
  let prevented = false;
  const host = new FakeElement();
  host.closest = () => host;

  bindEditorContentEvents({
    state: makeState(),
    elements,
    deps: makeDeps({
      getCurrentEditorHost: () => ({ run: () => {} }),
      getCurrentNote: () => ({ id: 'n-1' }),
      openEditorContextMenu: (args) => { openArgs = args; }
    })
  });

  listeners.editorContent.contextmenu[0]({
    target: { parentElement: host },
    clientX: 12,
    clientY: 18,
    preventDefault() { prevented = true; }
  });

  assert.deepEqual(openArgs, { x: 12, y: 18 });
  assert.equal(prevented, true);
});

runTest('editorContent knowledge-point-marker-click: dispatches focus with detail', async () => {
  const { elements, listeners } = makeElements();
  const { bindEditorContentEvents } = await import(
    '../../lib/events/editor-content-events.js'
  );
  let arg = null;
  const deps = makeDeps({
    focusKnowledgePointFromMarker: (a) => { arg = a; }
  });

  bindEditorContentEvents({ state: makeState(), elements, deps });

  // 空 detail：跳过
  listeners.editorContent['knowledge-point-marker-click'][0]({ detail: {} });
  assert.equal(arg, null);

  // 带 sourceId / knowledgePointId
  listeners.editorContent['knowledge-point-marker-click'][0]({
    detail: { sourceId: 'src-1', knowledgePointId: 'kp-1' }
  });
  assert.deepEqual(arg, { sourceId: 'src-1', knowledgePointId: 'kp-1' });
});

runTest('editorContextMenu click: data-editor-context-action dispatches handler', async () => {
  const { elements, listeners } = makeElements();
  const { bindEditorContentEvents } = await import(
    '../../lib/events/editor-content-events.js'
  );
  let arg = null;
  let stopped = false;
  const deps = makeDeps({
    handleEditorContextMenuAction: async (a) => { arg = a; }
  });

  bindEditorContentEvents({ state: makeState(), elements, deps });

  const target = { dataset: { editorContextAction: 'insert-table' } };
  target.closest = makeClosest(new Map([['[data-editor-context-action]', target]]));
  listeners.editorContextMenu.click[0]({
    target,
    stopPropagation() { stopped = true; }
  });

  assert.equal(arg, 'insert-table');
  assert.equal(stopped, true);
});

runTest('editorContent input: source editor input updates draft, autosave, preview', async () => {
  const { elements, listeners } = makeElements();
  const { bindEditorContentEvents } = await import(
    '../../lib/events/editor-content-events.js'
  );
  let autosaved = 0;
  let synced = 0;
  const state = makeState();
  const deps = makeDeps({
    scheduleAutosave: () => { autosaved += 1; },
    syncSourcePreview: () => { synced += 1; }
  });

  bindEditorContentEvents({ state, elements, deps });

  // 非源码 input：跳过
  const unrelated = { value: 'x' };
  unrelated.closest = makeClosest(new Map());
  listeners.editorContent.input[0]({ target: unrelated });
  assert.equal(state.draftMarkdown, '');
  assert.equal(autosaved, 0);
  assert.equal(synced, 0);

  // 源码 input：更新草稿 + autosave + 同步预览
  const sourceInput = { value: '# 新草稿' };
  sourceInput.closest = makeClosest(new Map([['[data-source-editor-input]', sourceInput]]));
  listeners.editorContent.input[0]({ target: sourceInput });
  assert.equal(state.draftMarkdown, '# 新草稿');
  assert.equal(autosaved, 1);
  assert.equal(synced, 1);
});

runTest('editorContent click: data-source-save dispatches persistDraft(immediate)', async () => {
  const { elements, listeners } = makeElements();
  const { bindEditorContentEvents } = await import(
    '../../lib/events/editor-content-events.js'
  );
  let arg = null;
  const deps = makeDeps({
    persistDraft: async (a) => { arg = a; }
  });

  bindEditorContentEvents({ state: makeState(), elements, deps });

  // 非 save 按钮：跳过
  const unrelated = {};
  unrelated.closest = makeClosest(new Map());
  listeners.editorContent.click[0]({ target: unrelated });
  assert.equal(arg, null);

  // 命中 source-save
  const saveBtn = {};
  saveBtn.closest = makeClosest(new Map([['[data-source-save]', saveBtn]]));
  listeners.editorContent.click[0]({ target: saveBtn });
  assert.deepEqual(arg, { immediate: true });
});

// 串行执行所有测试用例。
(async () => {
  for (const run of tests) {
    await run();
  }
})();
