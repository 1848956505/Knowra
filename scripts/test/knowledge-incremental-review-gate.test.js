import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { reviewBeforeConfirmation } from '../experiments/knowledge-incremental/review-gate.mjs';
import { evaluate, stageResponse } from '../experiments/knowledge-incremental/core.mjs';
const fixture = JSON.parse(await readFile(new URL('./fixtures/knowledge-incremental-session-20261019.json', import.meta.url), 'utf8'));
const input = row => ({ snapshot: fixture.snapshot, prepared: row, providerResult: row.provider });
const emptyDiff = diff => ['concepts', 'items'].every(key => ['added', 'removed', 'changed'].every(action => diff[key][action].length === 0));

test('冻结18份真实合成输出离线重放：旧评分不变，不批准、不写基线', () => {
  const before = structuredClone(fixture);
  assert.equal(fixture.rows.length, 18);
  for (const row of fixture.rows) {
    const old = evaluate({ markdown: row.note.markdown, expected: row.expected }, row, stageResponse(fixture.snapshot, row, row.provider.parsed));
    assert.deepEqual(old, row.evaluation);
    const gate = reviewBeforeConfirmation(input(row));
    assert.equal(gate.status, 'needs_review');
    assert.equal(gate.approval, 'not-granted');
    assert.equal(gate.semanticSafety, 'not-verified');
    assert.ok(emptyDiff(gate.committedDiff));
    assert.deepEqual(gate.providerResult, row.provider);
  }
  assert.deepEqual(fixture, before);
});

test('I09两臂AI风险警告保留，矛盾reuse不进入旧来源预览', () => {
  for (const row of fixture.rows.filter(x => x.caseId === 'I09')) {
    const gate = reviewBeforeConfirmation(input(row));
    const proposal = gate.proposals[0];
    assert.equal(proposal.disposition, 'needs_review');
    assert.equal(proposal.original.itemAction, 'reuse');
    assert.equal(proposal.original.existingItemId, 'K_PRE_1');
    assert.equal(proposal.original.item.quote, row.note.markdown);
    assert.equal(proposal.risk.text, row.provider.parsed.links[0].sourceIssue);
    assert.equal(proposal.risk.kind, 'ai_reported_risk');
    assert.equal(proposal.risk.verified, false);
    assert.equal(proposal.includedInReviewablePreview, false);
    assert.ok(emptyDiff(gate.reviewablePreview.diff));
    assert.equal(row.evaluation.contractPass, false);
  }
});

test('I04空links承接说明，不伪装native abstain，也不更改旧协议失败', () => {
  for (const row of fixture.rows.filter(x => x.caseId === 'I04')) {
    const gate = reviewBeforeConfirmation(input(row));
    assert.equal(gate.responseState, 'no_proposals');
    assert.equal(gate.explanation.text, row.provider.parsed.remarks);
    assert.equal(gate.explanation.nativeAbstain, false);
    assert.equal(row.evaluation.contractPass, null);
    assert.equal(stageResponse(fixture.snapshot, row, row.provider.parsed).validation.accepted, false);
  }
});

test('I03仍然保留两条和原评分失败，不为了变绿重新定gold', () => {
  for (const row of fixture.rows.filter(x => x.caseId === 'I03')) {
    const gate = reviewBeforeConfirmation(input(row));
    assert.equal(gate.proposals.length, 2);
    assert.equal(row.evaluation.contractPass, false);
    assert.ok(gate.proposals.every(x => x.disposition === 'unflagged_requires_review'));
  }
});

