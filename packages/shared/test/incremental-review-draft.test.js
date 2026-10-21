import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { REVIEW_LIMITS as L, ReviewContractError, validateReviewEnvelope, parseReviewEnvelope,
  validateReviewDraft, parseReviewDraft, parseReviewFile, createReviewDraft, serializeReviewDraft,
  decideReview, undoReview, proposalKey } from '../src/incremental-review.js';

const fixture = JSON.parse(await readFile(new URL('./fixtures/incremental-review.json', import.meta.url), 'utf8'));
const fresh = () => structuredClone(fixture);
const draftOf = () => createReviewDraft(fixture, {});
const key = fixture.rows[0].proposals[0].proposalId;
function sync(report) {
  for (const row of report.rows) {
    row.providerResult.parsed.links = structuredClone(row.proposals.map(proposal => proposal.original));
    row.providerResult.rawText = JSON.stringify(row.providerResult.parsed);
  }
  return report;
}
function mixedReport() {
  const report = fresh(); const row = report.rows[0];
  row.proposals = Array.from({ length: 9 }, (_, index) => ({ ...structuredClone(row.proposals[0]),
    proposalId: proposalKey(report.reportId, row.rowId, index), originalIndex: index }));
  row.proposals[4].original.sourceIssue = '仅为合成测试的风险提示';
  Object.assign(row.proposals[5].original, { itemAction: 'reuse', existingItemId: 'K1' });
  Object.assign(row.proposals[6], { validationAccepted: false, validationErrors: ['合成字段不合规'], original: null });
  for (const index of [7, 8]) {
    Object.assign(row.proposals[index].original, { conceptAction: 'create', conceptId: null,
      newConcept: { name: '合成依赖概念', sense: '仅为合成测试的语境' }, sourceIssue: index === 7 ? '需核查合成来源' : null });
    row.proposals[index].heldByProposalIndices = [7];
  }
  return sync(report);
}
function mixedDraft() {
  const report = mixedReport(); const proposals = report.rows[0].proposals;
  const session = Object.fromEntries(proposals.filter((_, index) => index !== 3).map((proposal, index) => [
    proposal.proposalId, index === 0 ? { kind: 'existing', conceptId: 'C1' }
      : index === 1 ? { kind: 'new', name: '合成用户概念', sense: '合成用户确认的语境' } : { kind: 'defer' }
  ]));
  return createReviewDraft(report, session);
}
function rejectEveryEntry(value) {
  assert.throws(() => validateReviewDraft(value), ReviewContractError);
  const input = JSON.stringify(value);
  assert.throws(() => parseReviewDraft(input), ReviewContractError);
  assert.throws(() => parseReviewFile(input), ReviewContractError);
}

test('原报告导入开启空选择，草稿恢复已选/待定，完整保留未决定项并等价再导出', () => {
  const draft = mixedDraft(); const before = structuredClone(draft); const serialized = JSON.stringify(draft);
  assert.deepEqual(validateReviewDraft(draft), draft);
  assert.deepEqual(parseReviewDraft(serialized), draft);
  const restored = parseReviewFile(serialized);
  assert.deepEqual(restored.report, draft.report);
  assert.deepEqual(createReviewDraft(restored.report, restored.session), draft);
  assert.equal(serializeReviewDraft(restored.report, restored.session), serialized);
  assert.equal(Object.keys(restored.session).length, 8);
  assert.equal(Object.hasOwn(restored.session, draft.decisions[3].proposalId), false);
  assert.deepEqual(draft.counts, { total: 9, undecided: 1, deferred: 6, selected: 2 });
  assert.deepEqual(parseReviewFile(JSON.stringify(draft.report)), { report: draft.report, session: {} });
  assert.deepEqual(draft, before);
  assert.throws(() => parseReviewEnvelope(serialized), ReviewContractError);
  assert.throws(() => parseReviewDraft(JSON.stringify(draft.report)), ReviewContractError);
});

