import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { NOTES } from '../experiments/concept-linking-r2/scenario.mjs';
import { BASELINE_PROMPT_20261016, REVIEW_PROMPT, SYSTEM_PROMPT, applyResponse, applyReview, describeSplit, gradeReview, reviewRequests, createState, gradeRun, longestCommon, modelRequest, quoteHasSubstance, retrieveConcepts, senseLooksLikeContent } from '../experiments/concept-linking-r2/core.mjs';
import { invokeWithRetry, main, repairInvalidEscapes } from '../experiments/concept-linking-r2/run.mjs';

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
  assert.equal(quoteHasSubstance('A.T'), true);
  assert.equal(quoteHasSubstance('### 2.3.3 矩阵\n```\n```'), false);
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

test('挂靠提示词就是对照版；三条标准只出现在整理建议提示词里', () => {
  assert.equal(SYSTEM_PROMPT, BASELINE_PROMPT_20261016);
  assert.doesNotMatch(SYSTEM_PROMPT, /三条标准|最相关|小标题/);
  assert.match(REVIEW_PROMPT, /三条标准/);
  for (const prompt of [SYSTEM_PROMPT, REVIEW_PROMPT]) for (const name of ['查阅文档', '原地运算', 'keepdims', '深度学习', '梯度']) assert.doesNotMatch(prompt, new RegExp(name));
});

/** 跑完 R04、R07、R14 三篇（按理想回答新建概念），返回状态。 */
function stateWithCreated() {
  const state = createState();
  applyResponse(state, note('R04'), response('R04', idealLinks(note('R04'))));
  applyResponse(state, note('R07'), response('R07', idealLinks(note('R07'))));
  const spans = note('R14').expected.map(expected => expected.span);
  applyResponse(state, note('R14'), response('R14', [create('keepdims', '求和参数', spans[0]), create('keepdims', '求和参数', spans[1]), create('累积和', '沿轴累加的运算', spans[2])]));
  return state;
}

test('整理建议请求只含新建概念及其条目，候选来自已有概念且能找回被藏起来的同名概念', () => {
  const state = stateWithCreated();
  const [request] = reviewRequests(state);
  assert.deepEqual(request.newConcepts.map(concept => concept.name), ['x.grad', '矩阵乘法', 'keepdims', '累积和']);
  const matmul = request.newConcepts.find(concept => concept.name === '矩阵乘法');
  assert.equal(matmul.candidates[0].id, 'C_MATMUL');
  // 候选包含其他新建概念（真实笔记从空库开始），但不含自身。
  assert.ok(request.newConcepts.every(concept => concept.candidates.every(candidate => candidate.id !== concept.id)));
  assert.ok(request.newConcepts.find(concept => concept.name === '累积和').candidates.some(candidate => candidate.name === 'keepdims'));
  assert.equal(request.newConcepts.find(concept => concept.name === 'keepdims').items.length, 2);
});

test('整理建议逐条校验，并按预期评为理想、可接受或有害', () => {
  const state = stateWithCreated();
  const [request] = reviewRequests(state);
  const id = name => request.newConcepts.find(concept => concept.name === name).id;
  const result = applyReview(state, request, { requestId: request.requestId, suggestions: [
    { conceptId: id('x.grad'), action: 'keep', targetId: null, newName: null, split: null, reason: '框架属性' },
    { conceptId: id('矩阵乘法'), action: 'merge', targetId: 'C_MATMUL', newName: null, split: null, reason: '同名同义' },
    { conceptId: id('keepdims'), action: 'demote', targetId: 'C_BROADCAST', newName: null, split: null, reason: '为广播服务' },
    { conceptId: id('累积和'), action: 'merge', targetId: id('keepdims'), newName: null, split: null, reason: '同一主题' },
    { conceptId: id('累积和'), action: 'demote', targetId: 'C_NOT_SHOWN', newName: null, split: null, reason: '目标不在候选' },
    { conceptId: id('累积和'), action: 'keep', targetId: null, newName: null, split: null, reason: '重复给出' }
  ] });
  assert.deepEqual(result.suggestions.map(entry => entry.accepted), [true, true, true, true, false, false]);
  const graded = gradeReview(state, result.suggestions);
  assert.deepEqual(graded.map(entry => `${entry.name}:${entry.token}:${entry.grade}`), ['x.grad:keep:ideal', '矩阵乘法:merge:C_MATMUL:ideal', 'keepdims:demote:C_BROADCAST:harmful', '累积和:merge:sibling:ideal']);
  assert.equal(applyReview(state, request, { requestId: 'x', suggestions: [] }).accepted, false);
});

