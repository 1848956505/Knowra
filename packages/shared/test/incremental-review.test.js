import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { REVIEW_LIMITS, ReviewContractError, parseReviewEnvelope, validateReviewEnvelope, decideReview,
  undoReview, createReviewDraft, serializeReviewDraft, holdReasons, proposalKey } from '../src/incremental-review.js';
const fixture = JSON.parse(await readFile(new URL('./fixtures/incremental-review.json', import.meta.url), 'utf8'));
const fresh = () => structuredClone(fixture);
const key = fixture.rows[0].proposals[0].proposalId;
function sync(envelope) {
  for (const row of envelope.rows) {
    row.providerResult.parsed.links = structuredClone(row.proposals.map(p => p.original));
    row.providerResult.rawText = JSON.stringify(row.providerResult.parsed);
  }
  return envelope;
}
const rejects = value => assert.throws(() => validateReviewEnvelope(value), ReviewContractError);

test('合成样例往返、选择、待定、撤销与完整草稿；不变更输入、不生成资产', () => {
  const before = fresh(); const report = parseReviewEnvelope(JSON.stringify(fixture));
  const session = decideReview(report, {}, key, { kind: 'existing', conceptId: 'C1' });
  assert.deepEqual(decideReview(report, session, key, { kind: 'defer' }), session);
  const draft = JSON.parse(serializeReviewDraft(report, session));
  assert.deepEqual(draft.report, fixture); assert.equal(draft.counts.selected, 1);
  assert.equal(draft.approval, 'not-granted'); assert.equal(draft.semanticSafety, 'not-verified');
  for (const forbidden of ['state', 'hypotheticalDiff', 'committedDiff', 'concepts', 'items']) assert.ok(!Object.hasOwn(draft, forbidden));
  assert.deepEqual(undoReview(report, session, key), {}); assert.deepEqual(fixture, before);
  assert.equal(createReviewDraft(report, {}).counts.undecided, 1);
  assert.equal(createReviewDraft(report, decideReview(report, {}, key, { kind: 'defer' })).counts.deferred, 1);
  rejects(draft);
});
test('风险与 reuse 不可通过，直接伪造 session 也被拒绝，风险导出原样保留', () => {
  for (const risk of ['AI 提示语境有疑问。', null]) {
    const report = fresh(); const p = report.rows[0].proposals[0];
    p.original.sourceIssue = risk; p.original.itemAction = 'reuse'; p.original.existingItemId = 'K1'; sync(report);
    assert.ok(holdReasons(p).includes('item-reuse-not-supported'));
    for (const decision of [{ kind: 'existing', conceptId: 'C1' }, { kind: 'new', name: '合成名', sense: '合成语境' }]) {
      assert.throws(() => decideReview(report, {}, key, decision), /held-proposal/);
      assert.throws(() => createReviewDraft(report, { [key]: decision }), /held-proposal/);
    }
    const session = decideReview(report, {}, key, { kind: 'defer' });
    assert.equal(createReviewDraft(report, session).report.rows[0].proposals[0].original.sourceIssue, risk);
  }
});
test('风险新概念同名依赖不能靠删除 held 标志通过，原始索引为稳定标识', () => {
  const report = fresh(); const row = report.rows[0]; const first = row.proposals[0];
  Object.assign(first.original, { conceptAction: 'create', conceptId: null, newConcept: { name: '合成新概念', sense: '合成新语境' }, sourceIssue: '需要复核' });
  first.heldByProposalIndices = [0];
  const second = structuredClone(first); second.originalIndex = 1; second.proposalId = proposalKey(report.reportId, row.rowId, 1); second.original.sourceIssue = null;
  row.proposals.push(second); sync(report); validateReviewEnvelope(report);
  assert.throws(() => decideReview(report, {}, second.proposalId, { kind: 'existing', conceptId: 'C1' }), /held-proposal/);
  second.heldByProposalIndices = []; rejects(report);
});
test('验证失败项保留畸形原始输出，仅可待定', () => {
  const report = fresh(); const p = report.rows[0].proposals[0];
  p.original = null; p.validationAccepted = false; p.validationErrors = ['字段不符合契约']; sync(report);
  validateReviewEnvelope(report); const draft = createReviewDraft(report, decideReview(report, {}, key, { kind: 'defer' }));
  assert.equal(draft.report.rows[0].proposals[0].original, null);
  assert.throws(() => decideReview(report, {}, key, { kind: 'existing', conceptId: 'C1' }), /held-proposal/);
});
test('严格字段、ID、版本、引用和原文关联；不静默截断或跳过', () => {
  const mutations = [e => e.version = 2, e => e.state = {}, e => e.approval = 'granted',
    e => e.rows.push(structuredClone(e.rows[0])), e => e.rows[0].requestId = 'wrong',
    e => e.rows[0].candidateConcepts[0].id = '__proto__',
    e => e.rows[0].candidateConcepts.push(structuredClone(e.rows[0].candidateConcepts[0])),
    e => e.rows[0].candidateItems[0].conceptId = 'missing', e => e.rows[0].proposals[0].proposalId = 'wrong',
    e => e.rows[0].proposals[0].originalIndex = 4, e => e.rows[0].proposals[0].heldByProposalIndices = [5],
    e => e.rows[0].proposals[0].original.sourceIssue = '新风险但未更改原始响应',
    e => { delete e.rows[0].proposals[0].original.sourceIssue; sync(e); },
    e => { e.rows[0].proposals[0].original.item.quote = '不在原文'; sync(e); },
    e => e.rows[0].note.markdown += e.rows[0].note.markdown,
    e => { e.rows[0].proposals[0].original.conceptId = 'missing'; sync(e); },
    e => { Object.assign(e.rows[0].proposals[0].original, { itemAction: 'reuse', existingItemId: 'missing' }); sync(e); },
    e => { e.rows[0].providerResult.rawText = '{}'; }];
  for (const mutate of mutations) { const e = fresh(); mutate(e); rejects(e); }
});
test('跨报告选择、无效新建、未知决定与跨候选引用均拒绝', () => {
  for (const decision of [{ kind: 'existing', conceptId: 'other' }, { kind: 'new', name: ' ', sense: '语境' },
    { kind: 'new', name: '字'.repeat(REVIEW_LIMITS.name + 1), sense: '语境' }, { kind: 'apply' }, { kind: 'defer', approved: true }]) {
    assert.throws(() => decideReview(fixture, {}, key, decision), ReviewContractError);
  }
  assert.throws(() => createReviewDraft(fixture, { ['other/' + key]: { kind: 'defer' } }), /unknown-proposal/);
  const selected = decideReview(fixture, {}, key, { kind: 'new', name: '新合成概念', sense: '新合成语境' });
  assert.equal(createReviewDraft(fixture, selected).counts.selected, 1);
});
test('完整空提案与损坏/失败状态区分，未决定非原生 abstain', () => {
  const e = fresh(); const row = e.rows[0]; row.proposals = []; row.responseState = 'no_proposals';
  row.providerResult.parsed.links = []; row.providerResult.parsed.remarks = '需补充语境';
  row.providerResult.rawText = JSON.stringify(row.providerResult.parsed);
  row.explanation = { kind: 'model-explanation-unverified', text: '需补充语境', nativeAbstain: false, nextAction: 'inspect-or-clarify' };
  validateReviewEnvelope(e); row.explanation.nativeAbstain = true; rejects(e);
  for (const [status, responseState] of [['invalid-json', 'invalid_response'], ['incomplete-response', 'invalid_response'], ['invocation-failed', 'provider_failure']]) {
    row.providerResult = { kind: 'provider-result', status, rawText: status === 'invocation-failed' ? null : '{' }; row.responseState = responseState; row.explanation = null;
    validateReviewEnvelope(e); row.responseState = 'no_proposals'; rejects(e);
  }
});
test('有界输入拒绝超限、危险键、循环、非 JSON 数值与深层结构；错误不含正文', () => {
  assert.throws(() => parseReviewEnvelope(' ' .repeat(REVIEW_LIMITS.bytes + 1)), /size/);
  assert.throws(() => parseReviewEnvelope('{"__proto__":{}}'), /unsafe-key/);
  assert.throws(() => parseReviewEnvelope('{秘密正文'), error => !error.message.includes('秘密正文'));
  const e = fresh(); e.rows[0].note.markdown = '字'.repeat(REVIEW_LIMITS.note + 1); rejects(e);
  const cycle = {}; cycle.self = cycle; rejects(cycle); rejects({ value: NaN });
  let deep = {}; for (let i = 0; i < REVIEW_LIMITS.depth + 2; i++) deep = { value: deep }; rejects(deep);
  const getter = {}; Object.defineProperty(getter, 'x', { enumerable: true, get() { throw Error('should-not-run'); } });
  assert.throws(() => validateReviewEnvelope(getter), /unsafe-key/);
});


