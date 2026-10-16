import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, readFile } from 'node:fs/promises';
import { INITIAL_CONCEPTS, SYNTHETIC_NOTES } from '../experiments/concept-linking/scenario.mjs';
import { createState, modelRequest, applyProposal, validateProposal, evaluate } from '../experiments/concept-linking/core.mjs';
import { main, parseArgs } from '../experiments/concept-linking/run.mjs';

const note = SYNTHETIC_NOTES[0];
const statement = note.markdown.split('\n')[1];
const initial = () => ({
  requestId: 'concept-link-N01', conceptAction: 'create', conceptId: null,
  newConcept: { name: '矩阵乘法', sense: '矩阵行与列之间的乘积运算' },
  itemAction: 'new', existingItemId: null,
  item: { title: '矩阵乘法的维度条件', kind: 'fact', statement, quote: statement },
  reason: '已有概念仅有矩阵、矩阵加法和逐元素乘法'
});

test('模型看到 Concept 与 KnowledgeItem ID，但看不到实验预期标签', () => {
  const state = createState();
  const input = modelRequest(state, note);
  assert.deepEqual(input.existingConcepts.map(x => x.id), INITIAL_CONCEPTS.map(x => x.id));
  assert.equal(input.existingKnowledgeItems.length, 0);
  assert.equal(input.note.markdown, note.markdown);
  assert.equal(JSON.stringify(input).includes('C_NEW_MATMUL'), false);
  assert.equal(JSON.stringify(input).includes('"expected"'), false);
});

test('首次新建概念后，第二篇的不同知识可复用概念但保留不同条目', () => {
  const state = createState();
  const first = applyProposal(state, note, initial());
  assert.equal(first.accepted, true);
  const secondNote = SYNTHETIC_NOTES[1];
  const quote = secondNote.markdown.split('\n')[1];
  const second = applyProposal(state, secondNote, {
    requestId: 'concept-link-N02', conceptAction: 'reuse', conceptId: first.conceptId,
    newConcept: null, itemAction: 'new', existingItemId: null,
    item: { title: secondNote.title, kind: 'fact', statement: quote, quote },
    reason: '不交换律属于矩阵乘法性质，而不是新概念'
  });
  assert.equal(second.accepted, true);
  assert.equal(first.conceptId, second.conceptId);
  assert.notEqual(first.knowledgeItemId, second.knowledgeItemId);
  assert.equal(state.items.filter(x => x.conceptId === first.conceptId).length, 2);
  assert.deepEqual(state.items.flatMap(x => x.sources.map(s => s.noteId)), ['N01','N02']);
});

test('重复来源可以附到旧条目，但不允许覆盖原始陈述', () => {
  const state = createState();
  const first = applyProposal(state, note, initial());
  const dupNote = SYNTHETIC_NOTES[6];
  const quote = dupNote.markdown.split('\n')[1];
  const reuser = {
    requestId: 'concept-link-N07', conceptAction: 'reuse', conceptId: first.conceptId, newConcept: null,
    itemAction: 'reuse', existingItemId: first.knowledgeItemId,
    item: { title: dupNote.title, kind: 'fact', statement: quote, quote },
    reason: '同一维度匹配条件的另一种表述'
  };
  const before = state.items[0].statement;
  const result = applyProposal(state, dupNote, reuser);
  assert.equal(result.accepted, true);
  assert.equal(state.items.length, 1);
  assert.equal(state.items[0].statement, before);
  assert.deepEqual(state.items[0].sources.map(x => x.noteId), ['N01', 'N07']);
});

test('错误引用、伪造 ID、跨概念复用和重复概念都不改变模拟数据', () => {
  const state = createState();
  const first = applyProposal(state, note, initial());
  assert.equal(first.accepted, true);
  const snapshot = JSON.stringify(state);
  const cases = [
    { ...initial(), item: { ...initial().item, quote: '根本不存在的句子' } },
    { ...initial(), newConcept: { ...initial().newConcept } },
    { ...initial(), conceptAction: 'reuse', newConcept: null, conceptId: 'FORGED_ID' },
    { ...initial(), conceptAction: 'reuse', newConcept: null, conceptId: 'C_ADD',
      itemAction: 'reuse', existingItemId: first.knowledgeItemId }
  ];
  for (const proposal of cases) {
    const errors = validateProposal(proposal, state, note);
    assert.ok(errors.length > 0);
    assert.equal(applyProposal(state, note, proposal).accepted, false);
    assert.equal(JSON.stringify(state), snapshot);
  }
});

