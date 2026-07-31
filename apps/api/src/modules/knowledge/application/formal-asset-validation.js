import { validateQuestionStructure } from './question-validation.js';
import { validationError } from './knowledge-errors.js';

const ACTION_VERB_LEVELS = Object.freeze({
  identify: new Set(['remember']),
  explain: new Set(['understand']),
  apply: new Set(['apply']),
  calculate: new Set(['apply']),
  compare: new Set(['analyze']),
  analyze: new Set(['analyze']),
  design: new Set(['analyze']),
  evaluate: new Set(['analyze'])
});

const VAGUE_OBJECTIVE_PREFIX = /^(?:能够|能|可以)?\s*(?:了解|熟悉|掌握)/u;

export function assertKnowledgeItemConfirmable(item, evidence = []) {
  if (!item?.title?.trim?.() || !item?.canonicalStatement?.trim?.()) {
    throw validationError(
      'KNOWLEDGE_ITEM_CONTENT_REQUIRED',
      'Confirmed KnowledgeItem requires title and canonicalStatement'
    );
  }
  const hasValidEvidence = evidence.some((record) => record?.status === 'valid');
  if (!hasValidEvidence && item.sourceMode !== 'manual') {
    throw validationError(
      'KNOWLEDGE_ITEM_SOURCE_REQUIRED',
      'Confirmed KnowledgeItem requires valid evidence or an explicit manual source'
    );
  }
  return true;
}

export function assertLearningObjectiveConfirmable(objective, knowledgeItem) {
  if (!knowledgeItem || knowledgeItem.deletedAt || knowledgeItem.reviewStatus !== 'confirmed') {
    throw validationError(
      'KNOWLEDGE_ITEM_NOT_CONFIRMED',
      'LearningObjective confirmation requires a confirmed KnowledgeItem'
    );
  }
  if (!objective?.objective?.trim?.() || !objective?.actionVerb || !objective?.cognitiveLevel) {
    throw validationError(
      'LEARNING_OBJECTIVE_CONTENT_REQUIRED',
      'Confirmed LearningObjective requires objective, actionVerb and cognitiveLevel'
    );
  }
  if (VAGUE_OBJECTIVE_PREFIX.test(objective.objective.trim())) {
    throw validationError(
      'LEARNING_OBJECTIVE_VAGUE_VERB',
      'LearningObjective must use an observable action instead of 了解、熟悉 or 掌握'
    );
  }
  const compatibleLevels = ACTION_VERB_LEVELS[objective.actionVerb];
  if (!compatibleLevels?.has(objective.cognitiveLevel)) {
    throw validationError(
      'LEARNING_OBJECTIVE_COGNITIVE_LEVEL_MISMATCH',
      'LearningObjective actionVerb and cognitiveLevel are incompatible'
    );
  }
  return true;
}

export function deriveQuestionSourceStatus(source, reference = null) {
  switch (source?.sourceType) {
    case 'manual':
      return hasManualSourceDeclaration(source) ? 'active' : 'stale';
    case 'knowledgeItem':
      return reference
        && !reference.deletedAt
        && reference.reviewStatus === 'confirmed'
        ? 'active'
        : 'stale';
    case 'learningObjective':
      return reference?.reviewStatus === 'confirmed' ? 'active' : 'stale';
    case 'noteVersion':
      return reference
        && reference.isCurrent !== false
        && (!source.contentHash || source.contentHash === reference.contentHash)
        ? 'active'
        : 'stale';
    case 'knowledgeEvidence':
      return reference?.status === 'valid' ? 'active' : 'stale';
    default:
      return 'stale';
  }
}

export function assertQuestionConfirmable(question, {
  objectives = [],
  sources = []
} = {}) {
  validateQuestionStructure(question);
  if (!objectives.length) {
    throw validationError(
      'QUESTION_OBJECTIVES_REQUIRED',
      'Question requires at least one LearningObjective'
    );
  }
  if (objectives.some((objective) => objective?.reviewStatus !== 'confirmed')) {
    throw validationError(
      'LEARNING_OBJECTIVE_NOT_CONFIRMED',
      'Question requires all LearningObjectives to be confirmed'
    );
  }
  if (!sources.length) {
    throw validationError(
      'QUESTION_SOURCE_REQUIRED',
      'Question requires at least one QuestionSource'
    );
  }
  if (sources.some((source) => source?.status !== 'active')) {
    throw validationError(
      'QUESTION_SOURCE_INVALID',
      'Question contains an unhealthy QuestionSource'
    );
  }
  return true;
}

function hasManualSourceDeclaration(source) {
  if (typeof source?.sourceId === 'string' && source.sourceId.trim()) return true;
  if (typeof source?.quote === 'string' && source.quote.trim()) return true;
  return Boolean(
    source?.locator
    && typeof source.locator === 'object'
    && !Array.isArray(source.locator)
    && Object.keys(source.locator).length
  );
}
