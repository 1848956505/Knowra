import { createPrefixedId, normalizeOptionalId, requireText } from './_shared.js';
import { validationError } from '../knowledge-errors.js';

const TAG_COLORS = new Set(['neutral', 'blue', 'green', 'orange', 'red', 'violet']);

function normalizeName(value) {
  const name = requireText(value, 'TAG_NAME_REQUIRED', 'Tag name is required');
  if (name.length > 30 || /[\r\n]/.test(name)) throw validationError('TAG_NAME_INVALID', 'Tag name must contain 1 to 30 characters without line breaks');
  return name;
}

function normalizeColor(value = 'neutral') {
  const aliases = { slate: 'neutral', cyan: 'blue', amber: 'orange', mastery: 'green', importance: 'orange', purpose: 'blue', '#3c68ff': 'blue' };
  const color = aliases[String(value).toLowerCase()] ?? String(value).toLowerCase();
  if (!TAG_COLORS.has(color)) throw validationError('TAG_COLOR_INVALID', 'Tag color is invalid');
  return color;
}

export function buildCreateTagDto(input = {}) {
  const name = normalizeName(input.name);
  return {
    id: input.id === undefined || input.id === null
      ? createPrefixedId('tag', name)
      : requireText(input.id, 'TAG_ID_INVALID', 'Tag id is invalid'),
    spaceId: requireText(input.spaceId, 'TAG_SPACE_REQUIRED', 'Tag spaceId is required'),
    name,
    color: normalizeColor(input.color),
    groupId: normalizeOptionalId(input.groupId, 'TAG_GROUP_ID_INVALID', 'Tag group id is invalid'),
    code: normalizeOptionalId(input.code, 'TAG_CODE_INVALID', 'Tag code is invalid'),
    isSystem: Boolean(input.isSystem),
    sortOrder: Number(input.sortOrder) || 0
  };
}

export function buildUpdateTagDto(input = {}) {
  const dto = {};

  if (input.name !== undefined) {
    dto.name = normalizeName(input.name);
  }
  if (input.color !== undefined) {
    dto.color = normalizeColor(input.color);
  }
  if (input.groupId !== undefined) dto.groupId = normalizeOptionalId(input.groupId, 'TAG_GROUP_ID_INVALID', 'Tag group id is invalid');
  if (input.sortOrder !== undefined) dto.sortOrder = Number(input.sortOrder) || 0;

  return dto;
}
