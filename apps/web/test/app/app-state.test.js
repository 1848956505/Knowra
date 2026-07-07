import assert from 'node:assert/strict';
import {
  AUTOSAVE_DELAY_MS,
  BACKEND_CACHE_KEY,
  SCROLL_POSITIONS_KEY,
  createInitialAppState,
  createRailItems
} from '../../src/app/app-state.js';

const state = createInitialAppState();

assert.equal(BACKEND_CACHE_KEY, 'study-accelerator.backend-workspace-cache');
assert.equal(AUTOSAVE_DELAY_MS, 700);
assert.equal(SCROLL_POSITIONS_KEY, 'study-accelerator.editor-scroll-positions');
assert.equal(state.dataMode, 'loading');
assert.equal(state.statusMessage, '正在加载知识库...');
assert.deepEqual(state.search, {
  keyword: '',
  selectedTagIds: [],
  isOpen: false
});
assert.deepEqual(state.view, {
  mode: 'edit',
  showLeftSidebar: true,
  showRightSidebar: true,
  showSourceEditor: false
});
assert.deepEqual(state.outlineCollapsedHeadingIdsByNote, {});
assert.deepEqual(createRailItems().map((item) => item.key), [
  'knowledge',
  'paper',
  'ai',
  'task',
  'review',
  'settings'
]);

assert.notEqual(createInitialAppState(), createInitialAppState());
assert.notEqual(createInitialAppState().search, createInitialAppState().search);

console.log('app-state tests passed');