test('端到端：挂靠之后请求整理建议，报告含建议表', async () => {
  const out = await mkdtemp(path.join(os.tmpdir(), 'concept-r2-review-'));
  const fetchImpl = async (_url, init) => {
    const request = JSON.parse(JSON.parse(init.body).messages[1].content);
    const content = request.newConcepts
      ? JSON.stringify({ requestId: request.requestId, suggestions: request.newConcepts.map(concept => ({ conceptId: concept.id, action: 'keep', targetId: null, newName: null, split: null, reason: '保留' })) })
      : JSON.stringify(response(request.note.id, idealLinks(note(request.note.id))));
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content } }], usage: {} }));
  };
  const { runs, report } = await main(['--out', out, '--repeats', '1'], { env: { DEEPSEEK_API_KEY: 'k' }, fetchImpl, log: () => {} });
  assert.ok(runs[0].review.graded.length > 0);
  assert.equal(runs[0].review.errors.length, 0);
  assert.match(report, /## 整理建议/);
  assert.match(report, /整理建议：理想 \/ 可接受/);
});

test('把操作、关系或比较建成概念计为类型错误；挂到合适概念计为正确', () => {
  const state = createState();
  const r10 = applyResponse(state, note('R10'), response('R10', [create('查阅文档', '查看库函数用法的方法', note('R10').expected[0].span)]));
  const r11 = applyResponse(state, note('R11'), response('R11', [reuse('C_DL', note('R11').expected[0].span)]));
  const r12 = applyResponse(state, note('R12'), response('R12', [reuse('C_RANK', note('R12').expected[0].span)]));
  const grade = gradeRun([{ noteId: 'R10', response: r10 }, { noteId: 'R11', response: r11 }, { noteId: 'R12', response: r12 }]);
  const outcome = id => grade.rows.filter(row => row.noteId === id).map(row => row.outcome);
  assert.deepEqual(outcome('R10'), ['typeError']);
  assert.deepEqual(outcome('R11'), ['correct']);
  assert.deepEqual(outcome('R12'), ['contamination']);
  assert.equal(grade.typeError, 1);
});

test('照抄小标题的概念名被标出，规范术语不标', () => {
  const target = note('R13');
  const [first, second] = target.expected.map(expected => expected.span);
  const copied = applyResponse(createState(), target, response('R13', [create('节省内存', '张量运算的一种写法', first), create('节省内存', '张量运算的一种写法', second)]));
  const proper = applyResponse(createState(), target, response('R13', [create('原地运算', '把结果写回原张量的运算方式', first), create('原地运算', '把结果写回原张量的运算方式', second)]));
  assert.equal(gradeRun([{ noteId: 'R13', response: copied }]).nameCopied, 2);
  const good = gradeRun([{ noteId: 'R13', response: proper }]);
  assert.equal(good.nameCopied, 0);
  assert.equal(good.rows.filter(row => row.noteId === 'R13' && row.outcome === 'correct').length, 2);
});

test('共享代码片段的几段原文各自只匹配自己的链接；R14 拆成过多概念会被标出', () => {
  const target = note('R14');
  const spans = target.expected.map(expected => expected.span);
  const one = applyResponse(createState(), target, response('R14', spans.map(span => create('非降维求和', '求和时保留被求和的轴', span))));
  const grade = gradeRun([{ noteId: 'R14', response: one }]);
  const rows = grade.rows.filter(row => row.noteId === 'R14');
  assert.deepEqual(rows.map(row => row.outcome), ['correct', 'correct', 'correct']);
  assert.deepEqual(grade.splits.find(split => split.noteId === 'R14'), { noteId: 'R14', names: ['非降维求和'], over: false });
  const many = applyResponse(createState(), target, response('R14', spans.map((span, i) => create(['keepdims', '广播求和', 'cumsum'][i], '张量操作', span))));
  assert.equal(gradeRun([{ noteId: 'R14', response: many }]).splits.find(split => split.noteId === 'R14').over, true);
});

