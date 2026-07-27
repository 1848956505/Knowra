import { Tag } from '../domain/tag.js';
import { buildCreateTagDto, buildUpdateTagDto } from './dto/tag.dto.js';
import { createInMemoryTagRepository } from '../infrastructure/tag-repository.js';
import {
  conflictError,
  notFoundError
} from './knowledge-errors.js';

export function createTagService({
  repository = createInMemoryTagRepository(),
  validateSpaceReference = null
} = {}) {
  function requireTag(tagId) {
    const tag = repository.findById(tagId);

    if (!tag) {
      throw notFoundError('TAG_NOT_FOUND', 'Tag not found');
    }

    return tag;
  }

  return {
    createTag(input) {
      const dto = buildCreateTagDto(input);
      if (repository.findById(dto.id)) {
        throw conflictError('TAG_ID_CONFLICT', 'A tag with the same id already exists');
      }
      validateSpaceReference?.(dto.spaceId);
      const tag = new Tag(dto);
      repository.save(tag);
      return tag;
    },
    updateTag(tagId, updates) {
      const currentTag = requireTag(tagId);
      const dto = buildUpdateTagDto(updates);
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
      repository.delete(tagId);
      return tag;
    },
    listTags(options = {}) {
      return repository.list(options);
    }
  };
}
