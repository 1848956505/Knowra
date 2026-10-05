/** 人工审核的知识资产；不承载学习掌握度。 */
export type KnowledgeReviewStatus = 'candidate' | 'confirmed' | 'needsRevision' | 'archived';
export type KnowledgeType = 'concept' | 'fact' | 'principle' | 'process' | 'algorithm' | 'formula' | 'comparison' | 'application';
export type KnowledgeSourceMode = 'manual' | 'annotation' | 'selection' | 'ai';
export type KnowledgeEvidenceStatus = 'valid' | 'stale' | 'invalid' | 'insufficient';

export interface KnowledgeItem {
  [key: string]: unknown;
  id: string;
  title: string;
  canonicalStatement: string;
  userExplanation: string;
  knowledgeType: KnowledgeType;
  importance: number | null;
  reviewStatus: KnowledgeReviewStatus;
  sourceMode: KnowledgeSourceMode;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  evidenceStatus?: KnowledgeEvidenceStatus;
  sourceHealth?: string;
  evidenceCount?: number;
  objectiveCount?: number;
  confirmedObjectiveCount?: number;
  questionCount?: number;
  noteIds?: string[];
}

export interface KnowledgeEvidence {
  id: string;
  knowledgeItemId: string;
  sourceType: 'noteVersion' | 'annotation' | 'manual';
  sourceId: string | null;
  noteId: string | null;
  noteVersionId: string | null;
  annotationId: string | null;
  quoteText: string;
  headingPath: string[];
  relationType: 'supports';
  status: KnowledgeEvidenceStatus;
  applicabilityStatus?: 'active' | 'withdrawn' | 'needsReview';
  sourceAnnotationRemoved?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateKnowledgeEvidenceInput {
  sourceType: KnowledgeEvidence['sourceType'];
  noteId?: string;
  noteVersionId?: string;
  annotationId?: string;
  expectedAnnotationRevision?: number;
  quoteText?: string;
  headingPath?: string[];
}

export interface RetireKnowledgeEvidenceInput {
  expectedUpdatedAt?: string;
}

export interface KnowledgeEvidenceMutationResult {
  item: KnowledgeItem;
  evidence: KnowledgeEvidence;
}

export interface CreateKnowledgeCandidateInput {
  id?: string;
  title: string;
  canonicalStatement: string;
  userExplanation?: string;
  knowledgeType?: KnowledgeType;
  sourceMode: KnowledgeSourceMode;
  evidence?: CreateKnowledgeEvidenceInput[];
}

export interface KnowledgeMutationInput {
  expectedUpdatedAt?: string;
}

export interface UpdateKnowledgeItemInput extends KnowledgeMutationInput {
  title?: string;
  canonicalStatement?: string;
  userExplanation?: string;
  knowledgeType?: KnowledgeType;
}

export interface KnowledgeItemQuery {
  reviewStatus?: KnowledgeReviewStatus;
  query?: string;
  noteId?: string;
  includeArchived?: boolean;
  includeDeleted?: boolean;
}

export interface KnowledgeCandidateResult {
  item: KnowledgeItem;
  evidence: KnowledgeEvidence[];
}

export interface KnowledgeProvenanceSource {
  evidenceId: string;
  sourceId: string;
  noteId: string;
  originNoteVersionId: string;
  contentHash: string;
  start: number;
  end: number;
  quoteText: string;
  quoteHash: string;
  annotationRevisions: Array<{ annotationId: string; revision: number }>;
}

interface KnowledgeProvenanceIdentity {
  id: string;
  schemaVersion: 1;
  artifactKind: 'knowledgeItem';
  artifactId: string;
  provenanceHash: string;
}

interface RecordedKnowledgeProvenanceBase extends KnowledgeProvenanceIdentity {
  state: 'recorded';
  modelId: string;
  promptVersion: string;
  resultSchemaVersion: string;
  inputHash: string;
  outputHash: string;
  committedAt: string;
  sources: KnowledgeProvenanceSource[];
}

export interface MockKnowledgeProvenance extends RecordedKnowledgeProvenanceBase {
  executionMode: 'mock';
  provider: 'mock';
  origin: { jobId: string; requestId: string; scopeId: string; spaceId: string; receiptHash: string };
}

export interface AgentKnowledgeProvenance extends RecordedKnowledgeProvenanceBase {
  executionMode: 'agent';
  provider: string;
  origin: { conversationId: string; turnId: string; toolCallId: string; requestId: string; spaceId: string; receiptHash: string };
}

export type RecordedKnowledgeProvenance = MockKnowledgeProvenance | AgentKnowledgeProvenance;

export interface ResolvedKnowledgeProvenanceSource {
  evidenceId: string;
  originalVersionId: string;
  resolvedVersionId: string;
  aliasUsed: boolean;
  sourceState: 'available' | 'stale' | 'unavailable';
}

export type KnowledgeProvenance = { artifactId: string } & (
  | { state: 'absent'; record: null; sources: [] }
  | { state: 'legacy-unavailable'; record: KnowledgeProvenanceIdentity & { state: 'legacy-unavailable'; reason: 'origin-record-unavailable' }; sources: [] }
  | { state: 'recorded'; record: RecordedKnowledgeProvenance; sources: ResolvedKnowledgeProvenanceSource[] }
);
