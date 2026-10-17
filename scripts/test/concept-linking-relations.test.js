import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { RELATION_PROMPT, applyRelations, relationRequest, relationsReport } from '../experiments/concept-linking-r2/relations.mjs';
import { main as runRelationsCli } from '../experiments/concept-linking-r2/run-relations.mjs';

const state = {
  concepts: [
    { id: 'N1', name: '梯度', sense: '数学', origin: 'created', noteId: 'L1' },
    { id: 'N2', name: '自动微分', sense: 'PyTorch', origin: 'created', noteId: 'L2' },
    { id: 'N3', name: '张量', sense: '多维数组', origin: 'created', noteId: 'L3' }
  ],
  items: [
    { id: 'K1', conceptId: 'N1', title: '梯度的定义', kind: 'definition', statement: '偏导数组成的向量', sources: [{ noteId: 'L1', quote: '原文一' }] },
    { id: 'K2', conceptId: 'N2', title: '求梯度', kind: 'procedure', statement: 'backward 后读 x.grad', sources: [{ noteId: 'L2', quote: '原文二' }] }
  ]
};
const rel = (from, to, type, basisItemId = null, reason = '理由') => ({ from, to, type, basisItemId, reason });

test('关系提示词不点名具体概念；请求包含全部概念，不含笔记原文', () => {
  for (const name of ['梯度', '张量', '矩阵']) assert.equal(RELATION_PROMPT.includes(name), false, name);
  const request = relationRequest(state);
  assert.deepEqual(request.concepts.map(concept => concept.id), ['N1', 'N2', 'N3']);
  assert.deepEqual(request.concepts[2].items, []);
  assert.equal(JSON.stringify(request).includes('原文'), false);
});

test('逐条校验：类型、端点、依据条目、重复对；通过的一律候选并标来源', () => {
  const request = relationRequest(state);
  const { proposals } = applyRelations(state, request, { requestId: request.requestId, relations: [
    rel('N1', 'N2', 'prerequisiteOf', 'K2'),
    rel('N2', 'N1', 'contrastsWith'),
    rel('N3', 'N3', 'isA'),
    rel('N3', 'N9', 'isA'),
    rel('N3', 'N1', 'sameAs'),
    rel('N3', 'N1', 'relatedTo', 'K2'),
    { ...rel('N3', 'N2', 'appliesTo'), extra: 1 },
    rel('N3', 'N2', 'relatedTo')
  ] });
  assert.deepEqual(proposals.map(entry => entry.accepted), [true, false, false, false, false, false, false, true]);
  assert.deepEqual(proposals[0], { index: 0, accepted: true, from: 'N1', to: 'N2', type: 'prerequisiteOf', basisItemId: 'K2', sourceMode: 'note', reviewStatus: 'candidate', reason: '理由' });
  assert.match(proposals[1].errors.join(), /重复/);
  assert.match(proposals[5].errors.join(), /basisItemId/);
  assert.deepEqual([proposals[7].from, proposals[7].to, proposals[7].sourceMode], ['N2', 'N3', 'ai']);
  assert.equal(applyRelations(state, request, { requestId: 'other', relations: [] }).accepted, false);
});

test('关系数不超过概念数的 2 倍', () => {
  const many = { concepts: Array.from({ length: 3 }, (_, i) => ({ id: `C${i}`, name: `c${i}`, sense: '' })), items: [] };
  const request = relationRequest(many);
  const pairs = [['C0', 'C1'], ['C0', 'C2'], ['C1', 'C2']];
  const { proposals } = applyRelations(many, request, { requestId: request.requestId, relations: pairs.map(([a, b]) => rel(a, b, 'relatedTo')) });
  assert.equal(proposals.filter(entry => entry.accepted).length, 3);
  const two = { concepts: many.concepts.slice(0, 1).concat({ id: 'C9', name: 'c9', sense: '' }), items: [] };
  const twoRequest = relationRequest(two);
  const capped = applyRelations(two, twoRequest, { requestId: twoRequest.requestId, relations: [rel('C0', 'C9', 'isA'), rel('C9', 'C0', 'relatedTo')] });
  assert.deepEqual(capped.proposals.map(entry => entry.accepted), [true, false]);
});

test('补跑关系：概念和条目不变，只追加 relations；报告不含原文与 key', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'concept-relations-'));
  const input = path.join(dir, 'in', 'result.json');
  await import('node:fs/promises').then(fs => fs.mkdir(path.dirname(input)));
  await writeFile(input, JSON.stringify({ state, results: [], review: { suggestions: [], errors: [] } }));
  const fetchImpl = async (_url, init) => {
    const request = JSON.parse(JSON.parse(init.body).messages[1].content);
    const content = JSON.stringify({ requestId: request.requestId, relations: [rel('N1', 'N2', 'prerequisiteOf', null, '自动微分用来求梯度')] });
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content } }], usage: {} }));
  };
  const out = path.join(dir, 'out');
  await runRelationsCli(['--result', input, '--out', out], { env: { DEEPSEEK_API_KEY: 'secret-key-value' }, fetchImpl, log: () => {} });
  const written = JSON.parse(await readFile(path.join(out, 'result.json'), 'utf8'));
  assert.deepEqual(written.state, state);
  assert.equal(written.relations.proposals[0].sourceMode, 'ai');
  const report = await readFile(path.join(out, 'relations.md'), 'utf8');
  assert.match(report, /通过校验 1 条/);
  assert.match(report, /仍然孤立的概念 1 个：张量/);
  assert.equal(report.includes('secret-key-value') || report.includes('原文'), false);
  assert.match(relationsReport(state, { proposals: [], errors: ['x'] }), /失败：x/);
});
