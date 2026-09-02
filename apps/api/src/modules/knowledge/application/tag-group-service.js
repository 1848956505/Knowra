import { TagGroup } from '../domain/tag-group.js';
import { createInMemoryTagGroupRepository } from '../infrastructure/tag-group-repository.js';
import { buildCreateTagGroupDto, buildUpdateTagGroupDto } from './dto/tag-group.dto.js';
import { conflictError, notFoundError } from './knowledge-errors.js';

export function createTagGroupService({ repository = createInMemoryTagGroupRepository(), tagRepository, validateSpaceReference } = {}) {
  const requireGroup = (id) => {
    const group = repository.findById(id);
    if (!group) throw notFoundError('TAG_GROUP_NOT_FOUND', 'Tag group not found');
    return group;
  };
  const assertName = (spaceId, name, currentId = null) => {
    if (repository.list({ spaceId }).some((group) => group.id !== currentId && group.name.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase())) {
      throw conflictError('TAG_GROUP_NAME_CONFLICT', 'A tag group with the same name already exists');
    }
  };
  return {
    createTagGroup(input) {
      const dto = buildCreateTagGroupDto(input);
      validateSpaceReference?.(dto.spaceId);
      assertName(dto.spaceId, dto.name);
      return repository.save(new TagGroup(dto));
    },
    updateTagGroup(id, updates) {
      const current = requireGroup(id);
      const dto = buildUpdateTagGroupDto(updates);
      if (dto.name) assertName(current.spaceId, dto.name, id);
      if (dto.selectionMode && dto.selectionMode !== current.selectionMode && tagRepository?.list({ spaceId: current.spaceId }).some((tag) => tag.groupId === id)) {
        throw conflictError('TAG_GROUP_IN_USE', 'Remove or move tags before changing selection mode');
      }
      return repository.save(new TagGroup({ ...current, ...dto, id: current.id, spaceId: current.spaceId, updatedAt: new Date().toISOString() }));
    },
    deleteTagGroup(id) {
      const current = requireGroup(id);
      if (current.isSystem) throw conflictError('SYSTEM_TAG_GROUP_PROTECTED', 'System tag groups cannot be deleted');
      if (tagRepository?.list({ spaceId: current.spaceId }).some((tag) => tag.groupId === id)) {
        throw conflictError('TAG_GROUP_NOT_EMPTY', 'Move or delete tags before deleting this group');
      }
      repository.delete(id);
      return current;
    },
    listTagGroups(options = {}) { return repository.list(options); }
  };
}
