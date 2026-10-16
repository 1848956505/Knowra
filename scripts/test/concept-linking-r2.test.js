import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { NOTES } from '../experiments/concept-linking-r2/scenario.mjs';
import { SYSTEM_PROMPT, applyResponse, createState, gradeRun, longestCommon, modelRequest, retrieveConcepts, senseLooksLikeContent } from '../experiments/concept-linking-r2/core.mjs';
import { main } from '../experiments/concept-linking-r2/run.mjs';

const note = id => NOTES.find(entry => entry.id === id);
const item = (quote, kind = 'fact') => ({ title: quote.slice(0, 10), kind, statement: quote, quote });
const reuse = (conceptId, quote, extra = {}) => ({ conceptAction: 'reuse', conceptId, newConcept: null, possibleDuplicateOf: null, itemAction: 'new', existingItemId: null, item: item(quote), ...extra });
const create = (name, sense, quote, possibleDuplicateOf = null) => ({ conceptAction: 'create', conceptId: null, newConcept: { name, sense }, possibleDuplicateOf, itemAction: 'new', existingItemId: null, item: item(quote) });
const response = (id, links) => ({ requestId: `concept-link-r2-${id}`, links, remarks: '' });

/** 理想模型：按预期回答每一条。 */
function idealLinks(target) {
  return target.expected.map(expected => {
    if (expected.accept[0] === 'create') return create(target.id === 'R07' ? '矩阵乘法' : 'x.grad', '深度学习框架中的属性', expected.span);
    const link = reuse(expected.accept[0], expected.span);
    if (expected.reuseItem) Object.assign(link, { itemAction: 'reuse', existingItemId: expected.reuseItem });
    return link;
  });
}

test('提示词不点名任何具体概念，笔记标题不等于概念名', () => {
  for (const name of ['矩阵乘法', '逐元素乘法', '点积', '梯度', '转置']) assert.equal(SYSTEM_PROMPT.includes(name), false, name);
  for (const entry of NOTES) assert.equal(entry.candidates.length, 8);
});

test('请求只包含候选概念及其条目；R07 看不到正确的矩阵乘法', () => {
  const state = createState();
  const request = modelRequest(state, note('R07'));
  assert.equal(request.candidateConcepts.some(concept => concept.id === 'C_MATMUL'), false);
  assert.equal(request.candidateItems.some(entry => entry.id === 'K_PRE_1'), false);
  assert.equal(Object.hasOwn(request.note, 'expected'), false);
  assert.equal(JSON.stringify(request).includes('forbid'), false);
});

test('理想回答全部判为正确；藏起来的概念被同名新建时标记为可能重复', () => {
  const state = createState();
  const results = NOTES.map(target => ({ noteId: target.id, response: applyResponse(state, target, response(target.id, idealLinks(target))) }));
  const grade = gradeRun(results);
  assert.equal(grade.correct, grade.expectedTotal);
  assert.equal(grade.contamination + grade.wrong + grade.missing + grade.rejected, 0);
  assert.equal(grade.itemOk, grade.graded);
  assert.equal(results.find(r => r.noteId === 'R07').response.links[0].duplicateOfHidden, 'C_MATMUL');
});

test('挂到禁止的概念计为污染；有正确候选却新建计为重复；复用不在候选中的概念被拒', () => {
  const state = createState();
  const r07 = applyResponse(state, note('R07'), response('R07', [reuse('C_DOT', note('R07').expected[0].span)]));
  const r02 = applyResponse(state, note('R02'), response('R02', [create('星号乘法', '一种运算', note('R02').expected[0].span)]));
  const r03 = applyResponse(state, note('R03'), response('R03', [reuse('C_GRADIENT', note('R03').expected[0].span)]));
  const grade = gradeRun([{ noteId: 'R07', response: r07 }, { noteId: 'R02', response: r02 }, { noteId: 'R03', response: r03 }]);
  const outcomes = id => grade.rows.filter(row => row.noteId === id).map(row => row.outcome);
  assert.deepEqual(outcomes('R07'), ['contamination']);
  assert.deepEqual(outcomes('R02'), ['duplicate']);
  assert.deepEqual(outcomes('R03'), ['missing', 'rejected']);
});

test('一条不合格只拒绝这一条；多条知识分别评分；概念说明写进条目内容会被标出', () => {
  const state = createState();
  const target = note('R06');
  const links = [
    reuse('C_TRANSPOSE', target.expected[0].span),
    reuse('C_TRANSPOSE', '笔记里没有这句话'),
    reuse('C_HADAMARD', target.expected[2].span),
    create('矩阵转置', '把它的行变成列的操作', target.expected[3].span)
  ];
  const result = applyResponse(state, target, response('R06', links));
  assert.deepEqual(result.links.map(link => link.accepted), [true, false, true, true]);
  assert.equal(result.links[3].senseAbsorbs, true);
  const grade = gradeRun([{ noteId: 'R06', response: result }]);
  const r06 = grade.rows.filter(row => row.noteId === 'R06').map(row => row.outcome).sort();
  assert.deepEqual(r06, ['contamination', 'correct', 'duplicate', 'missing', 'rejected']);
  assert.ok(longestCommon('把它的行变成列', '就是把它的行变成列。') >= 7);
});

