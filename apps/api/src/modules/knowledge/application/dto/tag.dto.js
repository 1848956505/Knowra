import { createPrefixedId, requireText } from './_shared.js';

export function buildCreateTagDto(input = {}) {
  const name = requireText(input.name, 'TAG_NAME_REQUIRED', 'Tag name is required');
  return {
    id: input.id === undefined || input.id === null
      ? createPrefixedId('tag', name)
      : requireText(input.id, 'TAG_ID_INVALID', 'Tag id is invalid'),
    spaceId: requireText(input.spaceId, 'TAG_SPACE_REQUIRED', 'Tag spaceId is required'),
    name,
    color: input.color ?? 'slate'
  };
}

export function buildUpdateTagDto(input = {}) {
  const dto = {};

  if (input.name !== undefined) {
    dto.name = requireText(input.name, 'TAG_NAME_REQUIRED', 'Tag name is required');
  }
  if (input.color !== undefined) {
    dto.color = input.color;
  }

  return dto;
}
