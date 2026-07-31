const QUESTION_TYPE_SET = new Set(['singleChoice', 'multipleChoice', 'trueFalse', 'shortAnswer']);
const REVIEW_STATUS_SET = new Set(['draft', 'validating', 'candidate', 'confirmed', 'archived']);
const SOURCE_MODE_SET = new Set(['manual', 'ai', 'import']);
const DIFFICULTY_SET = new Set(['easy', 'medium', 'hard']);

function cloneOrNull(value) {
  return value === undefined || value === null ? null : structuredClone(value);
}

export class Question {
  constructor({
    id,
    questionType = 'shortAnswer',
    stem = '',
    options = null,
    referenceAnswer = null,
    rubric = null,
    explanation = '',
    difficulty = null,
    reviewStatus = 'draft',
    sourceMode = 'manual',
    version = 1,
    createdAt = new Date().toISOString(),
    updatedAt = createdAt
  }) {
    if (!id?.trim()) throw new Error('Question id is required');
    if (!QUESTION_TYPE_SET.has(questionType)) throw new Error('Question questionType is invalid');
    if (!REVIEW_STATUS_SET.has(reviewStatus) || !SOURCE_MODE_SET.has(sourceMode)) throw new Error('Question status or sourceMode is invalid');
    if (difficulty && !DIFFICULTY_SET.has(difficulty)) throw new Error('Question difficulty is invalid');
    if (!Number.isInteger(Number(version)) || Number(version) < 1) throw new Error('Question version is invalid');
    if (typeof stem !== 'string' || typeof explanation !== 'string') throw new Error('Question text fields are invalid');
    if (options !== null && options !== undefined && !Array.isArray(options)) {
      throw new Error('Question options must be an array or null');
    }

    Object.assign(this, {
      id,
      questionType,
      stem: stem.trim(),
      options: cloneOrNull(options),
      referenceAnswer: cloneOrNull(referenceAnswer),
      rubric: cloneOrNull(rubric),
      explanation: explanation.trim(),
      difficulty: difficulty || null,
      reviewStatus,
      sourceMode,
      version: Number(version),
      createdAt,
      updatedAt
    });
  }
}

export const QUESTION_TYPES = Object.freeze([...QUESTION_TYPE_SET]);
export const QUESTION_REVIEW_STATUSES = Object.freeze([...REVIEW_STATUS_SET]);
export const QUESTION_SOURCE_MODES = Object.freeze([...SOURCE_MODE_SET]);
export const QUESTION_DIFFICULTIES = Object.freeze([...DIFFICULTY_SET]);
