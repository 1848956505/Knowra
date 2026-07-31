import { validationError } from './knowledge-errors.js';

export const WORKSPACE_DEFAULT_LIMIT = 20;
export const WORKSPACE_MAX_LIMIT = 100;
export const WORKSPACE_SORTS = Object.freeze(['updated-desc', 'updated-asc']);

export function parseWorkspaceQuery(input = {}) {
  const limitValue = input.limit ?? WORKSPACE_DEFAULT_LIMIT;
  const limit = Number(limitValue);
  if (!Number.isInteger(limit) || limit < 1 || limit > WORKSPACE_MAX_LIMIT) {
    throw validationError('WORKSPACE_LIMIT_INVALID', `limit must be an integer between 1 and ${WORKSPACE_MAX_LIMIT}`);
  }

  const sort = String(input.sort ?? 'updated-desc');
  if (!WORKSPACE_SORTS.includes(sort)) {
    throw validationError('WORKSPACE_SORT_INVALID', 'sort must be updated-desc or updated-asc');
  }

  return {
    query: String(input.query ?? '').trim().toLocaleLowerCase(),
    limit,
    sort,
    cursor: decodeWorkspaceCursor(input.cursor),
    reviewStatus: normalizeOptional(input.reviewStatus),
    knowledgeType: normalizeOptional(input.knowledgeType),
    evidenceStatus: normalizeOptional(input.evidenceStatus ?? input.sourceStatus),
    questionType: normalizeOptional(input.questionType),
    difficulty: normalizeOptional(input.difficulty),
    actionVerb: normalizeOptional(input.actionVerb),
    cognitiveLevel: normalizeOptional(input.cognitiveLevel),
    knowledgeItemId: normalizeOptional(input.knowledgeItemId),
    learningObjectiveId: normalizeOptional(input.learningObjectiveId),
    examProfileId: normalizeOptional(input.examProfileId),
    kind: normalizeOptional(input.kind),
    includeArchived: parseBoolean(input.includeArchived, false),
    missingObjectives: parseBoolean(input.missingObjectives, false),
    missingQuestions: parseBoolean(input.missingQuestions, false),
    hasQuestions: parseOptionalBoolean(input.hasQuestions)
  };
}

export function paginateWorkspaceItems(items, query) {
  const ordered = [...items].sort((left, right) => compareUpdated(left, right, query.sort));
  const startIndex = findCursorIndex(ordered, query.cursor, query.sort);
  const page = ordered.slice(startIndex, startIndex + query.limit);
  const hasMore = startIndex + query.limit < ordered.length;
  const last = page.at(-1);
  return {
    items: page,
    pagination: {
      limit: query.limit,
      sort: query.sort,
      total: ordered.length,
      hasMore,
      nextCursor: hasMore && last ? encodeWorkspaceCursor(last) : null
    }
  };
}

export function matchesText(values, query) {
  if (!query) return true;
  return values.some((value) => String(value ?? '').toLocaleLowerCase().includes(query));
}

export function countBy(items, selector) {
  return items.reduce((counts, item) => {
    const key = selector(item) ?? 'unknown';
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

export function summarizeEvidenceStatus(records = []) {
  const statuses = records.map((record) => record.status);
  if (statuses.includes('invalid')) return 'invalid';
  if (statuses.includes('stale')) return 'stale';
  if (statuses.includes('insufficient')) return 'insufficient';
  return statuses.length ? 'valid' : 'insufficient';
}

export function summarizeSourceStatus(records = []) {
  const statuses = records.map((record) => record.status);
  if (statuses.includes('stale')) return 'stale';
  if (statuses.includes('active') || statuses.includes('reanchored')) return 'valid';
  return 'insufficient';
}

export function groupBy(records, keySelector) {
  return records.reduce((groups, record) => {
    const key = keySelector(record);
    const group = groups.get(key) ?? [];
    group.push(record);
    groups.set(key, group);
    return groups;
  }, new Map());
}

export function encodeWorkspaceCursor(record) {
  const value = JSON.stringify({ updatedAt: record.updatedAt, id: record.id });
  return Buffer.from(value, 'utf8').toString('base64url');
}

function decodeWorkspaceCursor(value) {
  if (!value) return null;
  try {
    const decoded = JSON.parse(Buffer.from(String(value), 'base64url').toString('utf8'));
    if (!decoded?.id || !decoded?.updatedAt || Number.isNaN(new Date(decoded.updatedAt).getTime())) {
      throw new Error('invalid cursor');
    }
    return { id: String(decoded.id), updatedAt: String(decoded.updatedAt) };
  } catch {
    throw validationError('WORKSPACE_CURSOR_INVALID', 'cursor is invalid or expired');
  }
}

function findCursorIndex(items, cursor, sort) {
  if (!cursor) return 0;
  const exactIndex = items.findIndex((item) => item.id === cursor.id && item.updatedAt === cursor.updatedAt);
  if (exactIndex >= 0) return exactIndex + 1;
  const nextIndex = items.findIndex((item) => compareUpdated(item, cursor, sort) > 0);
  return nextIndex >= 0 ? nextIndex : items.length;
}

function compareUpdated(left, right, sort) {
  const leftTime = new Date(left.updatedAt).getTime();
  const rightTime = new Date(right.updatedAt).getTime();
  const timeCompare = sort === 'updated-asc' ? leftTime - rightTime : rightTime - leftTime;
  return timeCompare || String(left.id).localeCompare(String(right.id));
}

function normalizeOptional(value) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  throw validationError('WORKSPACE_BOOLEAN_INVALID', 'Boolean query parameters must be true or false');
}

function parseOptionalBoolean(value) {
  if (value === undefined || value === null || value === '') return null;
  return parseBoolean(value, false);
}
