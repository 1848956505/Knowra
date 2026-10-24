import {
  createKnowledgeArtifactProvenanceFromProposal as agent,
  createKnowledgeArtifactProvenanceFromMcpProposal as mcp,
  AGENT_KNOWLEDGE_PROMPT_VERSION,
  AGENT_KNOWLEDGE_RESULT_SCHEMA,
  MCP_KNOWLEDGE_PROMPT_VERSION,
  type ProposalCandidateIdentity,
  type ProvenanceProposalPlan,
  type ProposalProvenanceSource,
  type ProvenanceProposalCandidate,
  type AgentProvenanceOrigin,
  type McpProvenanceOrigin,
  type AgentProvenanceInput,
  type McpProvenanceInput
} from '../src/modules/ai/agent-knowledge-provenance.ts';
import {
  createKnowledgeArtifactProvenanceFromProposal as bridgeAgent,
  createKnowledgeArtifactProvenanceFromMcpProposal as bridgeMcp,
  AGENT_KNOWLEDGE_PROMPT_VERSION as bridgeAgentPrompt,
  AGENT_KNOWLEDGE_RESULT_SCHEMA as bridgeSchema,
  MCP_KNOWLEDGE_PROMPT_VERSION as bridgeMcpPrompt
} from '../src/modules/ai/agent-knowledge-provenance.js';
import type { KnowledgeArtifactProvenance } from '../src/modules/knowledge/domain/knowledge-artifact-provenance-contract.ts';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
export type AgentResult = Assert<Equal<ReturnType<typeof agent>, KnowledgeArtifactProvenance>>;
export type McpResult = Assert<Equal<ReturnType<typeof mcp>, KnowledgeArtifactProvenance>>;
export type AgentArguments = Assert<Equal<Parameters<typeof agent>, [input: AgentProvenanceInput]>>;
export type McpArguments = Assert<Equal<Parameters<typeof mcp>, [input: McpProvenanceInput]>>;
export type BridgeAgent = Assert<Equal<typeof bridgeAgent, typeof agent>>;
export type BridgeMcp = Assert<Equal<typeof bridgeMcp, typeof mcp>>;
export type AgentPrompt = Assert<Equal<typeof AGENT_KNOWLEDGE_PROMPT_VERSION, 'agent-knowledge-propose-v1'>>;
export type ResultSchema = Assert<Equal<typeof AGENT_KNOWLEDGE_RESULT_SCHEMA, 'knowledge-extraction-v1'>>;
export type McpPrompt = Assert<Equal<typeof MCP_KNOWLEDGE_PROMPT_VERSION, 'mcp-knowledge-propose-v1'>>;
export type BridgeAgentPrompt = Assert<Equal<typeof bridgeAgentPrompt, typeof AGENT_KNOWLEDGE_PROMPT_VERSION>>;
export type BridgeSchema = Assert<Equal<typeof bridgeSchema, typeof AGENT_KNOWLEDGE_RESULT_SCHEMA>>;
export type BridgeMcpPrompt = Assert<Equal<typeof bridgeMcpPrompt, typeof MCP_KNOWLEDGE_PROMPT_VERSION>>;
export type IdentityView = Assert<Equal<ProposalCandidateIdentity, { candidateInput: { id?: unknown } }>>;
export type PlanView = Assert<
  Equal<
    ProvenanceProposalPlan,
    {
      requestId?: unknown;
      inputHash?: unknown;
      outputHash?: unknown;
      spaceId?: unknown;
      candidates: readonly ProposalCandidateIdentity[];
    }
  >
>;
export type SourceView = Assert<
  Equal<
    ProposalProvenanceSource,
    {
      sourceId?: unknown;
      noteId?: unknown;
      noteVersionId?: unknown;
      contentHash?: unknown;
      start?: unknown;
      end?: unknown;
      quoteText: string;
    }
  >
