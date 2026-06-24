import assert from 'node:assert/strict';

import {
  renderKnowledgePointAttachPanel,
  renderKnowledgePointCard,
  renderKnowledgePointFilterBar
} from '../lib/knowledge-points/panel-renderers.js';

const note = { id: 'note-current', title: 'Current note' };
const point = {
  id: 'kp-1',
  title: 'Escaped <Point>',
  comment: 'Comment',
  tagIds: ['tag-clip'],
  noteIds: ['note-current'],
  sources: [
    { id: 'source-1', noteId: 'note-current', sourceText: 'Selected source' }
  ]
};
const tagGroups = [
  {
    id: 'group-1',
    name: 'Tags',
    selectionMode: 'multiple',
    tags: [{ id: 'tag-clip', name: 'CLIP' }]
  }
];
const tagMap = new Map([['tag-clip', { id: 'tag-clip', name: 'CLIP', group: tagGroups[0] }]]);

const cardHtml = renderKnowledgePointCard({
  note,
  point,
  tagMap,
  tagGroups,
  isExpanded: true,
  editing: { id: 'kp-1', title: 'Edited title', comment: 'Edited comment' }
});

assert.match(cardHtml, /data-knowledge-point-id="kp-1"/);
assert.match(cardHtml, /Escaped &lt;Point&gt;/);
assert.match(cardHtml, /data-knowledge-point-source-remove="source-1"/);
assert.match(cardHtml, /data-knowledge-point-edit-form="kp-1"/);

const filterHtml = renderKnowledgePointFilterBar({
  tagGroups,
  filters: { query: '<clip>', tagIds: ['tag-clip'], isOpen: true }
});

assert.match(filterHtml, /data-knowledge-point-filter-input/);
assert.match(filterHtml, /value="&lt;clip&gt;"/);
assert.match(filterHtml, /data-active="true"/);

const attachHtml = renderKnowledgePointAttachPanel({
  note,
  availablePoints: [
    point,
    { ...point, id: 'kp-other', noteIds: ['note-other'], title: 'Other point' }
  ],
  attachComposer: { isOpen: true, query: 'other' }
});

assert.match(attachHtml, /data-knowledge-point-attach-existing="kp-other"/);
assert.doesNotMatch(attachHtml, /data-knowledge-point-attach-existing="kp-1"/);

console.log('ok - knowledge point panel renderers are independently testable');
