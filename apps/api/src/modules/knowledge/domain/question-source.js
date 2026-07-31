const SOURCE_TYPES = new Set([
  'knowledgeItem',
  'learningObjective',
  'noteVersion',
  'knowledgeEvidence',
  'manual',
  'pastPaper',
  'ai'
]);
const SOURCE_STATUSES = new Set(['active', 'stale', 'reanchored']);

export class QuestionSource {
  constructor({
    id,
    questionId,
    sourceType = 'manual',
    sourceId = null,
    quote = '',
    locator = null,
    contentHash = null,
    status = 'active',
    createdAt = new Date().toISOString(),
    updatedAt = createdAt
  }) {
    if (!id?.trim() || !questionId?.trim()) throw new Error('QuestionSource id and questionId are required');
    if (!SOURCE_TYPES.has(sourceType) || !SOURCE_STATUSES.has(status)) throw new Error('QuestionSource sourceType or status is invalid');
    if (typeof quote !== 'string') throw new Error('QuestionSource quote is invalid');
    if (locator !== null && locator !== undefined && (typeof locator !== 'object' || Array.isArray(locator))) throw new Error('QuestionSource locator is invalid');

    Object.assign(this, {
      id,
      questionId,
      sourceType,
      sourceId: sourceId || null,
      quote: quote.trim(),
      locator: locator === null || locator === undefined ? null : structuredClone(locator),
      contentHash: contentHash || null,
      status,
      createdAt,
      updatedAt
    });
  }
}

export const QUESTION_SOURCE_TYPES = Object.freeze([...SOURCE_TYPES]);
export const QUESTION_SOURCE_STATUSES = Object.freeze([...SOURCE_STATUSES]);