test('输出不是合法 JSON 时只重试一次', async () => {
  const valid = JSON.stringify({ requestId: 'x', links: [], remarks: '' });
  let calls = 0;
  const flaky = async () => { calls += 1; return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: calls === 1 ? '{"a":}' : valid } }] })); };
  const ok = await invokeWithRetry(flaky, 'k', {}, 100);
  assert.equal(ok.retried, true);
  assert.equal(calls, 2);
  calls = 0;
  const broken = async () => { calls += 1; return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: '{"a":}' } }] })); };
  await assert.rejects(invokeWithRetry(broken, 'k', {}, 100), /不是合法 JSON/);
  assert.equal(calls, 2);
  calls = 0;
  const cut = async () => { calls += 1; return new Response(JSON.stringify({ choices: [{ finish_reason: 'length', message: { content: '{' } }] })); };
  await assert.rejects(invokeWithRetry(cut, 'k', {}, 100), /finish_reason=length/);
  assert.equal(calls, 1);
});

test('整理建议支持改名：只能给出新名称，不能同时指向目标', () => {
  const state = stateWithCreated();
  const [request] = reviewRequests(state);
  const id = request.newConcepts.find(concept => concept.name === 'keepdims').id;
  const ok = applyReview(state, request, { requestId: request.requestId, suggestions: [{ conceptId: id, action: 'rename', targetId: null, newName: '非降维求和', split: null, reason: '参数名不是概念名' }] });
  assert.equal(ok.suggestions[0].accepted, true);
  assert.equal(gradeReview(state, ok.suggestions)[0].token, 'rename');
  const bad = applyReview(state, request, { requestId: request.requestId, suggestions: [{ conceptId: id, action: 'keep', targetId: null, newName: '多余', split: null, reason: '' }] });
  assert.equal(bad.suggestions[0].accepted, false);
});

test('拆分建议：每组至少 1 条、条目属于该概念且不重叠，原概念至少留 1 条', () => {
  const state = createState();
  const target = note('R15');
  applyResponse(state, target, response('R15', target.expected.map(expected => create('张量', '多维数组', expected.span))));
  const [request] = reviewRequests(state);
  const concept = request.newConcepts[0];
  assert.equal(concept.items.length, 6);
  const ids = concept.items.map(item => item.id);
  const suggest = split => applyReview(state, request, { requestId: request.requestId, suggestions: [{ conceptId: concept.id, action: 'split', targetId: null, newName: null, split, reason: '广播是独立机制' }] }).suggestions[0];
  const ok = suggest([{ name: '广播', sense: '形状不同时自动扩展的机制', itemIds: ids.slice(3) }]);
  assert.equal(ok.accepted, true);
  const [graded] = gradeReview(state, [ok]);
  assert.equal(graded.grade, 'ideal');
  assert.match(describeSplit(graded.splitParts), /^广播（/);
  // 单条也可以成组（例如笔记里暂时只有 1 条的机制），避免模型为凑数把不相干的条目并成一组。
  assert.equal(suggest([{ name: '广播', sense: 's', itemIds: [ids[3]] }]).accepted, true);
  assert.equal(suggest([{ name: '全部', sense: 's', itemIds: ids }]).accepted, false);
  // 与前一组重叠的组被单独丢弃，合格的组保留。
  const partial = suggest([{ name: 'a', sense: 's', itemIds: [ids[0], ids[1]] }, { name: 'b', sense: 's', itemIds: [ids[1], ids[2]] }]);
  assert.equal(partial.accepted, true);
  assert.deepEqual([partial.split.length, partial.splitDropped], [1, 1]);
  assert.equal(suggest([{ name: 'a', sense: 's', itemIds: ['K_PRE_1', ids[0]] }]).accepted, false);
  const failed = suggest([]);
  assert.equal(failed.accepted, false);
  assert.match(failed.raw, /"action":"split"/);
});