test('恢复结果不共享对象，仍可撤销后改选和继续审阅', () => {
  const source = mixedDraft(); const validated = validateReviewDraft(source);
  validated.report.rows[0].note.markdown = '修改返回副本';
  validated.decisions[0].decision.conceptId = '修改返回副本';
  assert.equal(source.report.rows[0].note.markdown, fixture.rows[0].note.markdown);
  assert.equal(source.decisions[0].decision.conceptId, 'C1');
  const { report, session } = parseReviewFile(JSON.stringify(source));
  assert.deepEqual(decideReview(report, session, key, { kind: 'defer' }), session);
  const changed = decideReview(report, undoReview(report, session, key), key, { kind: 'defer' });
  assert.equal(changed[key].kind, 'defer'); assert.equal(session[key].kind, 'existing');
  const continued = decideReview(report, changed, source.decisions[3].proposalId,
    { kind: 'new', name: '继续合成审阅', sense: '明确合成语境' });
  const restoredAgain = parseReviewFile(serializeReviewDraft(report, continued));
  assert.deepEqual(restoredAgain.session, continued);
});

test('顶层、内嵌报告的版本与权限精确匹配，未知字段或缺失字段整体拒绝', () => {
  const mutations = [draft => { draft.kind = 'knowra.incremental-review'; },
    draft => { draft.kind = 'knowra.future-review-draft'; },
    draft => { draft.version = 2; }, draft => { draft.version = '1'; },
    draft => { draft.approval = 'granted'; }, draft => { draft.semanticSafety = 'verified'; },
    draft => { draft.state = {}; }, draft => { delete draft.counts; },
    draft => { draft.report.version = 2; }, draft => { draft.report.approval = 'granted'; },
    draft => { draft.report.semanticSafety = 'verified'; }, draft => { draft.report.session = {}; },
    draft => { draft.report.rows[0].providerResult.rawText = '{}'; },
    draft => { draft.report.rows[0].proposals[0].proposalId = 'unstable-id'; },
    draft => { draft.report.rows[0].proposals[0].original.item.quote = '不在原文中的合成引文'; sync(draft.report); }];
  for (const mutate of mutations) { const draft = draftOf(); mutate(draft); rejectEveryEntry(draft); }
});

test('决定要求完整稳定 ID 集合和导出顺序，未知/缺失/重复/重排均拒绝', () => {
  const mutations = [draft => { draft.decisions.pop(); },
    draft => { draft.decisions.push(structuredClone(draft.decisions[0])); },
    draft => { draft.decisions[1] = structuredClone(draft.decisions[0]); },
    draft => { draft.decisions.reverse(); },
    draft => { draft.decisions[0].proposalId = 'other-report/retrieval:S01#0'; },
    draft => { draft.decisions[3].proposalId = 'unknown-undecided'; },
    draft => { draft.decisions[0].proposalId = null; },
    draft => { draft.decisions[0].proposalId = {}; },
    draft => { draft.decisions[0].proposalId = '__proto__'; },
    draft => { draft.decisions[0].proposalId = 'constructor'; },
    draft => { delete draft.decisions[0].proposalId; },
    draft => { draft.decisions[0].approved = true; },
    draft => { draft.decisions[3].decision = { kind: 'undecided', conceptId: 'C1' }; }];
  for (const mutate of mutations) { const draft = mixedDraft(); mutate(draft); rejectEveryEntry(draft); }
  const omitted = draftOf(); omitted.decisions = [];
  omitted.counts = { total: 0, undecided: 0, deferred: 0, selected: 0 }; rejectEveryEntry(omitted);
});

