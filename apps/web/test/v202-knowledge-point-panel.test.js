import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  filterKnowledgePoints,
  renderKnowledgePointPanel
} from '../lib/knowledge-points/panel.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientJs = fs.readFileSync(path.resolve(__dirname, '../src/client.js'), 'utf8');

const points = [
  {
    id: 'kp-1',
    title: 'CLIP 对比学习损失',
    comment: '图文对比学习的核心理解',
    tagIds: ['tag-clip', 'tag-mastered'],
    sources: [
      { id: 'source-1', sourceText: 'CLIP uses a contrastive loss.' },
      { id: 'source-2', sourceText: 'The loss is symmetric.' }
    ]
  },
  {
    id: 'kp-2',
    title: 'Transformer 注意力',
    comment: '',
    tagIds: ['tag-attention'],
    sources: [{ id: 'source-3', sourceText: 'Attention maps tokens.' }]
  }
];

const tagGroups = [
  {
    code: 'ordinary',
    name: '普通标签',
    selectionMode: 'multiple',
    tags: [
      { id: 'tag-clip', name: 'CLIP' },
      { id: 'tag-attention', name: '注意力' }
    ]
  },
  {
    code: 'mastery',
    name: '掌握程度',
    selectionMode: 'single',
    tags: [{ id: 'tag-mastered', name: '已掌握' }]
  }
];

assert.deepEqual(
  filterKnowledgePoints(points, { query: 'contrastive', tagIds: [] }).map((point) => point.id),
  ['kp-1'],
  'knowledge point filtering should search source snippets'
);

assert.deepEqual(
  filterKnowledgePoints(points, { query: '', tagIds: ['tag-clip', 'tag-mastered'] }).map((point) => point.id),
  ['kp-1'],
  'knowledge point filtering should require all selected tags'
);

const html = renderKnowledgePointPanel({
  note: { id: 'note-1', title: 'CLIP Note' },
  points,
  tagGroups,
  filters: { query: 'CLIP', tagIds: ['tag-mastered'], isOpen: true },
  expandedIds: { 'kp-1': true },
  editing: { id: 'kp-1', title: 'CLIP 对比学习损失', comment: '图文对比学习的核心理解' }
});

assert.match(html, /知识点/);
assert.match(html, /data-knowledge-point-filter-input/);
assert.match(html, /data-knowledge-point-id="kp-1"/);
assert.match(html, /CLIP 对比学习损失/);
assert.match(html, /图文对比学习的核心理解/);
assert.match(html, /原文片段/);
assert.match(html, /CLIP uses a contrastive loss\./);
assert.match(html, /data-knowledge-point-edit-form/);
assert.doesNotMatch(html, /知识点面板将在 V1\.4 后续迭代接入/);

assert.match(
  clientJs,
  /renderKnowledgePointPanel/,
  'client should delegate knowledge point panel rendering to the module'
);
assert.match(
  clientJs,
  /knowledgeApi\.loadNoteSideData/,
  'client should load knowledge point side data through the API service'
);
assert.match(
  clientJs,
  /knowledgePointTagGroups/,
  'client should keep rendering backend knowledge point tag groups'
);

console.log('ok - V2.0.2 knowledge point panel renders cards and filters');