test('无风险标记不保证语义安全；混合提案只隔离风险项且保持原索引', () => {
  const row = structuredClone(fixture.rows.find(x => x.caseId === 'I02'));
  const clean = structuredClone(row.provider.parsed.links[0]);
  row.provider.parsed.links.unshift({ ...structuredClone(clean), sourceIssue: 'AI认为存在歧义，尚未核实。' });
  const gate = reviewBeforeConfirmation(input(row));
  assert.deepEqual(gate.proposals.map(x => [x.index, x.includedInReviewablePreview]), [[0, false], [1, true]]);
  const changed = gate.reviewablePreview.diff.items.changed;
  assert.equal(changed.length, 1);
  assert.equal(changed[0].after.sources.length, changed[0].before.sources.length + 1);
  assert.equal(gate.approval, 'not-granted');
});

test('完整空提案与损坏JSON、截断、服务失败、错requestId分开', () => {
  const row = fixture.rows[0];
  for (const status of ['invalid-json', 'incomplete-response']) {
    const gate = reviewBeforeConfirmation({ ...input(row), providerResult: { kind: 'provider-result', status, rawText: '{' } });
    assert.equal(gate.responseState, 'invalid_response');
    assert.equal(gate.providerResult.rawText, '{');
  }
  assert.equal(reviewBeforeConfirmation({ ...input(row), providerResult: { kind: 'provider-result', status: 'invocation-failed' } }).responseState, 'provider_failure');
  const wrong = { kind: 'provider-result', status: 'complete', parsed: { requestId: 'wrong', links: [], remarks: '不明确' } };
  assert.equal(reviewBeforeConfirmation({ ...input(row), providerResult: wrong }).responseState, 'invalid_response');
  const emptyRow = structuredClone(fixture.rows.find(x => x.caseId === 'I04'));
  emptyRow.note.id = 'other-note';
  assert.equal(reviewBeforeConfirmation(input(emptyRow)).responseState, 'invalid_response');
});

test('非法提案保留拒绝原因，不让畸形数据突破审查门', () => {
  const row = structuredClone(fixture.rows[0]);
  row.provider.parsed.links.unshift(null);
  const gate = reviewBeforeConfirmation(input(row));
  assert.equal(gate.proposals[0].disposition, 'validation_rejected');
  assert.equal(gate.proposals[0].includedInReviewablePreview, false);
  assert.ok(gate.proposals[0].validation.errors.length);
  const badSnapshot = structuredClone(fixture.snapshot); badSnapshot.items[0].statement = 'changed';
  assert.throws(() => reviewBeforeConfirmation({ ...input(row), snapshot: badSnapshot }), /snapshot-mismatch/);
});

test('有风险新概念的同篇依赖项一起隔离并保留依赖索引', () => {
  const row = structuredClone(fixture.rows.find(x => x.caseId === 'I03'));
  row.provider.parsed.links[0].sourceIssue = 'AI报告此概念语境不明确，尚未核实。';
  const gate = reviewBeforeConfirmation(input(row));
  assert.ok(gate.proposals.every(x => x.disposition === 'needs_review' && !x.includedInReviewablePreview));
  assert.deepEqual(gate.proposals[1].heldByProposalIndices, [0]);
  assert.equal(gate.proposals[1].risk, null);
  assert.ok(emptyDiff(gate.reviewablePreview.diff));
});

test('过滤后临时ID重排显式映射到原提案索引，不误连其它概念', () => {
  const row = structuredClone(fixture.rows.find(x => x.caseId === 'I03'));
  const independent = structuredClone(row.provider.parsed.links[0]);
  independent.newConcept.name = '另一独立概念';
  row.provider.parsed.links[0].sourceIssue = 'AI报告风险';
  row.provider.parsed.links.push(independent);
  const gate = reviewBeforeConfirmation(input(row));
  assert.equal(gate.proposals[0].previewIdentity, null);
  assert.equal(gate.proposals[1].previewIdentity, null);
  assert.equal(gate.proposals[2].validation.conceptId, 'C_NEW_2');
  assert.deepEqual(gate.proposals[2].previewIdentity, { conceptId: 'C_NEW_1', itemId: 'K_NEW_1' });
  assert.equal(gate.reviewablePreview.diff.concepts.added[0].id, gate.proposals[2].previewIdentity.conceptId);
});
