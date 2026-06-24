import assert from 'node:assert/strict';
import {
  buildCurrentNoteKnowledgePointSources,
  insertKnowledgePointCollections,
  removeKnowledgePointCollections,
  replaceKnowledgePointCollections,
  syncKnowledgePointMembershipCollections
} from '../lib/knowledge-points/state.js';

function runTest(name, callback) {
  try {
    callback();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

runTest('insertKnowledgePointCollections prepends and de-duplicates current and full lists', () => {
  const point = { id: 'point-1', title: 'Updated' };
  const result = insertKnowledgePointCollections({
    knowledgePoints: [{ id: 'point-1', title: 'Old' }, { id: 'point-2' }],
    allKnowledgePoints: [{ id: 'point-3' }, { id: 'point-1', title: 'Old' }]
  }, point);

  assert.deepEqual(result.knowledgePoints, [point, { id: 'point-2' }]);
  assert.deepEqual(result.allKnowledgePoints, [point, { id: 'point-3' }]);
});

runTest('replaceKnowledgePointCollections replaces matching points in both lists', () => {
  const point = { id: 'point-2', title: 'Updated' };
  const result = replaceKnowledgePointCollections({
    knowledgePoints: [{ id: 'point-1' }, { id: 'point-2', title: 'Old' }],
    allKnowledgePoints: [{ id: 'point-2', title: 'Old' }, { id: 'point-3' }]
  }, point);

  assert.deepEqual(result.knowledgePoints, [{ id: 'point-1' }, point]);
  assert.deepEqual(result.allKnowledgePoints, [point, { id: 'point-3' }]);
});

runTest('removeKnowledgePointCollections removes a point from both lists', () => {
  const result = removeKnowledgePointCollections({
    knowledgePoints: [{ id: 'point-1' }, { id: 'point-2' }],
    allKnowledgePoints: [{ id: 'point-2' }, { id: 'point-3' }]
  }, 'point-2');

  assert.deepEqual(result.knowledgePoints, [{ id: 'point-1' }]);
  assert.deepEqual(result.allKnowledgePoints, [{ id: 'point-3' }]);
});

runTest('syncKnowledgePointMembershipCollections includes point only when it belongs to current note', () => {
  const collections = {
    knowledgePoints: [{ id: 'point-old' }, { id: 'point-1', title: 'Old' }],
    allKnowledgePoints: [{ id: 'point-1', title: 'Old' }]
  };

  const included = syncKnowledgePointMembershipCollections(collections, {
    id: 'point-1',
    noteIds: ['note-1']
  }, 'note-1');
  const excluded = syncKnowledgePointMembershipCollections(included, {
    id: 'point-1',
    noteIds: ['note-2']
  }, 'note-1');

  assert.deepEqual(included.knowledgePoints, [{ id: 'point-1', noteIds: ['note-1'] }, { id: 'point-old' }]);
  assert.deepEqual(included.allKnowledgePoints, [{ id: 'point-1', noteIds: ['note-1'] }]);
  assert.deepEqual(excluded.knowledgePoints, [{ id: 'point-old' }]);
  assert.deepEqual(excluded.allKnowledgePoints, [{ id: 'point-1', noteIds: ['note-2'] }]);
});

runTest('buildCurrentNoteKnowledgePointSources returns sources for the current note with point ids', () => {
  const sources = buildCurrentNoteKnowledgePointSources([
    {
      id: 'point-1',
      sources: [
        { id: 'source-1', noteId: 'note-1', sourceText: 'A' },
        { id: 'source-2', noteId: 'note-2', sourceText: 'B' }
      ]
    },
    {
      id: 'point-2',
      sources: [{ id: 'source-3', noteId: 'note-1', sourceText: 'C' }]
    }
  ], 'note-1');

  assert.deepEqual(sources, [
    { id: 'source-1', noteId: 'note-1', sourceText: 'A', knowledgePointId: 'point-1' },
    { id: 'source-3', noteId: 'note-1', sourceText: 'C', knowledgePointId: 'point-2' }
  ]);
});
