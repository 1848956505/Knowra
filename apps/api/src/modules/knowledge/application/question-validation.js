import { validationError } from './knowledge-errors.js';

const CHOICE_TYPES = new Set(['singleChoice', 'multipleChoice']);

export function validateQuestionStructure(question) {
  const errors = [];
  if (!question.stem?.trim()) errors.push('QUESTION_STEM_REQUIRED');
  if (CHOICE_TYPES.has(question.questionType)) {
    const options = Array.isArray(question.options) ? question.options : [];
    if (options.length < 2) errors.push('QUESTION_OPTIONS_REQUIRED');
    if (options.some((option) => !option || typeof option !== 'object' || !String(option.id ?? '').trim() || !String(option.text ?? '').trim())) {
      errors.push('QUESTION_OPTIONS_INVALID');
    }
    const normalizedOptionIds = options.map((option) => String(option?.id ?? '').trim());
    const optionIds = new Set(normalizedOptionIds);
    if (optionIds.size !== normalizedOptionIds.length) {
      errors.push('QUESTION_OPTION_IDS_DUPLICATE');
    }
    const answer = (Array.isArray(question.referenceAnswer) ? question.referenceAnswer : [question.referenceAnswer])
      .map((optionId) => String(optionId ?? '').trim());
    if (!answer.length || answer.some((id) => !id || !optionIds.has(id))) errors.push('QUESTION_REFERENCE_ANSWER_INVALID');
    if (question.questionType === 'singleChoice' && answer.length !== 1) errors.push('QUESTION_SINGLE_ANSWER_REQUIRED');
  } else if (question.questionType === 'trueFalse') {
    if (question.referenceAnswer !== true && question.referenceAnswer !== false) errors.push('QUESTION_TRUE_FALSE_ANSWER_REQUIRED');
  } else if (question.questionType === 'shortAnswer') {
    const hasAnswer = typeof question.referenceAnswer === 'string'
      ? Boolean(question.referenceAnswer.trim())
      : question.referenceAnswer !== null && question.referenceAnswer !== undefined;
    if (!hasAnswer && !question.rubric) errors.push('QUESTION_REFERENCE_OR_RUBRIC_REQUIRED');
  }
  if (!question.referenceAnswer && !question.rubric && question.questionType !== 'trueFalse') errors.push('QUESTION_REFERENCE_OR_RUBRIC_REQUIRED');
  if (errors.length) {
    throw validationError('QUESTION_INVALID_STRUCTURE', `Question structure is invalid: ${errors.join(', ')}`);
  }
  return true;
}

export function isQuestionStructureComplete(question) {
  try {
    validateQuestionStructure(question);
    return true;
  } catch {
    return false;
  }
}
