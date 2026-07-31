import { createPrefixedId, requireText } from './_shared.js';
import {
  LEARNING_OBJECTIVE_ACTION_VERBS,
  LEARNING_OBJECTIVE_COGNITIVE_LEVELS,
  LEARNING_OBJECTIVE_DIFFICULTY_HINTS
} from '../../domain/learning-objective.js';
import { validationError } from '../knowledge-errors.js';

function optionalText(value, code, message) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw validationError(code, message);
  return value.trim() || null;
}

function enumValue(value, values, code, message) {
  if (value === undefined || value === null || value === '') return '';
  if (!values.includes(value)) throw validationError(code, message);
  return value;
}

export function buildCreateLearningObjectiveDto(input = {}) {
  const knowledgeItemId = requireText(input.knowledgeItemId, 'LEARNING_OBJECTIVE_KNOWLEDGE_ITEM_REQUIRED', 'LearningObjective knowledgeItemId is required');
  const actionVerb = enumValue(input.actionVerb, LEARNING_OBJECTIVE_ACTION_VERBS, 'LEARNING_OBJECTIVE_ACTION_VERB_INVALID', 'LearningObjective actionVerb is invalid');
  const cognitiveLevel = enumValue(input.cognitiveLevel, LEARNING_OBJECTIVE_COGNITIVE_LEVELS, 'LEARNING_OBJECTIVE_COGNITIVE_LEVEL_INVALID', 'LearningObjective cognitiveLevel is invalid');
  const difficultyHint = enumValue(input.difficultyHint, LEARNING_OBJECTIVE_DIFFICULTY_HINTS, 'LEARNING_OBJECTIVE_DIFFICULTY_INVALID', 'LearningObjective difficultyHint is invalid') || null;
  const order = Number(input.order ?? 0);
  if (!Number.isInteger(order) || order < 0) throw validationError('LEARNING_OBJECTIVE_ORDER_INVALID', 'LearningObjective order is invalid');
  return {
    id: input.id === undefined ? createPrefixedId('objective') : requireText(input.id, 'LEARNING_OBJECTIVE_ID_INVALID', 'LearningObjective id is invalid'),
    knowledgeItemId,
    objective: optionalText(input.objective, 'LEARNING_OBJECTIVE_TEXT_INVALID', 'LearningObjective objective is invalid') ?? '',
    actionVerb,
    cognitiveLevel,
    difficultyHint,
    reviewNote: optionalText(input.reviewNote, 'LEARNING_OBJECTIVE_REVIEW_NOTE_INVALID', 'LearningObjective reviewNote is invalid'),
    order,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt
  };
}

export function buildUpdateLearningObjectiveDto(input = {}) {
  const dto = {};
  if (input.objective !== undefined) dto.objective = optionalText(input.objective, 'LEARNING_OBJECTIVE_TEXT_INVALID', 'LearningObjective objective is invalid') ?? '';
  if (input.reviewNote !== undefined) dto.reviewNote = optionalText(input.reviewNote, 'LEARNING_OBJECTIVE_REVIEW_NOTE_INVALID', 'LearningObjective reviewNote is invalid');
  for (const [field, values, code, message] of [
    ['actionVerb', LEARNING_OBJECTIVE_ACTION_VERBS, 'LEARNING_OBJECTIVE_ACTION_VERB_INVALID', 'LearningObjective actionVerb is invalid'],
    ['cognitiveLevel', LEARNING_OBJECTIVE_COGNITIVE_LEVELS, 'LEARNING_OBJECTIVE_COGNITIVE_LEVEL_INVALID', 'LearningObjective cognitiveLevel is invalid'],
    ['difficultyHint', LEARNING_OBJECTIVE_DIFFICULTY_HINTS, 'LEARNING_OBJECTIVE_DIFFICULTY_INVALID', 'LearningObjective difficultyHint is invalid']
  ]) {
    if (input[field] !== undefined) dto[field] = enumValue(input[field], values, code, message) || null;
  }
  if (input.order !== undefined) {
    const order = Number(input.order);
    if (!Number.isInteger(order) || order < 0) throw validationError('LEARNING_OBJECTIVE_ORDER_INVALID', 'LearningObjective order is invalid');
    dto.order = order;
  }
  return dto;
}
