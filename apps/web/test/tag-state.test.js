import assert from 'node:assert/strict';

import {
  buildUniqueTagId,
  removeTagFromCollections,
  upsertTag
} from '../lib/tags/state.js';

const tags = [
  { id: 'tag-clip', name: 'CLIP' },
  { id: 'tag-memory', name: 'Memory' }
];

assert.deepEqual(
  upsertTag(tags, { id: 'tag-new', name: 'New' }),
  [...tags, { id: 'tag-new', name: 'New' }],
  'upsertTag should append a new tag'
);

assert.deepEqual(
  upsertTag(tags, { id: 'tag-memory', name: 'Long-term Memory' }),
  [
    { id: 'tag-clip', name: 'CLIP' },
    { id: 'tag-memory', name: 'Long-term Memory' }
  ],
  'upsertTag should replace an existing tag by id'
);

assert.deepEqual(
  removeTagFromCollections(
    {
      tags,
      allNotes: [
        { id: 'note-1', tagIds: ['tag-clip', 'tag-memory'] },
        { id: 'note-2', tagIds: ['tag-memory'] }
      ],
      selectedTagIds: ['tag-clip', 'tag-memory']
    },
    'tag-memory'
  ),
  {
    tags: [{ id: 'tag-clip', name: 'CLIP' }],
    allNotes: [
      { id: 'note-1', tagIds: ['tag-clip'] },
      { id: 'note-2', tagIds: [] }
    ],
    selectedTagIds: ['tag-clip']
  },
  'removeTagFromCollections should remove the tag from tags, notes, and search filters'
);

assert.equal(
  buildUniqueTagId(' CLIP basics! ', tags),
  'tag-clip-basics',
  'buildUniqueTagId should slugify tag names'
);

assert.equal(
  buildUniqueTagId('CLIP', tags),
  'tag-clip-2',
  'buildUniqueTagId should avoid existing ids'
);

console.log('ok - tag state helpers update pure collections');
