import { TagGroup } from '../../domain/tag-group.js';
import { buildCreateTagGroupDto, buildUpdateTagGroupDto } from '../dto/tag-group.dto.js';
import { conflictError, notFoundError } from '../knowledge-errors.js';

export function createAsyncTagGroupService({ repository, tagRepository, validateSpaceReference }) {
  async function requireGroup(id) { const group = await repository.findById(id); if (!group) throw notFoundError('TAG_GROUP_NOT_FOUND', 'Tag group not found'); return group; }
  async function assertName(spaceId, name, currentId = null) { if ((await repository.list({ spaceId })).some((group) => group.id !== currentId && group.name.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase())) throw conflictError('TAG_GROUP_NAME_CONFLICT', 'A tag group with the same name already exists'); }
  return {
    async createTagGroup(input) { const dto = buildCreateTagGroupDto(input); await validateSpaceReference?.(dto.spaceId); await assertName(dto.spaceId, dto.name); return repository.save(new TagGroup(dto)); },
    async updateTagGroup(id, updates) { const current = await requireGroup(id); const dto = buildUpdateTagGroupDto(updates); if (dto.name) await assertName(current.spaceId, dto.name, id); if (dto.selectionMode && dto.selectionMode !== current.selectionMode && (await tagRepository.list({ spaceId: current.spaceId })).some((tag) => tag.groupId === id)) throw conflictError('TAG_GROUP_IN_USE', 'Remove or move tags before changing selection mode'); return repository.save(new TagGroup({ ...current, ...dto, id: current.id, spaceId: current.spaceId })); },
    async deleteTagGroup(id) { const current = await requireGroup(id); if (current.isSystem) throw conflictError('SYSTEM_TAG_GROUP_PROTECTED', 'System tag groups cannot be deleted'); if ((await tagRepository.list({ spaceId: current.spaceId })).some((tag) => tag.groupId === id)) throw conflictError('TAG_GROUP_NOT_EMPTY', 'Move or delete tags before deleting this group'); await repository.delete(id); return current; },
    listTagGroups(options = {}) { return repository.list(options); }
  };
}
