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
}

export interface KnowledgeCandidateResult {
  item: KnowledgeItem;
  evidence: KnowledgeEvidence[];
}
