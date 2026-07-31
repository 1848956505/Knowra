const REVIEW_STATUSES = new Set(['candidate', 'confirmed', 'archived']);
const SOURCE_TYPES = new Set(['manual', 'ai', 'pastPaper', 'syllabus']);
const DIFFICULTY_HINTS = new Set(['easy', 'medium', 'hard']);

export class ExamFocus {
  constructor({
    id,
    examProfileId,
    learningObjectiveId,
    description = '',
    priority = 1,
    difficultyHint = null,
    questionTypeSuggestions = [],
    sourceType = 'manual',
    reviewStatus = 'candidate',
    createdAt = new Date().toISOString(),
    updatedAt = createdAt
  }) {
    if (!id?.trim()) throw new Error('ExamFocus id is required');
    if (!examProfileId?.trim() || !learningObjectiveId?.trim()) throw new Error('ExamFocus references are required');
    if (typeof description !== 'string') throw new Error('ExamFocus description is invalid');
    if (!Number.isInteger(Number(priority)) || Number(priority) < 1) throw new Error('ExamFocus priority is invalid');
    if (!Array.isArray(questionTypeSuggestions)) throw new Error('ExamFocus questionTypeSuggestions is invalid');
    if (difficultyHint && !DIFFICULTY_HINTS.has(difficultyHint)) throw new Error('ExamFocus difficultyHint is invalid');
    if (!SOURCE_TYPES.has(sourceType) || !REVIEW_STATUSES.has(reviewStatus)) throw new Error('ExamFocus status or sourceType is invalid');

    Object.assign(this, {
      id,
      examProfileId,
      learningObjectiveId,
      description: description.trim(),
      priority: Number(priority),
      difficultyHint: difficultyHint || null,
      questionTypeSuggestions: structuredClone(questionTypeSuggestions),
      sourceType,
      reviewStatus,
      createdAt,
      updatedAt
    });
  }
}

export const EXAM_FOCUS_REVIEW_STATUSES = Object.freeze([...REVIEW_STATUSES]);
export const EXAM_FOCUS_SOURCE_TYPES = Object.freeze([...SOURCE_TYPES]);
export const EXAM_FOCUS_DIFFICULTY_HINTS = Object.freeze([...DIFFICULTY_HINTS]);
