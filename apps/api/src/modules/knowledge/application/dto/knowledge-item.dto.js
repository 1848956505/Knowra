import { createPrefixedId, requireText } from './_shared.js';
import { validationError } from '../knowledge-errors.js';

const KNOWLEDGE_TYPES = new Set([
  'concept',
  'fact',
  'principle',
  'process',
  'algorithm',
  'formula',
  'comparison',
  'application'
]);
const SOURCE_MODES = new Set(['manual', 'annotation', 'selection', 'ai']);
const SOURCE_TYPES = new Set(['noteVersion', 'annotation', 'manual']);

function text(value) {
  return typeof value === 'string' ? value.trim() : value;
}

function optionalText(value, code, message) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw validationError(code, message);
  return value.trim() || null;
}

export function buildCreateKnowledgeItemDto(input = {}) {
  const title = optionalText(input.title, 'KNOWLEDGE_ITEM_TITLE_INVALID', 'KnowledgeItem title is invalid') ?? '';
  const canonicalStatement = optionalText(
    input.canonicalStatement,
    'KNOWLEDGE_ITEM_STATEMENT_INVALID',
    'KnowledgeItem canonicalStatement is invalid'
  ) ?? '';
  const knowledgeType = input.knowledgeType ?? 'concept';
  const sourceMode = input.sourceMode ?? 'manual';
  if (!KNOWLEDGE_TYPES.has(knowledgeType)) {
    throw validationError('KNOWLEDGE_ITEM_TYPE_INVALID', 'KnowledgeItem knowledgeType is invalid');
  }
  if (!SOURCE_MODES.has(sourceMode)) {
    throw validationError('KNOWLEDGE_ITEM_SOURCE_MODE_INVALID', 'KnowledgeItem sourceMode is invalid');
  }
  if (input.importance !== undefined && input.importance !== null && !Number.isFinite(Number(input.importance))) {
    throw validationError('KNOWLEDGE_ITEM_IMPORTANCE_INVALID', 'KnowledgeItem importance is invalid');
  }
  return {
    id: input.id === undefined ? createPrefixedId('knowledge', title || 'item') : requireText(input.id, 'KNOWLEDGE_ITEM_ID_INVALID', 'KnowledgeItem id is invalid'),
    title,
    canonicalStatement,
    userExplanation: optionalText(input.userExplanation, 'KNOWLEDGE_ITEM_EXPLANATION_INVALID', 'KnowledgeItem userExplanation is invalid') ?? '',
    knowledgeType,
    importance: input.importance === undefined || input.importance === null ? null : Number(input.importance),
    sourceMode,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt
  };
}

export function buildUpdateKnowledgeItemDto(input = {}) {
  const dto = {};
  for (const field of ['title', 'canonicalStatement', 'userExplanation']) {
    if (input[field] !== undefined) {
      if (typeof input[field] !== 'string') {
        throw validationError('KNOWLEDGE_ITEM_TEXT_INVALID', `KnowledgeItem ${field} is invalid`);
      }
      dto[field] = input[field].trim();
    }
  }
  if (input.knowledgeType !== undefined) {
    if (!KNOWLEDGE_TYPES.has(input.knowledgeType)) {
      throw validationError('KNOWLEDGE_ITEM_TYPE_INVALID', 'KnowledgeItem knowledgeType is invalid');
    }
    dto.knowledgeType = input.knowledgeType;
  }
  if (input.importance !== undefined) {
    if (input.importance !== null && !Number.isFinite(Number(input.importance))) {
      throw validationError('KNOWLEDGE_ITEM_IMPORTANCE_INVALID', 'KnowledgeItem importance is invalid');
    }
    dto.importance = input.importance === null ? null : Number(input.importance);
  }
  if (input.sourceMode !== undefined) {
    if (!SOURCE_MODES.has(input.sourceMode)) {
      throw validationError('KNOWLEDGE_ITEM_SOURCE_MODE_INVALID', 'KnowledgeItem sourceMode is invalid');
    }
    dto.sourceMode = input.sourceMode;
  }
  return dto;
}

export function buildCreateKnowledgeEvidenceDto(input = {}) {
  const sourceType = input.sourceType ?? 'manual';
  if (!SOURCE_TYPES.has(sourceType)) {
    throw validationError('KNOWLEDGE_EVIDENCE_SOURCE_TYPE_INVALID', 'KnowledgeEvidence sourceType is invalid');
  }
  const sourceId = optionalText(input.sourceId, 'KNOWLEDGE_EVIDENCE_SOURCE_ID_INVALID', 'KnowledgeEvidence sourceId is invalid');
  const noteId = optionalText(input.noteId, 'KNOWLEDGE_EVIDENCE_NOTE_ID_INVALID', 'KnowledgeEvidence noteId is invalid');
  const noteVersionId = optionalText(input.noteVersionId, 'KNOWLEDGE_EVIDENCE_VERSION_ID_INVALID', 'KnowledgeEvidence noteVersionId is invalid');
  const annotationId = optionalText(input.annotationId, 'KNOWLEDGE_EVIDENCE_ANNOTATION_ID_INVALID', 'KnowledgeEvidence annotationId is invalid');
  if (sourceType === 'noteVersion' && !noteVersionId) {
    throw validationError('KNOWLEDGE_EVIDENCE_VERSION_REQUIRED', 'NoteVersion evidence requires noteVersionId');
  }
  if (sourceType === 'annotation' && !annotationId) {
    throw validationError('KNOWLEDGE_EVIDENCE_ANNOTATION_REQUIRED', 'Annotation evidence requires annotationId');
  }
  if (sourceType === 'manual' && (noteVersionId || annotationId)) {
    throw validationError('KNOWLEDGE_EVIDENCE_MANUAL_SOURCE_INVALID', 'Manual evidence cannot reference a NoteVersion or annotation');
  }
  return {
    id: input.id === undefined ? createPrefixedId('evidence') : requireText(input.id, 'KNOWLEDGE_EVIDENCE_ID_INVALID', 'KnowledgeEvidence id is invalid'),
    sourceType,
    sourceId,
    noteId,
    noteVersionId,
    annotationId,
    quoteText: text(input.quoteText) ?? '',
    headingPath: Array.isArray(input.headingPath) ? input.headingPath.map((item) => String(item).trim()).filter(Boolean) : [],
    relationType: input.relationType ?? 'supports'
  };
}
