import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  buildKnowledgePointInputFromSelection,
  deriveKnowledgePointTitle
} from '../lib/knowledge-points/selection.js';

const note = {
  id: 'note-v203',
  spaceId: 'space-v2',
  title: 'V2.0.3 Note'
};

const selection = {
  sourceText: '间隔重复能显著提高长期记忆保持率。',
  startOffset: 42,
  endOffset: 58,
  contextBefore: '学习策略中，',
  contextAfter: '这也是复习计划的核心依据。',
  anchor: { type: 'prosemirror-text-range', from: 42, to: 58 }
};

assert.equal(
  deriveKnowledgePointTitle('  间隔重复能显著提高长期记忆保持率，这里还有更多描述  '),
  '间隔重复能显著提高长期记忆保持率，这里还有更多描述'
);
assert.equal(
  deriveKnowledgePointTitle('这是一个超过三十个字符的知识点标题候选，需要被安全截断并继续保留更多尾部内容'),
  '这是一个超过三十个字符的知识点标题候选，需要被安全截断并继续...'
);

const input = buildKnowledgePointInputFromSelection({
  note,
  selection,
  now: new Date('2026-06-21T08:00:00.000Z')
});

assert.match(input.id, /^kp-20260621T080000000Z-/);
assert.equal(input.spaceId, 'space-v2');
assert.equal(input.noteId, 'note-v203');
assert.equal(input.title, '间隔重复能显著提高长期记忆保持率。');
assert.deepEqual(input.tagIds, []);
assert.equal(input.sources.length, 1);
assert.match(input.sources[0].id, /^kps-20260621T080000000Z-/);
assert.equal(input.sources[0].noteId, 'note-v203');
assert.equal(input.sources[0].spaceId, 'space-v2');
assert.equal(input.sources[0].sourceText, selection.sourceText);
assert.equal(input.sources[0].startOffset, 42);
assert.equal(input.sources[0].endOffset, 58);
assert.equal(input.sources[0].contextBefore, '学习策略中，');
assert.equal(input.sources[0].contextAfter, '这也是复习计划的核心依据。');
assert.deepEqual(input.sources[0].anchor, selection.anchor);

const clientJs = readFileSync(new URL('../src/client.js', import.meta.url), 'utf8');
assert.match(clientJs, /create-knowledge-point/);
assert.match(clientJs, /getSelectionSnapshot/);
assert.match(clientJs, /knowledgeApi\.createKnowledgePoint\(input\)/);

console.log('ok - V2.0.3 builds knowledge point payload from editor selection');