test('伪造 accepted 不能解除风险依赖或升级标题引用/超长协议字段', () => {
  const report = fresh(); const row = report.rows[0]; const first = row.proposals[0];
  Object.assign(first.original, { conceptAction: 'create', conceptId: null, newConcept: { name: '合成风险概念', sense: '合成语境' }, sourceIssue: '有风险' });
  const second = structuredClone(first); second.originalIndex = 1; second.proposalId = proposalKey(report.reportId, row.rowId, 1); second.original.sourceIssue = null;
  first.validationAccepted = false; first.validationErrors = ['被拒绝']; row.proposals.push(second); sync(report);
  rejects(report); first.heldByProposalIndices = [0]; second.heldByProposalIndices = [0]; validateReviewEnvelope(report);
  assert.throws(() => decideReview(report, {}, second.proposalId, { kind: 'new', name: '合成', sense: '语境' }), /held-proposal/);
  for (const mutate of [e => { e.rows[0].note.markdown = '# 只有标题'; e.rows[0].proposals[0].original.item.quote = '# 只有标题'; },
    e => e.rows[0].proposals[0].original.item.statement = '字'.repeat(REVIEW_LIMITS.statement + 1),
    e => e.rows[0].proposals[0].original.sourceIssue = '字'.repeat(REVIEW_LIMITS.sourceIssue + 1)]) {
    const e = fresh(); mutate(e); sync(e); rejects(e);
  }
});
test('完整响应不能通过状态标志隐藏提案，未知provider wrapper/status拒绝', () => {
  const e = fresh(); e.rows[0].responseState = 'invalid_response'; e.rows[0].proposals = []; rejects(e);
  for (const providerResult of [{ kind: 'unexpected', status: 'unknown' }, { kind: 'provider-result', status: 'unknown' }]) {
    const value = fresh(); value.rows[0].providerResult = providerResult; value.rows[0].responseState = 'provider_failure'; value.rows[0].proposals = []; rejects(value);
  }
});
test('对象入口不执行隐藏toJSON/accessor，稀疏数组和单个决定同样前置限额', () => {
  let called = false; const value = fresh();
  Object.defineProperty(value, 'toJSON', { value() { called = true; return {}; } });
  rejects(value); assert.equal(called, false);
  rejects(new Array(1500000)); rejects(new Array(4));
  const decorated = [1]; decorated.extra = 2; rejects(decorated);
  const symbol = { [Symbol('x')]: 1 }; rejects(symbol);
  const decision = { kind: 'defer' }; Object.defineProperty(decision, 'toJSON', { value() { called = true; return { kind: 'defer' }; } });
  assert.throws(() => decideReview(fixture, {}, key, decision), /unsafe-key/); assert.equal(called, false);
});


test('非complete状态不能携带完整parsed隐藏提案，invalid-json不得携带可解析raw', () => {
  for (const status of ['invalid-json', 'incomplete-response', 'invocation-failed']) {
    const e = fresh(); const row = e.rows[0]; row.providerResult.status = status; row.proposals = [];
    row.responseState = status === 'invocation-failed' ? 'provider_failure' : 'invalid_response'; rejects(e);
    row.providerResult.parsed = null;
    if (status === 'incomplete-response') validateReviewEnvelope(e); else rejects(e);
  }
});
