import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CASES, confirmedSnapshot } from '../experiments/knowledge-incremental/cases.mjs';
import { preparePair, stageResponse, evaluate, diagnosePair, SYSTEM_PROMPT } from '../experiments/knowledge-incremental/core.mjs';
import { BASELINE_PROMPT_20261016, retrieveConcepts } from '../experiments/concept-linking-r2/core.mjs';
import { main, runTrial, MAX_CALLS } from '../experiments/knowledge-incremental/run.mjs';

const sample = id => CASES.find(x => x.id === id);
const prepared = (s, arm = 'oracle') => preparePair(confirmedSnapshot(), s).find(x => x.arm === arm);
const proposal = (s, overrides = {}) => ({
  requestId: `concept-link-r2-${s.id}`, remarks: '', links: [{
    conceptAction: 'reuse', conceptId: s.expected.conceptId ?? 'C_GRADIENT', newConcept: null,
    possibleDuplicateOf: null, itemAction: s.expected.itemId ? 'reuse' : 'new',
    existingItemId: s.expected.itemId ?? null,
    item: { title: '合成候选', kind: 'fact', statement: s.markdown, quote: s.markdown },
    sourceIssue: null, ...overrides
  }]
});
const temp = () => mkdtemp(path.join(os.tmpdir(), 'knowra-incremental-'));

test('原版 prompt 不变；两臂同笔记同快照，预期仅留在评估端', () => {
  assert.equal(SYSTEM_PROMPT, BASELINE_PROMPT_20261016);
  const state = confirmedSnapshot();
  for (const s of CASES) {
    const [a, b] = preparePair(state, s);
    assert.deepEqual(a.request.note, b.request.note);
    assert.equal(a.snapshotHash, b.snapshotHash);
    assert.deepEqual(a.request.candidateConcepts.map(c => c.id), retrieveConcepts(state.concepts, s.markdown).map(c => c.id));
    for (const arm of [a, b]) {
      assert.deepEqual(Object.keys(arm.request).sort(), ['candidateConcepts', 'candidateItems', 'note', 'requestId']);
      assert.equal(JSON.stringify(arm.request).includes('expected'), false);
      assert.ok(arm.request.candidateItems.every(item => arm.request.candidateConcepts.some(c => c.id === item.conceptId)));
    }
    assert.ok(s.oracleIds.every(id => b.request.candidateConcepts.some(c => c.id === id)));
  }
});

test('拒绝带上一轮未确认产物的基线，避免候选跨臂污染', () => {
  const state = confirmedSnapshot(); state.concepts[0].origin = 'created';
  assert.throws(() => preparePair(state, CASES[0]), /snapshot-must-be-confirmed/);
});

test('同概念新增与同条目追加来源分开评分，已确认结构完全不动', () => {
  for (const id of ['I01', 'I02', 'I05', 'I06', 'I07', 'I08']) {
    const s = sample(id), state = confirmedSnapshot(), before = structuredClone(state), p = prepared(s);
    const stage = stageResponse(state, p, proposal(s));
    assert.equal(evaluate(s, p, stage).contractPass, true, id);
    assert.deepEqual(state, before);
    assert.equal(stage.status, 'awaiting-human-review');
    assert.equal(stage.originalSnapshotUnchanged, true);
    assert.equal(stage.protectedFieldsUnchanged, true);
    assert.deepEqual(stage.committedDiff, { concepts: { added: [], removed: [], changed: [] }, items: { added: [], removed: [], changed: [] } });
    if (s.expected.itemId) {
      assert.equal(stage.hypotheticalDiff.items.added.length, 0);
      assert.equal(stage.hypotheticalDiff.items.changed[0].after.sources.length, 2);
    } else assert.equal(stage.hypotheticalDiff.items.added.length, 1);
  }
});

test('重复重放只生成同一预览，不重复修改基线来源', () => {
  const state = confirmedSnapshot(), s = sample('I02'), p = prepared(s);
  assert.deepEqual(stageResponse(state, p, proposal(s)), stageResponse(state, p, proposal(s)));
  assert.equal(state.items.find(i => i.id === 'K_PRE_1').sources.length, 1);
});

test('概念对但条目错不算成功；多输出不会膨胀评分', () => {
  const s = sample('I02'), p = prepared(s);
  const wrong = proposal(s, { itemAction: 'new', existingItemId: null });
  assert.equal(evaluate(s, p, stageResponse(confirmedSnapshot(), p, wrong)).contractPass, false);
  const duplicate = proposal(s); duplicate.links.push(structuredClone(duplicate.links[0]));
  const evaluation = evaluate(s, p, stageResponse(confirmedSnapshot(), p, duplicate));
  assert.equal(evaluation.contractPass, false); assert.equal(evaluation.acceptedLinkCount, 2);
});

test('拒绝、部分接受与完整接受分别报告，保留输出和原因', () => {
  const s = sample('I02'), p = prepared(s);
  const invalid = proposal(s, { conceptId: 'C_MISSING' });
  const rejected = stageResponse(confirmedSnapshot(), p, invalid);
  assert.equal(rejected.validationStatus, 'all-rejected');
  assert.ok(rejected.rejectionReasons.length); assert.deepEqual(rejected.rawResponse, invalid);
  invalid.links.push(proposal(s).links[0]);
  assert.equal(stageResponse(confirmedSnapshot(), p, invalid).validationStatus, 'partial');
  assert.equal(stageResponse(confirmedSnapshot(), p, {}).validationStatus, 'all-rejected');
});