test('风险原因与计数只从重验结果推导，不能通过篡改文件解除限制', () => {
  const mutations = [draft => { draft.decisions[4].holdReasons = []; },
    draft => { draft.decisions[5].holdReasons = ['reported-risk']; },
    draft => { draft.decisions[7].holdReasons.reverse(); },
    draft => { draft.decisions[8].holdReasons.push('risk-dependency'); },
    draft => { draft.decisions[0].holdReasons = ['unknown-reason']; },
    draft => { draft.decisions[0].holdReasons = null; },
    draft => { draft.counts.total++; }, draft => { draft.counts.undecided++; },
    draft => { draft.counts.deferred--; }, draft => { draft.counts.selected++; },
    draft => { draft.counts.total = String(draft.counts.total); },
    draft => { draft.counts.approved = true; }, draft => { delete draft.counts.selected; }];
  for (const mutate of mutations) { const draft = mixedDraft(); mutate(draft); rejectEveryEntry(draft); }
  for (const index of [4, 5, 6, 7, 8]) {
    for (const decision of [{ kind: 'existing', conceptId: 'C1' }, { kind: 'new', name: '合成', sense: '语境' }]) {
      const draft = mixedDraft(); draft.decisions[index].decision = decision;
      draft.decisions[index].holdReasons = []; draft.counts.deferred--; draft.counts.selected++;
      assert.throws(() => validateReviewDraft(draft), /held-proposal/);
      rejectEveryEntry(draft);
    }
  }
  const changedDependency = mixedDraft(); changedDependency.report.rows[0].proposals[8].heldByProposalIndices = [];
  changedDependency.decisions[8].holdReasons = []; rejectEveryEntry(changedDependency);
});

test('恢复决定复用现有严格校验，候选引用、新建文本及未知决定无法越界', () => {
  for (const decision of [null, [], { kind: 'existing', conceptId: 'missing' },
    { kind: 'existing', conceptId: 'C1', approval: 'granted' },
    { kind: 'new', name: ' ', sense: '语境' }, { kind: 'new', name: '合成', sense: '' },
    { kind: 'new', name: '字'.repeat(L.name + 1), sense: '语境' },
    { kind: 'new', name: '合成', sense: '字'.repeat(L.sense + 1) },
    { kind: 'apply' }, { kind: 'defer', approved: true }, { kind: 'undecided', approved: true }]) {
    const draft = draftOf(); draft.decisions[0].decision = decision; rejectEveryEntry(draft);
  }
  const report = fresh(); const other = structuredClone(report.rows[0]); report.rows.push(other);
  other.note.id = 'S02'; other.rowId = 'retrieval:S02'; other.requestId = 'concept-link-r2-S02';
  other.providerResult.parsed.requestId = other.requestId; other.candidateConcepts[0].id = 'C2';
  other.candidateItems[0].conceptId = 'C2'; other.proposals[0].original.conceptId = 'C2';
  other.proposals[0].proposalId = proposalKey(report.reportId, other.rowId, 0); sync(report);
  const draft = createReviewDraft(report, {}); draft.decisions[0].decision = { kind: 'existing', conceptId: 'C2' };
  draft.counts.undecided--; draft.counts.selected++;
  assert.throws(() => validateReviewDraft(draft), /decision-reference/);
});

test('全未决定、零提案、空报告与不同响应状态均可完整恢复', () => {
  assert.deepEqual(parseReviewFile(JSON.stringify(draftOf())).session, {});
  for (const responseState of ['no_proposals', 'invalid_response', 'provider_failure']) {
    const report = fresh(); const row = report.rows[0]; row.proposals = []; row.responseState = responseState;
    if (responseState === 'no_proposals') {
      row.providerResult.parsed.links = []; row.providerResult.parsed.remarks = '需补充合成语境';
      row.providerResult.rawText = JSON.stringify(row.providerResult.parsed);
      row.explanation = { kind: 'model-explanation-unverified', text: '需补充合成语境', nativeAbstain: false, nextAction: 'inspect-or-clarify' };
    } else row.providerResult = { kind: 'provider-result', status: responseState === 'invalid_response' ? 'invalid-json' : 'invocation-failed',
      rawText: responseState === 'invalid_response' ? '{' : null };
    const draft = createReviewDraft(report, {});
    assert.deepEqual(parseReviewDraft(JSON.stringify(draft)), draft);
    assert.deepEqual(parseReviewFile(JSON.stringify(draft)), { report, session: {} });
    assert.deepEqual(draft.counts, { total: 0, undecided: 0, deferred: 0, selected: 0 });
  }
  const report = fresh(); report.rows = [];
  assert.deepEqual(parseReviewFile(serializeReviewDraft(report, {})), { report, session: {} });
});