test('严格限制运行参数：不能注入其他笔记路径、额外文件或超过预算', () => {
  assert.equal(parseArgs([]).maxTokens, 1536);
  assert.equal(parseArgs(['--max-tokens', '1024']).maxTokens, 1024);
  for (const args of [['--notes', '/private/note.md'], ['--model', 'other'], ['--max-tokens','9999'],
    ['--max-tokens','abc'], ['--out'], ['--model'], ['--max-tokens']]) {
    assert.throws(() => parseArgs(args));
  }
});

test('合成假模型端到端：七篇跨笔记关联、负对照、旧知识复用都可判定', async () => {
  const requests = [];
  const mockFetch = async (_url, init) => {
    const raw = JSON.parse(init.body);
    assert.equal(raw.model, 'deepseek-chat');
    assert.equal(raw.max_tokens, 1024);
    const payload = JSON.parse(raw.messages[1].content);
    requests.push(payload);
    const n = SYNTHETIC_NOTES.find(x => x.id === payload.note.id);
    const quote = n.markdown.split('\n')[1];
    const first = payload.existingConcepts.find(x => x.name === '矩阵乘法');
    let proposal = {
      requestId: payload.requestId, conceptAction: 'reuse', conceptId: first?.id,
      newConcept: null, itemAction: 'new', existingItemId: null,
      item: { title: n.title, kind: n.expected.kind, statement: quote, quote }, reason: '从笔记选择语义相同的概念'
    };
    if (n.id === 'N01') proposal = initial();
    if (n.id === 'N05') proposal.conceptId = 'C_ADD';
    if (n.id === 'N06') proposal.conceptId = 'C_HADAMARD';
    if (n.id === 'N07') {
      proposal.itemAction = 'reuse';
      proposal.existingItemId = payload.existingKnowledgeItems.find(x => x.title === initial().item.title).id;
    }
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop',
      message: { content: JSON.stringify(proposal) } }], usage: { prompt_tokens: 200, completion_tokens: 100 } }));
  };
  const out = path.join(await mkdtemp(path.join(os.tmpdir(), 'knowra-concept-')), 'out');
  const results = await main(['--out', out, '--max-tokens', '1024'], {
    env: { DEEPSEEK_API_KEY: 'synthetic-key-never-printed' },
    fetchImpl: mockFetch, log: () => {}
  });
  assert.equal(requests.length, 7);
  assert.deepEqual(requests[1].existingConcepts.map(x => x.name).includes('矩阵乘法'), true);
  assert.equal(results.evaluation.conceptPass, 7);
  assert.equal(results.evaluation.itemPass, 7);
  assert.equal(results.evaluation.kindPass, 7);
  assert.equal(results.evaluation.distinctMatmulItems, 4);
  assert.equal(results.state.items.find(x => x.id === 'K_SYN_1').sources.length, 2);
  const report = await readFile(path.join(out, 'report.md'), 'utf8');
  assert.match(report, /Concept 身份决策命中：7\/7/);
  assert.equal(report.includes('synthetic-key-never-printed'), false);
  const rawSaved = await readFile(path.join(out, 'result.json'), 'utf8');
  assert.equal(rawSaved.includes('synthetic-key-never-printed'), false);
  assert.equal(rawSaved.includes('C_NEW_MATMUL'), true); // ground truth is in evaluation only, not model input
});

test('评分没有用标题字符串偷换概念 ID：错误合并应明确扣分', () => {
  const state = createState();
  const first = applyProposal(state, note, initial());
  const secondNote = SYNTHETIC_NOTES[1];
  const quote = secondNote.markdown.split('\n')[1];
  const wrong = applyProposal(state, secondNote, {
    requestId: 'concept-link-N02', conceptAction: 'reuse', conceptId: 'C_MATRIX', newConcept: null,
    itemAction: 'new', existingItemId: null,
    item: { title: '矩阵乘法', kind: 'fact', statement: quote, quote },
    reason: '把矩阵乘法的性质错误归到矩阵'
  });
  assert.equal(wrong.accepted, true); // 结构合法、语义错误
  const evaluation = evaluate([first, wrong], state);
  assert.equal(evaluation.rows[1].conceptOk, false);
  assert.equal(evaluation.rows[0].conceptOk, true);
});
