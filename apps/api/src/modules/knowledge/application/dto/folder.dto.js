import {
  createPrefixedId,
  normalizeOptionalId,
  requireText
} from './_shared.js';

function createFolderId({ id, name }) {
  if (id !== undefined && id !== null) {
    return requireText(id, 'FOLDER_ID_INVALID', 'Folder id is invalid');
  }

  return createPrefixedId('folder', name || 'item');
}

export function buildCreateFolderDto(input = {}) {
  const name = requireText(input.name, 'FOLDER_NAME_REQUIRED', 'Folder name is required');

  return {
    id: createFolderId({
      id: input.id,
      name
    }),
    spaceId: requireText(input.spaceId, 'FOLDER_SPACE_REQUIRED', 'Folder spaceId is required'),
    parentId: normalizeOptionalId(input.parentId, 'FOLDER_PARENT_INVALID', 'Folder parentId is invalid'),
    name,
    pathCache: input.pathCache ?? '/'
  };
}

export function buildUpdateFolderDto(input = {}) {
  const dto = {};

  if (input.name !== undefined) {
    dto.name = requireText(input.name, 'FOLDER_NAME_REQUIRED', 'Folder name is required');
  }
  if (input.parentId !== undefined) {
    dto.parentId = normalizeOptionalId(input.parentId, 'FOLDER_PARENT_INVALID', 'Folder parentId is invalid');
  }
  if (input.pathCache !== undefined) {
    dto.pathCache = input.pathCache;
  }

  return dto;
}
