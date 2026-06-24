import assert from 'node:assert/strict';

import {
  renderSearchPanel,
  renderSelectedSearchChips
} from '../lib/search/renderers.js';

const tags = [
  { id: 'tag-clip', name: 'CLIP', color: '#123456', usageCount: 2 },
  { id: 'tag-memory', name: 'Memory', color: '#654321', usageCount: 5 },
  { id: 'tag-other', name: 'Other', usageCount: 0 }
];

const chipHtml = renderSelectedSearchChips(tags);
assert.match(chipHtml, /data-search-chip-remove="tag-clip"/);
assert.match(chipHtml, /CLIP/);
assert.match(chipHtml, /\+1/);
assert.doesNotMatch(chipHtml, /tag-other/);

const panelHtml = renderSearchPanel({
  selectedTags: [tags[0]],
  visibleTags: tags,
  selectedTagIds: ['tag-clip'],
  hasFilters: true
});

assert.match(panelHtml, /标签筛选/);
assert.match(panelHtml, /data-search-clear/);
assert.match(panelHtml, /data-search-tag-id="tag-memory"/);
assert.match(panelHtml, /class="search-tag-count">5</);
assert.match(panelHtml, /data-selected="true"/);

assert.equal(
  renderSearchPanel({ selectedTags: [], visibleTags: [], selectedTagIds: [], hasFilters: false, isOpen: false }),
  '',
  'closed search panel without filters should render nothing'
);

console.log('ok - search renderers produce shell chips and dropdown panel');
