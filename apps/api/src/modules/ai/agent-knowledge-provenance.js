import { calculateContentHash } from '@study-accelerator/content-anchor';
import { hashRecord } from './record-contract.js';
import { knowledgeArtifactProvenanceId, hashKnowledgeArtifactProvenance, validateKnowledgeArtifactProvenance }
  from '../knowledge/domain/knowledge-artifact-provenance-contract.js';

export const AGENT_KNOWLEDGE_PROMPT_VERSION = 'agent-knowledge-propose-v1';
export const AGENT_KNOWLEDGE_RESULT_SCHEMA = 'knowledge-extraction-v1';
export const MCP_KNOWLEDGE_PROMPT_VERSION = 'mcp-knowledge-propose-v1';

/**
 * 把已校验的 Agent 知识提议转为来源摘要记录。只挑选白名单事实：候选 ID、引文位置与原文、
 * 生成它的对话回合与工具调用，以及整份提议的哈希；不包含对话文本、请求原文或凭据。
 * 引文位置是相对笔记版本的绝对偏移，标注修订在 Agent 路径不跟踪，固定为空。
 */
export function createKnowledgeArtifactProvenanceFromProposal({ plan, candidate, origin, provider, modelId, committedAt }) {
  const artifactId = candidate.candidateInput.id;
  const receiptHash = hashRecord({ requestId: plan.requestId, inputHash: plan.inputHash, outputHash: plan.outputHash,
    conversationId: origin.conversationId, turnId: origin.turnId, toolCallId: origin.toolCallId,
    candidateIds: plan.candidates.map(item => item.candidateInput.id) });
  const record = {
    id: knowledgeArtifactProvenanceId(artifactId), schemaVersion: 1, state: 'recorded',
    artifactKind: 'knowledgeItem', artifactId, executionMode: 'agent', provider, modelId,
    promptVersion: AGENT_KNOWLEDGE_PROMPT_VERSION, resultSchemaVersion: AGENT_KNOWLEDGE_RESULT_SCHEMA,
    origin: { conversationId: origin.conversationId, turnId: origin.turnId, toolCallId: origin.toolCallId,
      requestId: plan.requestId, spaceId: plan.spaceId, receiptHash },
    inputHash: plan.inputHash, outputHash: plan.outputHash, committedAt,
    sources: sourcesOf(candidate)
  };
  return validateKnowledgeArtifactProvenance({ ...record, provenanceHash: hashKnowledgeArtifactProvenance(record) });
}

const sourcesOf = candidate => candidate.provenance.map((source, index) => ({
  evidenceId: candidate.candidateInput.evidence[index].id, sourceId: source.sourceId, noteId: source.noteId,
  originNoteVersionId: source.noteVersionId, contentHash: source.contentHash, start: source.start, end: source.end,
  quoteText: source.quoteText, quoteHash: calculateContentHash(source.quoteText), annotationRevisions: [] }));

/**
 * 外部 AI 客户端（本机 MCP）提议的候选的来源摘要。客户端不报告可信的模型信息，所以 provider 固定为 external-client、
 * modelId 固定为 unreported；origin 只有配对 ID 与调用 ID（客户端给的幂等键或由提议内容派生），不含对话内容与客户端自述。
 */
export function createKnowledgeArtifactProvenanceFromMcpProposal({ plan, candidate, origin, committedAt }) {
  const artifactId = candidate.candidateInput.id;
  const receiptHash = hashRecord({ requestId: plan.requestId, inputHash: plan.inputHash, outputHash: plan.outputHash,
    pairingId: origin.pairingId, callId: origin.callId, candidateIds: plan.candidates.map(item => item.candidateInput.id) });
  const record = {
    id: knowledgeArtifactProvenanceId(artifactId), schemaVersion: 1, state: 'recorded',
    artifactKind: 'knowledgeItem', artifactId, executionMode: 'mcp', provider: 'external-client', modelId: 'unreported',
    promptVersion: MCP_KNOWLEDGE_PROMPT_VERSION, resultSchemaVersion: AGENT_KNOWLEDGE_RESULT_SCHEMA,
    origin: { pairingId: origin.pairingId, callId: origin.callId, requestId: plan.requestId, spaceId: plan.spaceId, receiptHash },
    inputHash: plan.inputHash, outputHash: plan.outputHash, committedAt, sources: sourcesOf(candidate)
  };
  return validateKnowledgeArtifactProvenance({ ...record, provenanceHash: hashKnowledgeArtifactProvenance(record) });
}
