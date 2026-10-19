// 确认前审查门：只生成隔离预览，不确认、不写库、不证明模型语义正确。
import { fingerprint, stageResponse, stateDiff } from './core.mjs';

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const emptyEnvelope = (response, prepared) => record(response)
  && Object.keys(response).sort().join(',') === 'links,remarks,requestId'
  && response.requestId === prepared.request.requestId
  && response.requestId === `concept-link-r2-${prepared.note.id}`
  && Array.isArray(response.links) && response.links.length === 0
  && typeof response.remarks === 'string';

export function reviewBeforeConfirmation({ snapshot, prepared, providerResult }) {
  if (prepared.snapshotHash !== fingerprint(snapshot)) throw Error('review-snapshot-mismatch');
  const provider = structuredClone(providerResult);
  const result = {
    status: 'needs_review', approval: 'not-granted', semanticSafety: 'not-verified',
    responseState: 'provider_failure', providerResult: provider,
    note: structuredClone(prepared.note),
    candidateConcepts: structuredClone(prepared.request.candidateConcepts),
    candidateItems: structuredClone(prepared.request.candidateItems),
    proposals: [], explanation: null, baselineValidation: null,
    reviewablePreview: { status: 'hypothetical-only', diff: stateDiff(snapshot, snapshot) },
    committedDiff: stateDiff(snapshot, snapshot)
  };
  if (!record(provider) || provider.kind !== 'provider-result') return result;
  if (provider.status !== 'complete') {
    result.responseState = ['invalid-json', 'incomplete-response'].includes(provider.status)
      ? 'invalid_response' : 'provider_failure';
    return result;
  }
  const response = provider.parsed;
  if (emptyEnvelope(response, prepared)) {
    result.responseState = 'no_proposals';
    result.explanation = { kind: 'model-explanation-unverified', text: response.remarks,
      nativeAbstain: false, nextAction: 'inspect-or-clarify' };
    return result;
  }
  const staged = stageResponse(snapshot, prepared, response);
  result.baselineValidation = structuredClone(staged.validation);
  if (!staged.validation.accepted) {
    result.responseState = 'invalid_response';
    return result;
  }
  result.responseState = 'proposals';
  const eligible = [];
  const eligibleIndices = [];
  const riskConcepts = new Map();
  for (const link of staged.validation.links) {
    if (link.accepted && response.links[link.index]?.sourceIssue != null
      && !snapshot.concepts.some(concept => concept.id === link.conceptId)) {
      riskConcepts.set(link.conceptId, [...(riskConcepts.get(link.conceptId) ?? []), link.index]);
    }
  }
  for (const validation of staged.validation.links) {
    const original = structuredClone(response.links[validation.index]);
    const reportedRisk = original?.sourceIssue !== null && original?.sourceIssue !== undefined;
    const heldByProposalIndices = riskConcepts.get(validation.conceptId) ?? [];
    const held = reportedRisk || heldByProposalIndices.length > 0;
    const disposition = !validation.accepted ? 'validation_rejected'
      : held ? 'needs_review' : 'unflagged_requires_review';
    result.proposals.push({ index: validation.index, disposition, original, heldByProposalIndices, previewIdentity: null,
      validation: structuredClone(validation),
      risk: reportedRisk ? { kind: 'ai_reported_risk', text: original?.sourceIssue, verified: false } : null,
      includedInReviewablePreview: validation.accepted && !held });
    if (validation.accepted && !held) { eligible.push(original); eligibleIndices.push(validation.index); }
  }
  // 原始输出及风险原样保留在 proposals；有风险的来源不进入可审阅预览。
  // 即便无风险标签，也没有自动批准；此处仍然只有假设 diff。
  if (eligible.length) {
    const preview = stageResponse(snapshot, prepared, { ...response, links: eligible });
    result.reviewablePreview.diff = preview.hypotheticalDiff;
    result.reviewablePreview.validation = preview.validation;
    // 过滤后临时ID会重排；明确映射，禁止消费者用原validation的ID关联预览。
    for (const link of preview.validation.links) {
      const proposal = result.proposals.find(entry => entry.index === eligibleIndices[link.index]);
      proposal.includedInReviewablePreview = link.accepted;
      if (link.accepted) proposal.previewIdentity = { conceptId: link.conceptId, itemId: link.itemId };
      else { proposal.disposition = 'validation_rejected'; proposal.previewRejection = link.errors; }
    }
  }
  return result;
}
