import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { NOTES } from '../experiments/concept-linking-r2/scenario.mjs';
import { SYSTEM_PROMPT, applyResponse, createState, gradeRun, longestCommon, modelRequest, quoteHasSubstance, retrieveConcepts, senseLooksLikeContent } from '../experiments/concept-linking-r2/core.mjs';
import { main, repairInvalidEscapes } from '../experiments/concept-linking-r2/run.mjs';

const note = id => NOTES.find(entry => entry.id === id);
const item = (quote, kind = 'fact') => ({ title: quote.slice(0, 10), kind, statement: quote, quote });
const reuse = (conceptId, quote, extra = {}) => ({ conceptAction: 'reuse', conceptId, newConcept: null, possibleDuplicateOf: null, itemAction: 'new', existingItemId: null, item: item(quote), sourceIssue: null, ...extra });
const create = (name, sense, quote, possibleDuplicateOf = null) => ({ conceptAction: 'create', conceptId: null, newConcept: { name, sense }, possibleDuplicateOf, itemAction: 'new', existingItemId: null, item: item(quote), sourceIssue: null });
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
      ? { conceptAction: 'reuse', conceptId: existing.id, newConcept: null, possibleDuplicateOf: null, itemAction: 'new', existingItemId: null, item: { title: 't', kind: 'fact', statement: quote, quote }, sourceIssue: null }
      : { conceptAction: 'create', conceptId: null, newConcept: { name: '矩阵乘法', sense: '线性代数中的乘法运算' }, possibleDuplicateOf: null, itemAction: 'new', existingItemId: null, item: { title: 't', kind: 'fact', statement: quote, quote }, sourceIssue: null };
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

test('只引用标题的条目被拒；sourceIssue 必须为空或简短说明', () => {
  assert.equal(quoteHasSubstance('## 1.3.1 监督学习'), false);
  assert.equal(quoteHasSubstance('```\nX.sum()\n```'), true);
  assert.equal(quoteHasSubstance('1、张量：多维数组'), true);
  const target = { id: 'H1', markdown: '## 1.3.1 监督学习\n### 分类\n层次分类是类别有级别的分类。', candidates: ['C_MATRIX', 'C_ADD', 'C_DOT', 'C_DET', 'C_RANK', 'C_EIG', 'C_NORM', 'C_TENSOR'], expected: [] };
  const state = createState();
  const result = applyResponse(state, target, { requestId: 'concept-link-r2-H1', remarks: '', links: [
    create('监督学习', '机器学习的一类任务', '## 1.3.1 监督学习'),
    { ...create('层次分类', '分类任务的一种', '层次分类是类别有级别的分类。'), sourceIssue: 'x'.repeat(201) },
    { ...create('层次分类', '分类任务的一种', '层次分类是类别有级别的分类。'), sourceIssue: '原文没有说明级别如何划分' }
  ] });
  assert.deepEqual(result.links.map(link => link.accepted), [false, false, true]);
  assert.match(result.links[0].errors.join(), /只有标题/);
  assert.equal(result.links[2].sourceIssue, '原文没有说明级别如何划分');
});

test('R09 评分区分是否保留原话、是否标注存疑', () => {
  const state = createState();
  const target = note('R09');
  const kept = applyResponse(state, target, response('R09', [{ ...reuse('C_SOFTMAX', target.expected[0].span), sourceIssue: 'softmax 输出之和应为 1' }]));
  assert.deepEqual(gradeRun([{ noteId: 'R09', response: kept }]).fidelity, ['保留原话，标注存疑']);
  const fixedLink = reuse('C_SOFTMAX', target.expected[0].span);
  fixedLink.item.statement = 'softmax 的输出各项之和等于 1。';
  const fixed = applyResponse(createState(), target, response('R09', [fixedLink]));
  assert.deepEqual(gradeRun([{ noteId: 'R09', response: fixed }]).fidelity, ['改写了原话，未标注']);
});

test('检索按名称覆盖率打分：短名“梯度”不再被长名字挤出候选', () => {
  const concepts = [
    { id: 'A', name: '张量与NumPy数组的转换', sense: 'PyTorch 张量与 NumPy 数组之间的转换' },
    { id: 'B', name: '矩阵与向量/矩阵的积', sense: 'PyTorch 中矩阵与向量相乘' },
    { id: 'C', name: '梯度', sense: '多元函数偏导数组成的向量' },
    { id: 'D', name: '沿轴降维求和', sense: 'PyTorch 张量沿轴求和' }
  ];
  const text = '如何对某个变量进行求导（求梯度）：告诉pytorch，我们要对x求梯度，需要一个地方存储梯度；x.grad 是张量的属性';
  assert.equal(retrieveConcepts(concepts, text, 4)[0].id, 'C');
});

test('同一篇里复用同名新概念的条目不再被标“说明含内容”', () => {
  const state = createState();
  const target = note('R06');
  const result = applyResponse(state, target, response('R06', [
    create('矩阵转置', '线性代数中的一种操作', target.expected[0].span),
    create('矩阵转置', '线性代数中的一种操作', target.expected[3].span)
  ]));
  assert.equal(result.links[1].conceptAction, 'create-same-note');
  assert.equal(result.links[1].senseAbsorbs, false);
});

test('整篇失败时报告给出原因类别，不含供应商正文', async () => {
  const out = await mkdtemp(path.join(os.tmpdir(), 'concept-r2-fail-'));
  const fetchImpl = async () => new Response(JSON.stringify({ choices: [{ finish_reason: 'length', message: { content: '{"requestId":' } }] }));
  await main(['--out', out, '--repeats', '1'], { env: { DEEPSEEK_API_KEY: 'k' }, fetchImpl, log: () => {} });
  const report = await readFile(path.join(out, 'report.md'), 'utf8');
  assert.match(report, /## 整篇失败/);
  assert.match(report, /finish_reason=length/);
});

test('非法 JSON 转义（如 \(、\alpha）被修复，合法转义保持不变', () => {
  const broken = '{"a":"\\(x^2\\) 与 \\alpha","b":"行\\n引号\\"\\u4e2d"}';
  assert.throws(() => JSON.parse(broken));
  const fixed = JSON.parse(repairInvalidEscapes(broken));
  assert.equal(fixed.a, '\\(x^2\\) 与 \\alpha');
  assert.equal(fixed.b, '行\n引号"中');
  // 已知局限：\frac、\nabla 恰好是合法转义（\f、\n），解析不报错但内容被改变；这类条目会因 quote 不在原文而被拒。
  assert.equal(JSON.parse(repairInvalidEscapes('{"a":"\\frac"}')).a, '\frac');
});

test('JSON 无效时报告附出错位置附近的片段', async () => {
  const out = await mkdtemp(path.join(os.tmpdir(), 'concept-r2-json-'));
  const fetchImpl = async () => new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: '{"requestId":"x","links":[{"a":"未闭合}]' } }] }));
  await main(['--out', out, '--repeats', '1'], { env: { DEEPSEEK_API_KEY: 'k' }, fetchImpl, log: () => {} });
  const report = await readFile(path.join(out, 'report.md'), 'utf8');
  assert.match(report, /模型输出不是合法 JSON（.*附近内容/);
});
