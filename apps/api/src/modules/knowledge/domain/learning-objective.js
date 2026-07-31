const REVIEW_STATUSES = new Set(['candidate', 'confirmed', 'archived']);
const ACTION_VERBS = new Set([
  'identify',
  'explain',
  'apply',
  'compare',
  'analyze',
  'calculate',
  'design',
  'evaluate'
]);
const COGNITIVE_LEVELS = new Set(['remember', 'understand', 'apply', 'analyze']);
const DIFFICULTY_HINTS = new Set(['easy', 'medium', 'hard']);

export class LearningObjective {
  constructor({
    id,
    knowledgeItemId,
    objective = '',
    actionVerb = '',
    cognitiveLevel = '',
    difficultyHint = null,
    reviewStatus = 'candidate',
    reviewNote = null,
    order = 0,
    createdAt = new Date().toISOString(),
    updatedAt = createdAt
  }) {
    if (!id?.trim()) throw new Error('LearningObjective id is required');
    if (!knowledgeItemId?.trim()) throw new Error('LearningObjective knowledgeItemId is required');
    if (typeof objective !== 'string' || typeof actionVerb !== 'string' || typeof cognitiveLevel !== 'string') {
      throw new Error('LearningObjective text fields are invalid');
    }
    if (!REVIEW_STATUSES.has(reviewStatus)) throw new Error('LearningObjective reviewStatus is invalid');
    if (actionVerb && !ACTION_VERBS.has(actionVerb)) throw new Error('LearningObjective actionVerb is invalid');
    if (cognitiveLevel && !COGNITIVE_LEVELS.has(cognitiveLevel)) throw new Error('LearningObjective cognitiveLevel is invalid');
    if (difficultyHint !== null && difficultyHint !== '' && !DIFFICULTY_HINTS.has(difficultyHint)) {
      throw new Error('LearningObjective difficultyHint is invalid');
    }
    if (!Number.isInteger(Number(order)) || Number(order) < 0) throw new Error('LearningObjective order is invalid');

    Object.assign(this, {
      id,
      knowledgeItemId,
      objective: objective.trim(),
      actionVerb: actionVerb.trim(),
      cognitiveLevel: cognitiveLevel.trim(),
      difficultyHint: difficultyHint || null,
      reviewStatus,
      reviewNote: reviewNote?.trim?.() || null,
      order: Number(order),
      createdAt,
      updatedAt
    });
  }
}

export const LEARNING_OBJECTIVE_REVIEW_STATUSES = Object.freeze([...REVIEW_STATUSES]);
export const LEARNING_OBJECTIVE_ACTION_VERBS = Object.freeze([...ACTION_VERBS]);
export const LEARNING_OBJECTIVE_COGNITIVE_LEVELS = Object.freeze([...COGNITIVE_LEVELS]);
export const LEARNING_OBJECTIVE_DIFFICULTY_HINTS = Object.freeze([...DIFFICULTY_HINTS]);