test('复用已有条目时不改写原陈述，只追加来源', () => {
  const state = createState();
  const target = note('R08');
  const result = applyResponse(state, target, response('R08', [{ ...reuse('C_MATMUL', target.expected[0].span), itemAction: 'reuse', existingItemId: 'K_PRE_1' }]));
  assert.equal(result.links[0].accepted, true);
  const prior = state.items.find(entry => entry.id === 'K_PRE_1');
  assert.equal(prior.statement, '一般情况下 AB 不等于 BA。');
  assert.equal(prior.sources.length, 1);
});

test('端到端：假模型跑 3 次，报告不含 key，汇总与逐条结果都生成', async () => {
  const out = await mkdtemp(path.join(os.tmpdir(), 'concept-r2-'));
  const fetchImpl = async (_url, init) => {
    const request = JSON.parse(JSON.parse(init.body).messages[1].content);
    const target = note(request.note.id);
    const content = JSON.stringify(response(target.id, idealLinks(target)));
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content } }], usage: {} }));
  };
  const { runs } = await main(['--out', out], { env: { DEEPSEEK_API_KEY: 'secret-key-value' }, fetchImpl, log: () => {} });
  assert.equal(runs.length, 3);
  const report = await readFile(path.join(out, 'report.md'), 'utf8');
  assert.match(report, /R07（正确概念被藏起来）/);
  assert.equal(report.includes('secret-key-value'), false);
  assert.equal((await readFile(path.join(out, 'result.json'), 'utf8')).includes('secret-key-value'), false);
});

test('疑似重复只能在新建时指向候选；说明里写了条件或结论会被标出', () => {
  const state = createState();
  const target = note('R08');
  const ok = applyResponse(state, target, response('R08', [create('矩阵相乘', '线性代数中的乘法运算', target.expected[0].span, 'C_MATMUL')]));
  assert.equal(ok.links[0].accepted, true);
  assert.equal(ok.links[0].possibleDuplicateOf, 'C_MATMUL');
  const bad = applyResponse(createState(), target, response('R08', [{ ...reuse('C_MATMUL', target.expected[0].span), possibleDuplicateOf: 'C_DOT' }]));
  assert.equal(bad.links[0].accepted, false);
  assert.equal(senseLooksLikeContent('结果矩阵的元素由左矩阵的行与右矩阵的列做点积得到'), true);
  assert.equal(senseLooksLikeContent('深度学习框架中张量上存放梯度值的属性'), false);
});

test('没有预设候选时按字符重合检索，空库时候选为空', () => {
  const state = createState({ empty: true });
  assert.deepEqual(modelRequest(state, { id: 'X', markdown: '矩阵乘法' }).candidateConcepts, []);
  const found = retrieveConcepts(createState().concepts, '两个矩阵相乘时要看形状', 3).map(concept => concept.id);
  assert.ok(found.includes('C_MATMUL') || found.includes('C_MATRIX'));
});

test('本机真实笔记模式：空库起步、按节切分、第二篇能检索到第一篇新建的概念，key 不进报告', async () => {
  const { main: runLocal } = await import('../experiments/concept-linking-r2/run-local.mjs');
  const { writeFile } = await import('node:fs/promises');
  const dir = await mkdtemp(path.join(os.tmpdir(), 'concept-local-'));
  const notesFile = path.join(dir, 'notes.md');
  await writeFile(notesFile, '# 2.1 矩阵乘法\n矩阵乘法要求左矩阵列数等于右矩阵行数。\n# 2.2 再谈矩阵乘法\n矩阵乘法一般不满足交换律。');
  const requests = [];
  const fetchImpl = async (_url, init) => {
    const request = JSON.parse(JSON.parse(init.body).messages[1].content);
    requests.push(request);
    const quote = request.note.markdown.split('\n')[1];
    const existing = request.candidateConcepts[0];
    const link = existing
      ? { conceptAction: 'reuse', conceptId: existing.id, newConcept: null, possibleDuplicateOf: null, itemAction: 'new', existingItemId: null, item: { title: 't', kind: 'fact', statement: quote, quote } }
      : { conceptAction: 'create', conceptId: null, newConcept: { name: '矩阵乘法', sense: '线性代数中的乘法运算' }, possibleDuplicateOf: null, itemAction: 'new', existingItemId: null, item: { title: 't', kind: 'fact', statement: quote, quote } };
    const content = JSON.stringify({ requestId: request.requestId, links: [link], remarks: '' });
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content } }], usage: {} }));
  };
  const out = path.join(dir, 'out');
  const { state } = await runLocal(['--notes', notesFile, '--out', out], { env: { DEEPSEEK_API_KEY: 'secret-key-value' }, fetchImpl, log: () => {} });
  assert.equal(requests[0].candidateConcepts.length, 0);
  assert.equal(requests[1].candidateConcepts[0].name, '矩阵乘法');
  assert.equal(state.concepts.length, 1);
  assert.equal(state.items.length, 2);
  const report = await readFile(path.join(out, 'report.md'), 'utf8');
  assert.match(report, /新建概念 1 个/);
  assert.equal(report.includes('secret-key-value'), false);
});