>;
export type CandidateView = Assert<
  Equal<
    ProvenanceProposalCandidate,
    {
      candidateInput: { id?: unknown; evidence: readonly { id?: unknown }[] };
      provenance: readonly ProposalProvenanceSource[];
    }
  >
>;
export type AgentOriginView = Assert<
  Equal<
    AgentProvenanceOrigin,
    {
      conversationId?: unknown;
      turnId?: unknown;
      toolCallId?: unknown;
    }
  >
>;
export type McpOriginView = Assert<Equal<McpProvenanceOrigin, { pairingId?: unknown; callId?: unknown }>>;
export type AgentInputView = Assert<
  Equal<
    AgentProvenanceInput,
    {
      plan: ProvenanceProposalPlan;
      candidate: ProvenanceProposalCandidate;
      origin: AgentProvenanceOrigin;
      provider: unknown;
      modelId: unknown;
      committedAt: unknown;
    }
  >
>;
export type McpInputView = Assert<
  Equal<
    McpProvenanceInput,
    {
      plan: ProvenanceProposalPlan;
      candidate: ProvenanceProposalCandidate;
      origin: McpProvenanceOrigin;
      committedAt: unknown;
    }
  >
>;
export type UnknownRequest = Assert<Equal<ProvenanceProposalPlan['requestId'], unknown>>;
export type UnknownInputHash = Assert<Equal<ProvenanceProposalPlan['inputHash'], unknown>>;
export type UnknownOutputHash = Assert<Equal<ProvenanceProposalPlan['outputHash'], unknown>>;
export type UnknownSpace = Assert<Equal<ProvenanceProposalPlan['spaceId'], unknown>>;
export type UnknownCandidateId = Assert<Equal<ProvenanceProposalCandidate['candidateInput']['id'], unknown>>;
export type UnknownEvidenceId = Assert<
  Equal<ProvenanceProposalCandidate['candidateInput']['evidence'][number]['id'], unknown>
>;
export type UnknownSourceId = Assert<Equal<ProposalProvenanceSource['sourceId'], unknown>>;
export type UnknownNoteId = Assert<Equal<ProposalProvenanceSource['noteId'], unknown>>;
export type UnknownVersionId = Assert<Equal<ProposalProvenanceSource['noteVersionId'], unknown>>;
export type UnknownContentHash = Assert<Equal<ProposalProvenanceSource['contentHash'], unknown>>;
export type UnknownStart = Assert<Equal<ProposalProvenanceSource['start'], unknown>>;
export type UnknownEnd = Assert<Equal<ProposalProvenanceSource['end'], unknown>>;
export type QuoteText = Assert<Equal<ProposalProvenanceSource['quoteText'], string>>;
export type UnknownProvider = Assert<Equal<AgentProvenanceInput['provider'], unknown>>;
export type UnknownModel = Assert<Equal<AgentProvenanceInput['modelId'], unknown>>;
export type UnknownAgentTime = Assert<Equal<AgentProvenanceInput['committedAt'], unknown>>;
export type UnknownMcpTime = Assert<Equal<McpProvenanceInput['committedAt'], unknown>>;

declare const unknownValue: unknown;
declare const uncheckedInput: AgentProvenanceInput;
const plan: ProvenanceProposalPlan = { candidates: [] };
const candidate: ProvenanceProposalCandidate = { candidateInput: { evidence: [] }, provenance: [] };
const input: AgentProvenanceInput = {
  plan,
  candidate,
  origin: {},
  provider: undefined,
  modelId: null,
  committedAt: Symbol('unverified')
};
const mcpInput: McpProvenanceInput = { plan, candidate, origin: {}, committedAt: undefined };
const records: KnowledgeArtifactProvenance[] = [agent(input), mcp(mcpInput), bridgeAgent(input), bridgeMcp(mcpInput)];

