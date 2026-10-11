import { validationError } from '../knowledge-errors.js';

// 保留 PostgreSQL 批量读取与异步校验顺序。
export function createAsyncNavigationReferencePolicy({
  knowledgeSpaceRepository,
  folderRepository,
  tagRepository,
  tagGroupRepository
}) {
  async function assertSpaceReference(spaceId, entityName) {
    if (!spaceId || !(await knowledgeSpaceRepository.findById(spaceId))) {
      throw validationError(`${entityName}_SPACE_NOT_FOUND`, 'The referenced knowledge space does not exist');
    }
  }

  async function assertNoteReferences({ spaceId, folderId, tagIds }) {
    await assertSpaceReference(spaceId, 'NOTE');
    if (folderId) {
      const folder = await folderRepository.findById(folderId);
      if (!folder) throw validationError('NOTE_FOLDER_NOT_FOUND', 'The referenced folder does not exist');
      if (folder.spaceId !== spaceId) throw validationError('NOTE_FOLDER_SPACE_MISMATCH', 'The referenced folder belongs to another knowledge space');
    }
    const tags = await tagRepository.findByIds(tagIds ?? []);
    const tagMap = new Map(tags.map((tag) => [tag.id, tag]));
    for (const tagId of tagIds ?? []) {
      const tag = tagMap.get(tagId);
      if (!tag) throw validationError('NOTE_TAG_NOT_FOUND', 'A referenced tag does not exist');
      if (tag.spaceId !== spaceId) throw validationError('NOTE_TAG_SPACE_MISMATCH', 'A referenced tag belongs to another knowledge space');
    }
  }

  async function normalizeTagIds(tagIds) {
    const uniqueIds = [...new Set(tagIds)];
    const tags = await tagRepository.findByIds(uniqueIds);
    const byId = new Map(tags.map((tag) => [tag.id, tag]));
    const normalized = [];
    const singleIndexes = new Map();
    for (const tagId of uniqueIds) {
      const tag = byId.get(tagId);
      const group = tag?.groupId ? await tagGroupRepository.findById(tag.groupId) : null;
      if (group?.selectionMode === 'single') {
        const previous = singleIndexes.get(group.id);
        if (previous !== undefined) normalized[previous] = null;
        singleIndexes.set(group.id, normalized.length);
      }
      normalized.push(tagId);
    }
    return normalized.filter(Boolean);
  }

  async function assertTagGroupReference(groupId, spaceId) {
    if (!groupId) return;
    const group = await tagGroupRepository.findById(groupId);
    if (!group) throw validationError('TAG_GROUP_NOT_FOUND', 'The referenced tag group does not exist');
    if (group.spaceId !== spaceId) throw validationError('TAG_GROUP_SPACE_MISMATCH', 'The referenced tag group belongs to another knowledge space');
  }

  return { assertSpaceReference, assertNoteReferences, assertTagGroupReference, normalizeTagIds };
}
