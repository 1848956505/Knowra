import { Tag } from '../domain/tag.js';
import { buildCreateTagDto, buildUpdateTagDto } from './dto/tag.dto.js';
import { createInMemoryTagRepository } from '../infrastructure/tag-repository.js';
import {
  conflictError,
  notFoundError
} from './knowledge-errors.js';

export function createTagService({
  repository = createInMemoryTagRepository(),
  validateSpaceReference = null,
  validateGroupReference = null
} = {}) {
  function requireTag(tagId) {
    const tag = repository.findById(tagId);

    if (!tag) {
      throw notFoundError('TAG_NOT_FOUND', 'Tag not found');
    }

    return tag;
  }

  function assertNameAvailable(spaceId, name, currentId = null) {
    const normalized = name.trim().toLocaleLowerCase();
    if (repository.list({ spaceId }).some((tag) => tag.id !== currentId && tag.name.trim().toLocaleLowerCase() === normalized)) {
      throw conflictError('TAG_NAME_CONFLICT', 'A tag with the same name already exists');
    }
  }

  return {
    createTag(input) {
      const dto = buildCreateTagDto(input);
      if (repository.findById(dto.id)) {
        throw conflictError('TAG_ID_CONFLICT', 'A tag with the same id already exists');
      }
      validateSpaceReference?.(dto.spaceId);
      validateGroupReference?.(dto.groupId, dto.spaceId);
      assertNameAvailable(dto.spaceId, dto.name);
      const tag = new Tag(dto);
      repository.save(tag);
      return tag;
    },
    updateTag(tagId, updates) {
      const currentTag = requireTag(tagId);
      const dto = buildUpdateTagDto(updates);
      if (dto.name) assertNameAvailable(currentTag.spaceId, dto.name, currentTag.id);
      if (currentTag.isSystem && dto.groupId !== undefined && dto.groupId !== currentTag.groupId) {
        throw conflictError('SYSTEM_TAG_PROTECTED', 'System tags cannot be moved to another group');
      }
      if (dto.groupId !== undefined) validateGroupReference?.(dto.groupId, currentTag.spaceId);
      const updatedTag = new Tag({
        ...currentTag,
        ...dto,
        id: currentTag.id,
        spaceId: currentTag.spaceId
      });

      repository.save(updatedTag);
      return updatedTag;
    },
    deleteTag(tagId) {
      const tag = requireTag(tagId);
      if (tag.isSystem) throw conflictError('SYSTEM_TAG_PROTECTED', 'System tags cannot be deleted');
      repository.delete(tagId);
      return tag;
    },
    reorderTags(tagIds = []) {
      const tags = tagIds.map(requireTag);
      if (new Set(tags.map((tag) => tag.groupId)).size > 1) {
        throw conflictError('TAG_REORDER_GROUP_MISMATCH', 'Tags can only be reordered within the same group');
      }
      return tags.map((tag, index) => {
        return repository.save(new Tag({ ...tag, sortOrder: index + 1, updatedAt: new Date().toISOString() }));
      });
    },
    listTags(options = {}) {
      return repository.list(options);
    }
  };
}
