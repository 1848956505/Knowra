export interface KnowledgeItemConstructorInput {
  id: string;
  title?: string;
  canonicalStatement?: string;
  userExplanation?: string | null;
  knowledgeType?: string;
  importance?: unknown;
  reviewStatus?: string;
  sourceMode?: string;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

const REVIEW_STATUSES = new Set(['candidate', 'confirmed', 'needsRevision', 'archived']);
const SOURCE_MODES = new Set(['manual', 'annotation', 'selection', 'ai']);

export class KnowledgeItem {
  declare id: string;
  declare title: string;
  declare canonicalStatement: string;
  declare userExplanation: string;
  declare knowledgeType: string;
  declare importance: number | null;
  declare reviewStatus: 'candidate' | 'confirmed' | 'needsRevision' | 'archived';
  declare sourceMode: 'manual' | 'annotation' | 'selection' | 'ai';
  declare createdAt: string;
  declare updatedAt: string;
  declare deletedAt: string | null;

  constructor({
    id,
    title = '',
    canonicalStatement = '',
    userExplanation = '',
    knowledgeType = 'concept',
    importance = null,
    reviewStatus = 'candidate',
    sourceMode = 'manual',
    createdAt = new Date().toISOString(),
    updatedAt = createdAt,
    deletedAt = null
  }: KnowledgeItemConstructorInput) {
    if (!id?.trim()) throw new Error('KnowledgeItem id is required');
    if (typeof title !== 'string' || typeof canonicalStatement !== 'string') {
      throw new Error('KnowledgeItem text fields are invalid');
    }
    if (!REVIEW_STATUSES.has(reviewStatus) || !SOURCE_MODES.has(sourceMode)) {
      throw new Error('KnowledgeItem status or sourceMode is invalid');
    }
    if (importance !== null && importance !== undefined && !Number.isFinite(Number(importance))) {
      throw new Error('KnowledgeItem importance is invalid');
    }

    Object.assign(this, {
      id,
      title: title.trim(),
      canonicalStatement: canonicalStatement.trim(),
      userExplanation: userExplanation?.trim?.() ?? '',
      knowledgeType,
      importance: importance === null || importance === undefined ? null : Number(importance),
      reviewStatus,
      sourceMode,
      createdAt,
      updatedAt,
      deletedAt
    });
  }
}

export const KNOWLEDGE_ITEM_REVIEW_STATUSES = Object.freeze([...REVIEW_STATUSES]);
export const KNOWLEDGE_ITEM_SOURCE_MODES = Object.freeze([...SOURCE_MODES]);
