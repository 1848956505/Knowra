import { createAppError } from '../../errors/app-error.js';
import { hashRecord } from './record-contract.js';
import { runAsync, runSync } from './action-plan.js';
import { verifyExtractionSourcePrivacy } from './knowledge-extraction-task-context.js';
import { createKnowledgeArtifactProvenanceFromProposal } from './agent-knowledge-provenance.js';

const refuse = (code, message, status = 409) => { throw createAppError(code, message, status); };
const normalized = value => value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * 受信宿主的 Agent 知识候选保存入口：全部候选、证据与来源摘要在一次核心操作事务内提交，
 * 任一失败整体回滚；相同回合与工具调用重试时复用已提交的回执，不重复创建。
 * 只创建 candidate，不执行确认；调用方须先用 buildKnowledgeProposalPlan 校验提议。
 */
export function createAgentKnowledgeCommitService({ core, knowledge, ownerId, asyncDomain = false, now = () => new Date() }) {
  if (!core || !knowledge || !ownerId) throw new TypeError('Agent 知识保存需要核心操作账本、知识模块和 owner。');
  const repos = knowledge.repositories, run = asyncDomain ? runAsync : runSync;

  function* verifySources(plan) {
    const sources = plan.candidates.flatMap(candidate => candidate.provenance);
    yield* verifyExtractionSourcePrivacy(repos, sources, plan.spaceId);
    const versions = new Map();
    for (const source of sources) {
      if (!versions.has(source.noteVersionId)) versions.set(source.noteVersionId, yield repos.noteVersionRepository.findById(source.noteVersionId));
      const version = versions.get(source.noteVersionId);
      if (!version || version.noteId !== source.noteId || version.contentHash !== source.contentHash
        || version.content.slice(source.start, source.end) !== source.quoteText) {
        refuse('AI_PROPOSAL_SOURCE_STALE', '来源笔记版本不可用或原文已变化，未保存任何候选。');
      }
    }
  }
  // 只比对仍然有效（未删除、未归档）的知识陈述；提示只含候选序号，不向模型泄露已有内容。
  function* rejectDuplicates(plan) {
    const known = new Set((yield repos.knowledgeItemRepository.list({})).map(item => normalized(item.canonicalStatement)));
    const repeated = [];
    plan.candidates.forEach((candidate, index) => {
      const key = normalized(candidate.candidateInput.canonicalStatement);
      if (known.has(key)) repeated.push(index + 1); else known.add(key);
    });
    if (repeated.length) {
      throw Object.assign(createAppError('AI_PROPOSAL_DUPLICATE', '候选与已有知识或本次其他候选重复，未保存任何候选。', 409),
        { hint: `第 ${repeated.join('、')} 个候选的陈述与已有知识或本次其他候选重复，请删除后再提交其余候选。` });
    }
  }
  function* apply({ plan, origin, provider, modelId, committedAt }) {
    const space = yield repos.knowledgeSpaceRepository.findById(plan.spaceId);
    if (!space || space.userId !== ownerId) refuse('AI_SCOPE_FORBIDDEN', '无权在该知识空间保存知识候选。', 403);
    yield* verifySources(plan);
    yield* rejectDuplicates(plan);
    const saved = [];
    for (const candidate of plan.candidates) {
      yield knowledge.knowledgeItemService.createCandidate(candidate.candidateInput);
      const provenance = createKnowledgeArtifactProvenanceFromProposal({ plan, candidate, origin, provider, modelId, committedAt });
      yield repos.knowledgeArtifactProvenanceRepository.create(provenance);
      saved.push({ candidateId: candidate.candidateInput.id, provenanceId: provenance.id });
    }
    return { candidates: saved, saveState: 'localCommitted' };
  }

  return {
    async commit({ plan, origin, identity, provider, modelId }) {
      const candidateIds = plan.candidates.map(candidate => candidate.candidateInput.id);
      const request = { ownerId, datasetId: identity.datasetId, datasetEpoch: identity.datasetEpoch, actorId: ownerId,
        spaceId: plan.spaceId, requestId: plan.requestId,
        operationId: `knowledge-propose-${hashRecord([origin.turnId, origin.toolCallId])}`, kind: 'knowledge_propose',
        planHash: hashRecord({ requestId: plan.requestId, inputHash: plan.inputHash, outputHash: plan.outputHash, candidateIds }) };
      const committedAt = now().toISOString();
      return core.commit(request, () => run(apply({ plan, origin, provider, modelId, committedAt })));
    }
  };
}
