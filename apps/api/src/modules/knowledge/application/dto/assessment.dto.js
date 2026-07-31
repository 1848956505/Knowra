import { createPrefixedId, requireText } from './_shared.js';
import { validationError } from '../knowledge-errors.js';
import { QUESTION_SOURCE_TYPES } from '../../domain/question-source.js';
import { QUESTION_TYPES, QUESTION_SOURCE_MODES, QUESTION_DIFFICULTIES } from '../../domain/question.js';
import { EXAM_FOCUS_DIFFICULTY_HINTS } from '../../domain/exam-focus.js';

function optionalText(value, code, message) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw validationError(code, message);
  return value.trim() || null;
}

function jsonObject(value, fallback, code, message) {
  if (value === undefined || value === null) return structuredClone(fallback);
  if (typeof value !== 'object' || Array.isArray(value)) throw validationError(code, message);
  return structuredClone(value);
}

function stringArray(value, fallback, code, message) {
  if (value === undefined || value === null) return structuredClone(fallback);
  if (!Array.isArray(value)) throw validationError(code, message);
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function optionalEnum(value, values, code, message) {
  if (value === undefined || value === null || value === '') return null;
  if (!values.includes(value)) throw validationError(code, message);
  return value;
}

function optionalJsonObject(value, code, message) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) throw validationError(code, message);
  return structuredClone(value);
}

export function buildCreateExamProfileDto(input = {}) {
  return {
    id: input.id === undefined ? createPrefixedId('exam-profile') : requireText(input.id, 'EXAM_PROFILE_ID_INVALID', 'ExamProfile id is invalid'),
    name: requireText(input.name, 'EXAM_PROFILE_NAME_REQUIRED', 'ExamProfile name is required'),
    description: optionalText(input.description, 'EXAM_PROFILE_DESCRIPTION_INVALID', 'ExamProfile description is invalid') ?? '',
    scope: stringArray(input.scope, [], 'EXAM_PROFILE_SCOPE_INVALID', 'ExamProfile scope is invalid'),
    language: optionalText(input.language, 'EXAM_PROFILE_LANGUAGE_INVALID', 'ExamProfile language is invalid') ?? 'zh-CN',
    commonQuestionTypes: stringArray(input.commonQuestionTypes, [], 'EXAM_PROFILE_TYPES_INVALID', 'ExamProfile commonQuestionTypes is invalid'),
    difficultyProfile: jsonObject(input.difficultyProfile, {}, 'EXAM_PROFILE_DIFFICULTY_INVALID', 'ExamProfile difficultyProfile is invalid'),
    createdAt: input.createdAt,
    updatedAt: input.updatedAt
  };
}

export function buildUpdateExamProfileDto(input = {}) {
  const dto = {};
  if (input.name !== undefined) dto.name = requireText(input.name, 'EXAM_PROFILE_NAME_REQUIRED', 'ExamProfile name is required');
  if (input.description !== undefined) dto.description = optionalText(input.description, 'EXAM_PROFILE_DESCRIPTION_INVALID', 'ExamProfile description is invalid') ?? '';
  if (input.scope !== undefined) dto.scope = stringArray(input.scope, [], 'EXAM_PROFILE_SCOPE_INVALID', 'ExamProfile scope is invalid');
  if (input.language !== undefined) dto.language = optionalText(input.language, 'EXAM_PROFILE_LANGUAGE_INVALID', 'ExamProfile language is invalid') ?? 'zh-CN';
  if (input.commonQuestionTypes !== undefined) dto.commonQuestionTypes = stringArray(input.commonQuestionTypes, [], 'EXAM_PROFILE_TYPES_INVALID', 'ExamProfile commonQuestionTypes is invalid');
  if (input.difficultyProfile !== undefined) dto.difficultyProfile = jsonObject(input.difficultyProfile, {}, 'EXAM_PROFILE_DIFFICULTY_INVALID', 'ExamProfile difficultyProfile is invalid');
  return dto;
}

export function buildCreateExamFocusDto(input = {}) {
  const priority = Number(input.priority ?? 1);
  if (!Number.isInteger(priority) || priority < 1) throw validationError('EXAM_FOCUS_PRIORITY_INVALID', 'ExamFocus priority is invalid');
  const sourceType = input.sourceType ?? 'manual';
  if (sourceType !== 'manual') throw validationError('EXAM_FOCUS_SOURCE_TYPE_UNSUPPORTED', 'Phase3.0 only supports manual ExamFocus sources');
  return {
    id: input.id === undefined ? createPrefixedId('exam-focus') : requireText(input.id, 'EXAM_FOCUS_ID_INVALID', 'ExamFocus id is invalid'),
    examProfileId: requireText(input.examProfileId, 'EXAM_FOCUS_PROFILE_REQUIRED', 'ExamFocus examProfileId is required'),
    learningObjectiveId: requireText(input.learningObjectiveId, 'EXAM_FOCUS_OBJECTIVE_REQUIRED', 'ExamFocus learningObjectiveId is required'),
    description: optionalText(input.description, 'EXAM_FOCUS_DESCRIPTION_INVALID', 'ExamFocus description is invalid') ?? '',
    priority,
    difficultyHint: optionalEnum(input.difficultyHint, EXAM_FOCUS_DIFFICULTY_HINTS, 'EXAM_FOCUS_DIFFICULTY_INVALID', 'ExamFocus difficultyHint is invalid'),
    questionTypeSuggestions: stringArray(input.questionTypeSuggestions, [], 'EXAM_FOCUS_TYPES_INVALID', 'ExamFocus questionTypeSuggestions is invalid'),
    sourceType,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt
  };
}