test('不该拆分的概念收到拆分建议记为有害', () => {
  const state = stateWithCreated();
  const [request] = reviewRequests(state);
  const grad = request.newConcepts.find(concept => concept.name === 'x.grad');
  const result = applyReview(state, request, { requestId: request.requestId, suggestions: [{ conceptId: grad.id, action: 'split', targetId: null, newName: null, split: [{ name: '清零', sense: 's', itemIds: grad.items.slice(0, 2).map(item => item.id) }], reason: '' }] });
  // x.grad 只有 2 条条目，拆出 2 条会让原概念为空，校验直接拒绝。
  assert.equal(result.suggestions[0].accepted, false);
});

test('拆分最多保留 6 组，多出的组丢弃而不是整条被拒', () => {
  const state = createState({ empty: true });
  const markdown = Array.from({ length: 16 }, (_, i) => `第 ${i + 1} 条：张量操作 ${i + 1}。`).join('\n');
  const big = { id: 'BIG', markdown };
  applyResponse(state, big, { requestId: 'concept-link-r2-BIG', links: markdown.split('\n').map(line => create('张量', '多维数组', line)), remarks: '' });
  const [request] = reviewRequests(state);
  const concept = request.newConcepts[0];
  const ids = concept.items.map(item => item.id);
  const groups = Array.from({ length: 7 }, (_, g) => ({ name: `组${g}`, sense: 's', itemIds: ids.slice(g * 2, g * 2 + 2) }));
  const [entry] = applyReview(state, request, { requestId: request.requestId, suggestions: [{ conceptId: concept.id, action: 'split', targetId: null, newName: null, split: groups, reason: '' }] }).suggestions;
  assert.equal(entry.accepted, true);
  assert.deepEqual([entry.split.length, entry.splitDropped], [6, 1]);
});

test('只重跑整理建议：读取已有 result.json，不重跑挂靠，报告按次列出建议并可导入图谱', async () => {
  const { main: replay } = await import('../experiments/concept-linking-r2/run-review.mjs');
  const { writeFile } = await import('node:fs/promises');
  const dir = await mkdtemp(path.join(os.tmpdir(), 'concept-r2-replay-'));
  const state = createState();
  const target = note('R15');
  applyResponse(state, target, response('R15', target.expected.map(expected => create('张量', '多维数组', expected.span))));
  await writeFile(path.join(dir, 'result.json'), JSON.stringify({ state, results: [], relations: { proposals: [] } }));
  let calls = 0;
  const fetchImpl = async (_url, init) => {
    calls += 1;
    const request = JSON.parse(JSON.parse(init.body).messages[1].content);
    assert.ok(request.newConcepts, '只应发送整理建议请求');
    const concept = request.newConcepts[0];
    const ids = concept.items.map(item => item.id);
    const suggestions = [{ conceptId: concept.id, action: 'split', targetId: null, newName: null, split: [{ name: '广播', sense: '自动扩展的机制', itemIds: ids.slice(3) }], reason: '广播是独立机制' }];
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ requestId: request.requestId, suggestions }) } }] }));
  };
  const out = path.join(dir, 'out');
  await replay(['--result', path.join(dir, 'result.json'), '--out', out, '--repeats', '2'], { env: { DEEPSEEK_API_KEY: 'secret-key' }, fetchImpl, log: () => {} });
  assert.equal(calls, 2);
  const report = await readFile(path.join(out, 'review.md'), 'utf8');
  assert.match(report, /\| 张量 \| 6 \| 拆出 广播（.*） \| 拆出 广播/);
  assert.equal(report.includes('secret-key'), false);
  const saved = JSON.parse(await readFile(path.join(out, 'result.json'), 'utf8'));
  assert.equal(saved.review.suggestions[0].action, 'split');
  assert.deepEqual(saved.relations, { proposals: [] });
});
