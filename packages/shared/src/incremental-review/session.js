import { REVIEW_LIMITS as L, keys, text, fail, record, clone, boundedJson } from './validation.js';
import { validateReviewEnvelope, DRAFT_KIND, REVIEW_VERSION } from './envelope.js';
import { holdReasons } from './proposals.js';
function validateDecision(row, proposal, decision, path) {
  if (!record(decision)) fail(path, 'decision');
  if (decision.kind === 'defer') { keys(decision, ['kind'], path); return; }
  if (holdReasons(proposal).length) fail(path, 'held-proposal');
  if (decision.kind === 'existing') {
    keys(decision, ['kind', 'conceptId'], path);
    if (!row.candidateConcepts.some(c => c.id === decision.conceptId)) fail(path, 'decision-reference');
  } else if (decision.kind === 'new') {
    keys(decision, ['kind', 'name', 'sense'], path);
    text(decision.name, L.name, `${path}.name`); text(decision.sense, L.sense, `${path}.sense`);
  } else fail(path, 'decision-kind');
}
function checked(envelope, session) {
  const report = validateReviewEnvelope(envelope); boundedJson(session);
  if (!record(session)) fail('$.session', 'object');
  const entries = new Map(report.rows.flatMap(row => row.proposals.map(p => [p.proposalId, { row, proposal: p }])));
  for (const [key, decision] of Object.entries(session)) {
    const entry = entries.get(key); if (!entry) fail('$.session', 'unknown-proposal');
    validateDecision(entry.row, entry.proposal, decision, '$.session.decision');
  }
  return { report, entries };
}
/** 一条只决定一次；改变必须先撤销。始终重新验证，而非信任 UI 按钮状态。 */
export function decideReview(envelope, session, proposalId, decision) {
  boundedJson(decision);
  const { entries } = checked(envelope, session); const entry = entries.get(proposalId);
  if (!entry) fail('$.proposalId', 'unknown-proposal');
  validateDecision(entry.row, entry.proposal, decision, '$.decision');
  if (Object.hasOwn(session, proposalId)) return clone(session);
  return { ...clone(session), [proposalId]: clone(decision) };
}
export function undoReview(envelope, session, proposalId) {
  const { entries } = checked(envelope, session);
  if (!entries.has(proposalId)) fail('$.proposalId', 'unknown-proposal');
  const next = clone(session); delete next[proposalId]; return next;
}
/** 仅草稿：包含完整风险/未决定项，无投影资产、提交授权或生成的正式 ID。 */
export function createReviewDraft(envelope, session) {
  const { report } = checked(envelope, session);
  const decisions = report.rows.flatMap(row => row.proposals.map(proposal => ({
    proposalId: proposal.proposalId, holdReasons: holdReasons(proposal),
    decision: Object.hasOwn(session, proposal.proposalId) ? clone(session[proposal.proposalId]) : { kind: 'undecided' }
  })));
  const draft = { kind: DRAFT_KIND, version: REVIEW_VERSION, approval: 'not-granted', semanticSafety: 'not-verified',
    report, decisions, counts: { total: decisions.length, undecided: decisions.filter(p => p.decision.kind === 'undecided').length,
      deferred: decisions.filter(p => p.decision.kind === 'defer').length,
      selected: decisions.filter(p => ['existing', 'new'].includes(p.decision.kind)).length } };
  boundedJson(draft); return draft;
}
export const serializeReviewDraft = (envelope, session) => JSON.stringify(createReviewDraft(envelope, session));
