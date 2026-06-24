import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { renderKnowledgePointPanel } from '../lib/knowledge-points/panel.js';
import { buildKnowledgePointSourceInputFromSelection } from '../lib/knowledge-points/selection.js';

const note = { id: 'note-current', spaceId: 'space-v205', title: 'Current note' };
const currentPoint = {
  id: 'kp-current',
  title: '当前笔记知识点',
  comment: '',
  tagIds: [],
  noteIds: ['note-current'],
  sources: [
    { id: 'src-current', noteId: 'note-current', sourceText: '当前笔记片段' },
    { id: 'src-other', noteId: 'note-other', sourceText: '其他笔记片段' }
  ]
};
const availablePoint = {
  id: 'kp-available',
  title: '可加入的已有知识点',
  comment: '来自其他笔记',
  tagIds: [],
  noteIds: ['note-other'],
  sources: [{ id: 'src-available', noteId: 'note-other', sourceText: '已有知识点片段' }]
};

const html = renderKnowledgePointPanel({
  note,
  points: [currentPoint],
  availablePoints: [currentPoint, availablePoint],
  attachComposer: { isOpen: true, query: '已有' },
  expandedIds: { 'kp-current': true }
});

assert.match(html, /data-knowledge-point-attach-toggle/);
assert.match(html, /data-knowledge-point-attach-query/);
assert.match(html, /data-knowledge-point-attach-existing="kp-available"/);
assert.doesNotMatch(html, /data-knowledge-point-attach-existing="kp-current"/);
assert.match(html, /data-knowledge-point-source-remove="src-current"/);
assert.match(html, /data-knowledge-point-delete="kp-current"/);

const sourceInput = buildKnowledgePointSourceInputFromSelection({
  note,
  selection: {
    sourceText: '加入已有知识点的新片段',
    startOffset: 12,
    endOffset: 24,
    contextBefore: '前文',
    contextAfter: '后文',
    anchor: { type: 'prosemirror-text-range', from: 12, to: 24 }
  },
  now: new Date('2026-06-21T09:00:00.000Z')
});

assert.match(sourceInput.id, /^kps-20260621T090000000Z-/);
assert.equal(sourceInput.noteId, 'note-current');
assert.equal(sourceInput.spaceId, 'space-v205');
assert.equal(sourceInput.sourceText, '加入已有知识点的新片段');
assert.equal(sourceInput.startOffset, 12);
assert.equal(sourceInput.endOffset, 24);

const clientJs = readFileSync(new URL('../src/client.js', import.meta.url), 'utf8');
assert.match(clientJs, /allKnowledgePoints/);
assert.match(clientJs, /attachSelectionToExistingKnowledgePoint/);
assert.match(clientJs, /removeKnowledgePointSourceFromCurrentNote/);
assert.match(clientJs, /deleteKnowledgePointFromLibrary/);
assert.match(clientJs, /knowledgeApi\.addSourceToKnowledgePoint\(pointId, sourceInput\)/);
assert.match(clientJs, /knowledgeApi\.deleteKnowledgePointSource\(sourceId\)/);
assert.match(clientJs, /knowledgeApi\.deleteKnowledgePoint\(pointId\)/);
assert.match(clientJs, /knowledgeApi\.updateKnowledgePoint\(pointId, updates\)/);

console.log('ok - V2.0.5 knowledge point management hooks are wired');
