import { createPrefixedId, normalizeOptionalId, requireText } from './_shared.js';
import { validationError } from '../knowledge-errors.js';

function selectionMode(value = 'multiple') {
  if (!['single', 'multiple'].includes(value)) {
    throw validationError('TAG_GROUP_SELECTION_MODE_INVALID', 'Tag group selectionMode must be single or multiple');
  }
  return value;
}

export function buildCreateTagGroupDto(input = {}) {
  const name = requireText(input.name, 'TAG_GROUP_NAME_REQUIRED', 'Tag group name is required');
  return {
    id: input.id ? requireText(input.id, 'TAG_GROUP_ID_INVALID', 'Tag group id is invalid') : createPrefixedId('tag-group', name),
    spaceId: requireText(input.spaceId, 'TAG_GROUP_SPACE_REQUIRED', 'Tag group spaceId is required'),
    code: normalizeOptionalId(input.code, 'TAG_GROUP_CODE_INVALID', 'Tag group code is invalid'),
    name,
    selectionMode: selectionMode(input.selectionMode),
    isSystem: Boolean(input.isSystem),
    sortOrder: Number(input.sortOrder) || 0
  };
}

export function buildUpdateTagGroupDto(input = {}) {
  const dto = {};
  if (input.name !== undefined) dto.name = requireText(input.name, 'TAG_GROUP_NAME_REQUIRED', 'Tag group name is required');
  if (input.selectionMode !== undefined) dto.selectionMode = selectionMode(input.selectionMode);
  if (input.sortOrder !== undefined) dto.sortOrder = Number(input.sortOrder) || 0;
  return dto;
}
