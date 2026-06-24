import assert from 'node:assert/strict';
import { renderOutlineTab } from '../lib/sidebar/outline-panel.js';

const html = renderOutlineTab({
  headings: [
    { id: 'intro', index: 0, level: 1, title: '<Intro>' },
    { id: 'deep', index: 1, level: 3, title: 'Deep Dive' }
  ]
});

assert.match(html, /正文大纲/);
assert.match(html, /<strong>2<\/strong>/);
assert.match(html, /data-outline-id="intro"/);
assert.match(html, /data-outline-index="1"/);
assert.match(html, /data-level="3"/);
assert.match(html, /&lt;Intro&gt;/);

assert.match(
  renderOutlineTab({ headings: [] }),
  /当前笔记还没有标题/,
  'outline panel should show an empty state when no headings exist'
);

console.log('ok - sidebar outline panel renders heading links');