test('对象入口先拒绝访问器、toJSON、原型/符号/非 JSON 与共享/循环对象，不执行载荷', () => {
  let called = false;
  for (const locate of [draft => draft, draft => draft.report,
    draft => draft.decisions[0], draft => draft.decisions[0].decision, draft => draft.counts]) {
    const draft = draftOf(); const target = locate(draft);
    Object.defineProperty(target, 'unsafe', { enumerable: true, get() { called = true; throw Error('不应执行'); } });
    assert.throws(() => validateReviewDraft(draft), /unsafe-key/);
    const hidden = draftOf(); Object.defineProperty(locate(hidden), 'toJSON', { value() { called = true; return {}; } });
    assert.throws(() => validateReviewDraft(hidden), /unsafe-key/);
  }
  assert.equal(called, false);
  const mutations = [draft => { Object.setPrototypeOf(draft, { unsafe: true }); },
    draft => { draft.report.rows[0].providerResult.extra = Symbol('非 JSON'); },
    draft => { draft.counts.selected = NaN; }, draft => { draft.counts.selected = Infinity; },
    draft => { draft.counts.selected = 1n; }, draft => { draft.counts.selected = undefined; },
    draft => { draft.counts[Symbol('隐藏字段')] = 0; },
    draft => { draft.decisions = new Array(2); }, draft => { draft.decisions.extra = 1; },
    draft => { draft.report.rows[0].providerResult.extra = new Date(); },
    draft => { draft.report.rows[0].providerResult.extra = draft.report.rows[0].note; },
    draft => { draft.report.rows[0].providerResult.extra = draft; }];
  for (const mutate of mutations) { const draft = draftOf(); mutate(draft); assert.throws(() => validateReviewDraft(draft), ReviewContractError); }
  for (const input of ['{"__proto__":{}}', '{"constructor":0}', '{"prototype":0}', '{合成秘密正文']) {
    for (const parse of [parseReviewFile, parseReviewDraft]) {
      assert.throws(() => parse(input), error => error instanceof ReviewContractError && !error.message.includes('合成秘密正文'));
    }
  }
});

test('所有恢复入口保留 UTF-8 字节、字符串、集合、深度与节点限额，不截断或部分恢复', () => {
  const serialized = JSON.stringify(draftOf()); const bytes = new TextEncoder().encode(serialized).byteLength;
  for (const parse of [parseReviewDraft, parseReviewFile]) {
    parse(' '.repeat(L.bytes - bytes) + serialized);
    assert.throws(() => parse(' '.repeat(L.bytes - bytes + 1) + serialized), /size/);
    assert.throws(() => parse('"' + '字'.repeat(Math.floor(L.bytes / 3)) + '"'), /size/);
    assert.throws(() => parse(null), /size/);
  }
  const mutations = [draft => { draft.report.rows[0].providerResult.extra = 'x'.repeat(L.rawText + 1); },
    draft => { draft.decisions = Array.from({ length: L.proposals + 1 }, () => structuredClone(draft.decisions[0])); },
    draft => { draft.report.rows[0].providerResult.extra = Array.from({ length: 17 }, () => 'x'.repeat(L.rawText)); },
    draft => { draft.report.rows[0].providerResult.extra = new Array(L.nodes + 1).fill(0); },
    draft => { draft.report.rows[0].providerResult.extra = new Array(L.nodes).fill(null); },
    draft => { let deep = null; for (let i = 0; i < L.depth; i++) deep = { value: deep }; draft.report.rows[0].providerResult.extra = deep; }];
  for (const mutate of mutations) { const draft = draftOf(); mutate(draft); rejectEveryEntry(draft); }
  const report = fresh(); let deep = null;
  for (let i = 0; i < L.depth - 4; i++) deep = { value: deep };
  report.rows[0].providerResult.extra = deep;
  validateReviewEnvelope(report);
  assert.throws(() => createReviewDraft(report, {}), /complexity/);
});
