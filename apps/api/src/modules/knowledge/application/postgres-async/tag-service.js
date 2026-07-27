import { Tag } from '../../domain/tag.js';
import { buildCreateTagDto, buildUpdateTagDto } from '../dto/tag.dto.js';
import { conflictError, notFoundError } from '../knowledge-errors.js';

export function createAsyncTagService({ repository, validateSpaceReference = null } = {}) {
  if (!repository) throw new TypeError('Async tag service requires a repository');

  async function requireTag(tagId) {
    const tag = await repository.findById(tagId);
    if (!tag) throw notFoundError('TAG_NOT_FOUND', 'Tag not found');
    return tag;
  }

  return {
    async createTag(input) {
      const dto = buildCreateTagDto(input);
      if (await repository.findById(dto.id)) {
        throw conflictError('TAG_ID_CONFLICT', 'A tag with the same id already exists');
      }
      await validateSpaceReference?.(dto.spaceId);
      return repository.save(new Tag(dto));
    },
    async updateTag(tagId, updates) {
      const currentTag = await requireTag(tagId);
      const dto = buildUpdateTagDto(updates);
      return repository.save(new Tag({
        ...currentTag,
        ...dto,
        id: currentTag.id,
        spaceId: currentTag.spaceId
      }));
    },
    async deleteTag(tagId) {
      const tag = await requireTag(tagId);
      await repository.delete(tagId);
      return tag;
    },
    listTags(options = {}) { return repository.list(options); }
  };
}
