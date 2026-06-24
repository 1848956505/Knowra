import assert from 'node:assert/strict';
import { createClearedNoteSideData } from '../lib/sidebar/state.js';

function runTest(name, callback) {
  try {
    callback();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

runTest('createClearedNoteSideData clears note side collections and editing state', () => {
  assert.deepEqual(createClearedNoteSideData(), {
    linkedNotes: [],
    attachments: [],
    knowledgePoints: [],
    allKnowledgePoints: [],
    knowledgePointTagGroups: [],
    knowledgePointEditing: null
  });
});

runTest('createClearedNoteSideData can preserve current editing state', () => {
  const editing = { id: 'point-1', title: 'Existing' };

  assert.deepEqual(createClearedNoteSideData({ editing, keepEditing: true }), {
    linkedNotes: [],
    attachments: [],
    knowledgePoints: [],
    allKnowledgePoints: [],
    knowledgePointTagGroups: [],
    knowledgePointEditing: editing
  });
});