test('x.grad 挂到数学梯度即失败，相关不代表同一概念', () => {
  const s = sample('I03'), p = prepared(s);
  assert.equal(evaluate(s, p, stageResponse(confirmedSnapshot(), p, proposal(s))).contractPass, false);
  const created = proposal(s, { conceptAction: 'create', conceptId: null, newConcept: { name: 'x.grad', sense: 'PyTorch 的张量梯度属性' } });
  assert.equal(evaluate(s, p, stageResponse(confirmedSnapshot(), p, created)).contractPass, true);
});

test('不明确材料保持人工待定，但不声称原协议支持模型主动拒判', () => {
  const s = sample('I04'), p = prepared(s);
  const stage = stageResponse(confirmedSnapshot(), p, proposal(s));
  const evaluation = evaluate(s, p, stage);
  assert.equal(evaluation.contractPass, null); assert.equal(evaluation.routingPass, null);
  assert.match(evaluation.protocolGap, /没有待定动作/);
  assert.equal(stage.status, 'awaiting-human-review');
});

test('冲突不能冒充旧条目的新来源，也不能纠正原文后算成功', () => {
  const s = sample('I09'), p = prepared(s), state = confirmedSnapshot();
  const reuse = proposal(s, { itemAction: 'reuse', existingItemId: 'K_PRE_1' });
  assert.equal(evaluate(s, p, stageResponse(state, p, reuse)).contractPass, false);
  const corrected = proposal(s); corrected.links[0].item.statement = '一般 AB≠BA。';
  assert.equal(evaluate(s, p, stageResponse(state, p, corrected)).contractPass, false);
  assert.equal(evaluate(s, p, stageResponse(state, p, proposal(s))).contractPass, true);
  assert.equal(state.items[0].reviewStatus, 'confirmed');
});

test('归因只有两臂都有输出且Oracle成功才支持本对检索受限结论', () => {
  assert.equal(diagnosePair([]), 'not-run');
  assert.equal(diagnosePair([{ arm: 'retrieval', evaluation: { targetPresent: false, contractPass: false } },
    { arm: 'oracle', evaluation: { targetPresent: true, contractPass: true } }]), 'retrieval-limited-in-this-pair');
});

test('默认纯离线，所有模型结论留空，无API环境读取入口', async () => {
  const out = await temp(); const result = await main(['--out', out]);
  assert.equal(result.mode, 'offline-plan'); assert.equal(result.rows.length, CASES.length * 2);
  assert.ok(result.rows.every(x => x.status === 'not-run' && x.evaluation === null));
  assert.match(await readFile(path.join(out, 'report.md'), 'utf8'), /未调用模型/);
  await assert.rejects(main(['--live']), /only-out-supported/);
});

test('固定总预算内一次一请求；失败计入且不重试；重跑恢复旧结果', async () => {
  const out = await temp(); let calls = 0;
  const invoke = async ({ request }) => { calls++; if (calls === 1) throw Error('SENSITIVE_SENTINEL'); return proposal(sample(request.note.id)); };
  const args = { out, mode: 'fixture-contract', invoke };
  const result = await runTrial(args);
  assert.equal(calls, CASES.length * 2); assert.ok(calls <= MAX_CALLS);
  assert.equal(result.rows.filter(x => x.status === 'invocation-or-response-failed').length, 1);
  assert.equal(JSON.stringify(result).includes('SENSITIVE_SENTINEL'), false);
  await runTrial(args); assert.equal(calls, CASES.length * 2);
  await assert.rejects(runTrial({ out }), /checkpoint-mismatch/);
});

test('调用前中断的预留不再次发送', async () => {
  const out = await temp(); let calls = 0;
  // 先生成同模式manifest，再模拟一个已预留但无回执的调用。
  await runTrial({ out, mode: 'fixture-contract', invoke: async ({ request }) => proposal(sample(request.note.id)) });
  const { unlink } = await import('node:fs/promises');
  await unlink(path.join(out, 'call-01.result.json'));
  const result = await runTrial({ out, mode: 'fixture-contract', invoke: async () => { calls++; } });
  assert.equal(calls, 0);
  assert.equal(result.rows[0].status, 'interrupted-or-in-progress-not-retried');
});

test('改写表达实际漏召回，不靠手动隐藏候选制造差异', () => {
  const pair = preparePair(confirmedSnapshot(), sample('I05'));
  assert.equal(pair[0].request.candidateConcepts.some(c => c.id === 'C_MATMUL'), false);
  assert.equal(pair[1].request.candidateConcepts.some(c => c.id === 'C_MATMUL'), true);
});

test('只引用概念名不得冒充完整知识覆盖；规则判路由不证明正文语义', () => {
  const s = sample('I01'), p = prepared(s), raw = proposal(s);
  raw.links[0].item.quote = '矩阵'; raw.links[0].item.statement = '完全无关的陈述';
  const result = evaluate(s, p, stageResponse(confirmedSnapshot(), p, raw));
  assert.equal(result.routingPass, true); assert.equal(result.evidenceCoveragePass, false);
  assert.equal(result.contractPass, false); assert.equal(result.needsHumanSemanticReview, true);
  assert.equal('semanticPass' in result, false);
});

test('理想目标已在检索中时保留原排名，不引入纯排序差异', () => {
  const pair = preparePair(confirmedSnapshot(), sample('I01'));
  assert.deepEqual(pair[0].request, pair[1].request);
});