export function buildUpdateExamFocusDto(input = {}) {
  const dto = {};
  if (input.description !== undefined) dto.description = optionalText(input.description, 'EXAM_FOCUS_DESCRIPTION_INVALID', 'ExamFocus description is invalid') ?? '';
  if (input.difficultyHint !== undefined) dto.difficultyHint = optionalEnum(input.difficultyHint, EXAM_FOCUS_DIFFICULTY_HINTS, 'EXAM_FOCUS_DIFFICULTY_INVALID', 'ExamFocus difficultyHint is invalid');
  if (input.priority !== undefined) {
    const priority = Number(input.priority);
    if (!Number.isInteger(priority) || priority < 1) throw validationError('EXAM_FOCUS_PRIORITY_INVALID', 'ExamFocus priority is invalid');
    dto.priority = priority;
  }
  if (input.questionTypeSuggestions !== undefined) dto.questionTypeSuggestions = stringArray(input.questionTypeSuggestions, [], 'EXAM_FOCUS_TYPES_INVALID', 'ExamFocus questionTypeSuggestions is invalid');
  return dto;
}

export function buildCreateQuestionDto(input = {}) {
  const questionType = input.questionType ?? 'shortAnswer';
  if (!QUESTION_TYPES.includes(questionType)) throw validationError('QUESTION_TYPE_INVALID', 'Question questionType is invalid');
  const sourceMode = input.sourceMode ?? 'manual';
  if (!QUESTION_SOURCE_MODES.includes(sourceMode)) throw validationError('QUESTION_SOURCE_MODE_INVALID', 'Question sourceMode is invalid');
  if (sourceMode !== 'manual') throw validationError('QUESTION_SOURCE_MODE_UNSUPPORTED', 'Phase3.0 only supports manual Question sources');
  const objectiveIds = stringArray(input.learningObjectiveIds, [], 'QUESTION_OBJECTIVES_INVALID', 'Question learningObjectiveIds is invalid');
  const sources = Array.isArray(input.sources) ? input.sources.map(buildQuestionSourceDto) : [];
  return {
    id: input.id === undefined ? createPrefixedId('question') : requireText(input.id, 'QUESTION_ID_INVALID', 'Question id is invalid'),
    questionType,
    stem: typeof input.stem === 'string' ? input.stem.trim() : '',
    options: cloneQuestionOptions(input.options),
    referenceAnswer: input.referenceAnswer === undefined ? null : structuredClone(input.referenceAnswer),
    rubric: input.rubric === undefined ? null : structuredClone(input.rubric),
    explanation: optionalText(input.explanation, 'QUESTION_EXPLANATION_INVALID', 'Question explanation is invalid') ?? '',
    difficulty: optionalEnum(input.difficulty, QUESTION_DIFFICULTIES, 'QUESTION_DIFFICULTY_INVALID', 'Question difficulty is invalid'),
    sourceMode,
    learningObjectiveIds: [...new Set(objectiveIds)],
    sources,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt
  };
}

export function buildUpdateQuestionDto(input = {}) {
  const dto = {};
  if (input.questionType !== undefined) {
    if (!QUESTION_TYPES.includes(input.questionType)) throw validationError('QUESTION_TYPE_INVALID', 'Question questionType is invalid');
    dto.questionType = input.questionType;
  }
  for (const field of ['stem', 'explanation']) {
    if (input[field] !== undefined) {
      if (typeof input[field] !== 'string') throw validationError('QUESTION_TEXT_INVALID', `Question ${field} is invalid`);
      dto[field] = input[field].trim();
    }
  }
  if (input.options !== undefined) dto.options = cloneQuestionOptions(input.options);
  for (const field of ['referenceAnswer', 'rubric']) {
    if (input[field] !== undefined) dto[field] = input[field] === null ? null : structuredClone(input[field]);
  }
  if (input.difficulty !== undefined) dto.difficulty = optionalEnum(input.difficulty, QUESTION_DIFFICULTIES, 'QUESTION_DIFFICULTY_INVALID', 'Question difficulty is invalid');
  if (input.learningObjectiveIds !== undefined) dto.learningObjectiveIds = [...new Set(stringArray(input.learningObjectiveIds, [], 'QUESTION_OBJECTIVES_INVALID', 'Question learningObjectiveIds is invalid'))];
  if (input.sources !== undefined) {
    if (!Array.isArray(input.sources)) throw validationError('QUESTION_SOURCES_INVALID', 'Question sources is invalid');
    dto.sources = input.sources.map(buildQuestionSourceDto);
  }
  return dto;
}

export function buildQuestionSourceDto(input = {}) {
  const sourceType = input.sourceType ?? 'manual';
  if (!QUESTION_SOURCE_TYPES.includes(sourceType)) throw validationError('QUESTION_SOURCE_TYPE_INVALID', 'QuestionSource sourceType is invalid');
  return {
    id: input.id === undefined ? createPrefixedId('question-source') : requireText(input.id, 'QUESTION_SOURCE_ID_INVALID', 'QuestionSource id is invalid'),
    sourceType,
    sourceId: optionalText(input.sourceId, 'QUESTION_SOURCE_ID_INVALID', 'QuestionSource sourceId is invalid'),
    quote: optionalText(input.quote, 'QUESTION_SOURCE_QUOTE_INVALID', 'QuestionSource quote is invalid') ?? '',
    locator: optionalJsonObject(input.locator, 'QUESTION_SOURCE_LOCATOR_INVALID', 'QuestionSource locator is invalid'),
    contentHash: optionalText(input.contentHash, 'QUESTION_SOURCE_HASH_INVALID', 'QuestionSource contentHash is invalid')
  };
}

function cloneQuestionOptions(value) {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value)) {
    throw validationError(
      'QUESTION_OPTIONS_INVALID',
      'Question options must be an array or null'
    );
  }
  return structuredClone(value);
}