// 这是读取视图，不承诺无洞数组、合法 ID、有效 timestamp 或调用一定成功。
const unknownPlan: ProvenanceProposalPlan = {
  requestId: undefined,
  inputHash: null,
  outputHash: unknownValue,
  spaceId: Symbol('space'),
  candidates: [{ candidateInput: {} }, { candidateInput: { id: undefined } }, { candidateInput: { id: 1n } }]
};
const unknownSource: ProposalProvenanceSource = {
  sourceId: undefined,
  noteId: null,
  noteVersionId: 1n,
  contentHash: Symbol('hash'),
  start: false,
  end: new Date(NaN),
  quoteText: '\ud800'
};
const unknownCandidate: ProvenanceProposalCandidate = {
  candidateInput: { id: unknownValue, evidence: [{}, { id: undefined }, { id: Symbol('id') }] },
  provenance: [unknownSource]
};
const agentOrigin: AgentProvenanceOrigin = { conversationId: undefined, turnId: null, toolCallId: unknownValue };
const mcpOrigin: McpProvenanceOrigin = { pairingId: undefined, callId: unknownValue };
agent({
  plan: unknownPlan,
  candidate: unknownCandidate,
  origin: agentOrigin,
  provider: unknownValue,
  modelId: unknownValue,
  committedAt: unknownValue
});
mcp({ plan: unknownPlan, candidate: unknownCandidate, origin: mcpOrigin, committedAt: null });
bridgeAgent({ ...input, plan: unknownPlan, candidate: unknownCandidate, origin: agentOrigin });
bridgeMcp({ ...mcpInput, plan: unknownPlan, candidate: unknownCandidate, origin: mcpOrigin });

const readonlyPlan = Object.freeze({
  candidates: Object.freeze([Object.freeze({ candidateInput: Object.freeze({ id: null }) })])
});
const readonlyCandidate = Object.freeze({
  candidateInput: Object.freeze({ evidence: Object.freeze([Object.freeze({})]) }),
  provenance: Object.freeze([Object.freeze({ quoteText: 'q' })])
});
agent({ ...input, plan: readonlyPlan, candidate: readonlyCandidate });
bridgeMcp({ ...mcpInput, plan: readonlyPlan, candidate: readonlyCandidate });
const accessorSource = {
  get quoteText() {
    return Math.random() ? 'a' : 'b';
  },
  get start(): unknown {
    return {};
  }
};
agent({ ...input, candidate: { candidateInput: { evidence: [{}] }, provenance: [accessorSource] } });
const widerOrigin = {
  conversationId: 'c',
  turnId: 't',
  toolCallId: 'k',
  pairingId: 'p',
  callId: 'c',
  ignored: Symbol('private')
};
agent({ ...input, origin: widerOrigin });
mcp({ ...mcpInput, origin: widerOrigin });

// readonly 容器不保证 getter 稳定、自有 map 执行 callback 或 evidence[index] 存在。
class EmptyMap<T> extends Array<T> {
  override map<U>(_callback: (value: T, index: number, array: T[]) => U): U[] {
    return [];
  }
}
agent({ ...input, plan: { candidates: new EmptyMap<ProposalCandidateIdentity>() } });
const sparseEvidence: { id?: unknown }[] = [];
sparseEvidence.length = 2;
agent({ ...input, candidate: { candidateInput: { evidence: sparseEvidence }, provenance: [{ quoteText: 'q' }] } });

// 原验证器返回完整可变联合；两个入口都不提前承诺特定分支。
for (const record of records) {
  record.id = 'new-id';
  record.provenanceHash = 'new-hash';
  if (record.state === 'recorded') {
    record.sources.push({
      evidenceId: 'e',
      sourceId: 's',
      noteId: 'n',
      originNoteVersionId: 'v',
      contentHash: 'h',
      start: 0,
      end: 1,
      quoteText: 'q',
      quoteHash: 'h',
      annotationRevisions: []
    });
    record.sources[0].annotationRevisions.push({ annotationId: 'a', revision: 1 });
  }
}
void [records, uncheckedInput];
