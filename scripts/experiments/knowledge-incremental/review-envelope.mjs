// 离线适配：纯共享契约与 Node 实验审查门之间的唯一桥梁。不是浏览器入口。
import { validateReviewEnvelope, REVIEW_KIND, REVIEW_VERSION, proposalKey } from '../../../packages/shared/src/incremental-review.js';
import { reviewBeforeConfirmation } from './review-gate.mjs';
import { fingerprint } from './core.mjs';
import { validateCandidates, riskDependencies } from '../../../packages/shared/src/incremental-review/proposals.js';
import { boundedJson, same, REVIEW_LIMITS, text, list } from '../../../packages/shared/src/incremental-review/validation.js';

/** 接受冻结 runTrial 或重放报告；不改原始输入，不调用模型，不把模拟 state/diff 当资产。 */
export function createReviewEnvelope(result, { reportId } = {}) {
  boundedJson(result);
  if (!result || !Array.isArray(result.rows) || !result.snapshot) throw Error('review-input-shape');
  list(result.rows, REVIEW_LIMITS.rows, '$.rows');
  list(result.snapshot.concepts, REVIEW_LIMITS.concepts, '$.snapshot.concepts');
  list(result.snapshot.items, REVIEW_LIMITS.items, '$.snapshot.items');
  validateCandidates({
    candidateConcepts: result.snapshot.concepts.map(c => ({ id: c.id, name: c.name, sense: c.sense })),
    candidateItems: result.snapshot.items.map(i => ({ id: i.id, conceptId: i.conceptId, title: i.title, kind: i.kind, statement: i.statement }))
  }, '$.snapshot');
  if (![result.snapshot.nextConcept, result.snapshot.nextItem].every(n => Number.isSafeInteger(n) && n > 0)) throw Error('review-snapshot-counters');
  const work = result.rows.length * (result.snapshot.concepts.length ** 2 + result.snapshot.items.length ** 2);
  if (work > REVIEW_LIMITS.simulationWork) throw Error('review-simulation-work-limit');
  // 历史 gate 的 sense 检查会执行 longestCommon 动态规划；在任何 gate 调用前给整份报告预算。
  // 使用整个快照条目文本而非可编辑的 request 子集，保守覆盖内部实际检索候选。
  const textCost = value => value == null ? 0 : typeof value === 'string' ? value.length : REVIEW_LIMITS.bytes;
  const snapshotText = result.snapshot.items.reduce((sum, item) => sum + item.statement.length, 0);
  let similarityWork = 0;
  for (const row of result.rows) {
    const links = row.provider?.parsed?.links;
    if (!Array.isArray(links) || links.length > REVIEW_LIMITS.linksPerRow) continue;
    const responseText = links.reduce((sum, link) => sum + textCost(link?.item?.statement), 0);
    for (const link of links) {
      if (link?.conceptAction !== 'create' || typeof link.newConcept?.sense !== 'string') continue;
      // gate 至多执行原始与过滤后的两次 stageResponse；不依赖 accepted 或同名去重来降低预算。
      similarityWork += 2 * link.newConcept.sense.length
        * (snapshotText + responseText + textCost(link.item?.statement) + textCost(link.item?.quote));
      if (similarityWork > REVIEW_LIMITS.similarityWork) throw Error('review-similarity-work-limit');
    }
  }
  const snapshotRef = fingerprint(result.snapshot);
  const rows = result.rows.map(row => {
    text(row.note?.markdown, REVIEW_LIMITS.note, '$.note.markdown');
    if (!same(row.request?.note, { id: row.note.id, markdown: row.note.markdown })) throw Error('review-request-note');
    for (const [field, columns] of [['candidateConcepts', ['id', 'name', 'sense']], ['candidateItems', ['id', 'conceptId', 'title', 'kind', 'statement']]]) {
      const collection = field === 'candidateConcepts' ? result.snapshot.concepts : result.snapshot.items;
      list(row.request[field], field === 'candidateConcepts' ? REVIEW_LIMITS.concepts : REVIEW_LIMITS.items, `$.${field}`);
      for (const candidate of row.request[field]) {
        const original = collection.find(entry => entry.id === candidate.id);
        if (!original || !same(candidate, Object.fromEntries(columns.map(key => [key, original[key]])))) throw Error('review-candidate-snapshot');
      }
    }
    // 只接受当前已知 wrapper，不猜测或删字段以兼容未知格式。
    if (!Object.hasOwn(row, 'provider')) throw Error('review-provider-wrapper');
    const providerResult = row.provider;
    const review = reviewBeforeConfirmation({ snapshot: result.snapshot, prepared: row, providerResult });
    const rowId = `${row.arm}:${row.note.id}`;
    const proposals = review.proposals.map(p => ({ proposalId: proposalKey(reportId, rowId, p.index), originalIndex: p.index,
      original: p.original, validationAccepted: p.validation.accepted,
      validationErrors: p.validation.errors ?? [], heldByProposalIndices: p.heldByProposalIndices }));
    // 导入侧更保守：被拒同名新概念也可能承载风险，不以可编辑 accepted 标志解除依赖。
    for (const proposal of proposals) proposal.heldByProposalIndices = riskDependencies(proposals, proposal);
    return { rowId, requestId: row.request.requestId, arm: row.arm, note: review.note,
      candidateConcepts: review.candidateConcepts, candidateItems: review.candidateItems,
      providerResult: review.providerResult, responseState: review.responseState, explanation: review.explanation, proposals };
  });
  return validateReviewEnvelope({ kind: REVIEW_KIND, version: REVIEW_VERSION, reportId, snapshotRef,
    approval: 'not-granted', semanticSafety: 'not-verified', rows });
}
