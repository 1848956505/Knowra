import assert from 'node:assert/strict';
import { renderHomeLoading, renderHomeWorkspace } from '../lib/home/renderers.js';

const state = {
  dataMode: 'api',
  foldersById: { 'folder-1': {}, 'folder-2': {} },
  allNotes: [
    { id: 'note-old', title: '旧资料', sourceType: 'manual', status: 'draft', updatedAt: '2026-08-05T08:00:00Z', deleted: false },
    { id: 'note-new', title: '最新资料', sourceType: 'markdown-import', status: 'published', updatedAt: '2026-08-06T08:00:00Z', deleted: false },
    { id: 'note-deleted', title: '已删除资料', sourceType: 'manual', status: 'active', updatedAt: '2026-08-06T09:00:00Z', deleted: true }
  ]
};

const html = renderHomeWorkspace(state);
assert.match(html, /data-home-workspace/);
assert.match(html, /data-home-stat="notes">2</);
assert.match(html, /data-home-stat="folders">2</);
assert.match(html, /data-home-domain-card="materials"[^>]*data-home-domain-state="ready"/);
assert.match(html, /data-home-domain-card="knowledge"[^>]*data-home-domain-state="available"/);
assert.match(html, /data-home-domain-card="training"[^>]*data-home-domain-state="available"/);
assert.match(html, /data-home-domain-card="learning"[^>]*data-home-domain-state="blocked"/);
assert.match(html, /data-home-action="open-library"/);
assert.match(html, /data-home-note-open="note-new"[^]*最新资料/);
assert.ok(html.indexOf('note-new') < html.indexOf('note-old'), 'recent edits should be ordered by updatedAt descending');
assert.doesNotMatch(html, /今日待办|完成 2 项待办|掌握度 0|云端已连接/);

assert.match(renderHomeLoading(), /正在加载资料工作台/);
console.log('ok - home renderer uses real workspace data and explicit domain states');
