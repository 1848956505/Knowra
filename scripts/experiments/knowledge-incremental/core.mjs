// 固定快照、成对候选、独立模拟及审核隔离；不连接任何正式知识存储。
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { applyResponse, modelRequest, retrieveConcepts, SYSTEM_PROMPT } from '../concept-linking-r2/core.mjs';

export { SYSTEM_PROMPT };
export const ARMS = ['retrieval', 'oracle'];
export const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function preparePair(snapshot, sample) {
  const retrieved = retrieveConcepts(snapshot.concepts, sample.markdown);
  // 目标已召回时保持原排名不变；只替换末尾非必要候选补齐缺失项。
  const oracleIds = retrieved.map(x => x.id);
  const missing = sample.oracleIds.filter(id => !oracleIds.includes(id));
  const limit = Math.max(retrieved.length, sample.oracleIds.length);
  while (oracleIds.length + missing.length > limit) {
    const index = oracleIds.findLastIndex(id => !sample.oracleIds.includes(id));
    oracleIds.splice(index, 1);
  }
  oracleIds.push(...missing);
  return ARMS.map(arm => {
    const note = { id: sample.id, markdown: sample.markdown };
    if (arm === 'oracle') note.candidates = oracleIds;
    const state = structuredClone(snapshot);
    // 冻结目录不能含 origin=created，否则 R2 预设候选会自动追加上轮产物。
    if (state.concepts.some(c => c.origin === 'created')) throw Error('snapshot-must-be-confirmed-catalog');
    return { arm, note, request: modelRequest(state, note), snapshotHash: fingerprint(snapshot) };
  });
}

export function stateDiff(before, after) {
  const compare = key => ({
    added: after[key].filter(x => !before[key].some(y => y.id === x.id)),
    removed: before[key].filter(x => !after[key].some(y => y.id === x.id)),
    changed: before[key].flatMap(old => {
      const current = after[key].find(x => x.id === old.id);
      return current && !isDeepStrictEqual(old, current) ? [{ id: old.id, before: old, after: current }] : [];
    })
  });
  return { concepts: compare('concepts'), items: compare('items') };
}

export function stageResponse(snapshot, prepared, rawResponse) {
  const before = structuredClone(snapshot);
  const simulated = structuredClone(snapshot);
  const validation = applyResponse(simulated, prepared.note, rawResponse);
  const accepted = validation.links.filter(link => link.accepted);
  const validationStatus = accepted.length === 0 ? 'all-rejected'
    : accepted.length === validation.links.length ? 'full' : 'partial';
  const protectedFieldsUnchanged = before.concepts.every(old => isDeepStrictEqual(old, simulated.concepts.find(c => c.id === old.id)))
    && before.items.every(old => {
      const current = simulated.items.find(i => i.id === old.id);
      return current && isDeepStrictEqual({ ...old, sources: [] }, { ...current, sources: [] });
    });
  return {
    status: 'awaiting-human-review', validationStatus, validation,
    rawResponse, candidateConcepts: prepared.request.candidateConcepts,
    candidateItems: prepared.request.candidateItems,
    rejectionReasons: validation.error ? [validation.error] : validation.links.flatMap(x => x.errors ?? []),
    hypotheticalDiff: stateDiff(before, simulated),
    committedDiff: stateDiff(before, snapshot),
    originalSnapshotUnchanged: isDeepStrictEqual(before, snapshot), protectedFieldsUnchanged
  };
}

export function evaluate(sample, prepared, staged) {
  const expected = sample.expected;
  const links = staged.validation.links.filter(x => x.accepted);
  const one = links.length === 1 ? links[0] : null;
  const targetPresent = expected.conceptId
    ? prepared.request.candidateConcepts.some(c => c.id === expected.conceptId) : null;
  let routingPass = null;
  if (expected.outcome === 'same-concept-new-item') {
    routingPass = !!one && one.conceptAction === 'reuse' && one.conceptId === expected.conceptId && one.itemAction === 'new';
  } else if (expected.outcome === 'same-item-new-source') {
    const changed = staged.hypotheticalDiff.items.changed;
    routingPass = !!one && one.conceptId === expected.conceptId && one.itemAction === 'reuse'
      && one.itemId === expected.itemId && changed.length === 1
      && changed[0].after.sources.length === changed[0].before.sources.length + 1;
  } else if (expected.outcome === 'conflicting-claim') {
    routingPass = !!one && one.conceptId === expected.conceptId && one.itemAction === 'new'
      && one.statement.includes('AB=BA') && !one.statement.includes('AB≠BA');
  } else if (expected.outcome === 'related-but-different') {
    routingPass = !!one && one.itemAction === 'new' && (one.conceptAction === 'create'
      || expected.acceptableExistingIds.includes(one.conceptId));
  }
  return {
    expected: structuredClone(expected), targetPresent, routingPass,
    protocolGap: expected.outcome === 'insufficient-evidence-pending'
      ? '原版协议没有待定动作，不能据此验证模型主动拒判；应用层仅隔离所有输出等待人工决定。' : null,
    sourceIssueSignals: links.filter(x => x.sourceIssue).map(x => x.sourceIssue),
    evidenceCoveragePass: !!one && one.quote === sample.markdown,
    needsHumanSemanticReview: true,
    contractPass: routingPass === null ? null : routingPass && !!one && one.quote === sample.markdown && staged.validationStatus === 'full'
      && staged.originalSnapshotUnchanged && staged.protectedFieldsUnchanged,
    // 单样本只有一条预期，多条模型输出不会重复累计成多个成功。
    acceptedLinkCount: links.length
  };
}

export function diagnosePair(rows) {
  const retrieval = rows.find(x => x.arm === 'retrieval');
  const oracle = rows.find(x => x.arm === 'oracle');
  if (!retrieval?.evaluation || !oracle?.evaluation) return 'not-run';
  if (oracle.evaluation.protocolGap) return 'protocol-gap';
  if (!retrieval.evaluation.targetPresent && oracle.evaluation.targetPresent && oracle.evaluation.contractPass
    && !retrieval.evaluation.contractPass) return 'retrieval-limited-in-this-pair';
  if (oracle.evaluation.targetPresent && !oracle.evaluation.contractPass) return 'identity-or-protocol-needs-review';
  return 'inspect-both-outputs';
}
