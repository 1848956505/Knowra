const DEFAULT_TAG_GROUPS = [
  { code: 'ordinary', name: '普通标签', selectionMode: 'multiple', isSystem: true },
  { code: 'mastery', name: '掌握程度', selectionMode: 'single', isSystem: true },
  { code: 'importance', name: '重要程度', selectionMode: 'single', isSystem: true },
  { code: 'purpose', name: '用途', selectionMode: 'multiple', isSystem: true }
];

const DEFAULT_SYSTEM_TAGS = {
  mastery: [
    { code: 'not-mastered', name: '未掌握' },
    { code: 'fuzzy', name: '模糊' },
    { code: 'mastered', name: '已掌握' }
  ],
  importance: [
    { code: 'important', name: '重点' },
    { code: 'normal', name: '一般' },
    { code: 'skippable', name: '可跳过' }
  ],
  purpose: [
    { code: 'questionable', name: '可出题' },
    { code: 'memorize', name: '需背诵' },
    { code: 'understand', name: '需理解' },
    { code: 'mistake-prone', name: '易错' }
  ]
};

export function createKnowledgePointTagGroupManager({ tagRepository, tagGroupRepository }) {
  function groupIdFor(spaceId, code) {
    return `tag-group-${spaceId}-${code}`;
  }

  function systemTagIdFor(spaceId, groupCode, tagCode) {
    return `tag-${spaceId}-${groupCode}-${tagCode}`;
  }

  function ensureDefaults(spaceId) {
    if (!spaceId?.trim()) {
      throw new Error('spaceId is required');
    }

    DEFAULT_TAG_GROUPS.forEach((group, index) => {
      const id = groupIdFor(spaceId, group.code);
      if (!tagGroupRepository.findById(id)) {
        tagGroupRepository.save({
          id,
          spaceId,
          ...group,
          sortOrder: index + 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }
    });

    Object.entries(DEFAULT_SYSTEM_TAGS).forEach(([groupCode, tags]) => {
      tags.forEach((tag, index) => {
        const id = systemTagIdFor(spaceId, groupCode, tag.code);
        if (!tagRepository.findById(id)) {
          tagRepository.save({
            id,
            spaceId,
            groupId: groupIdFor(spaceId, groupCode),
            ...tag,
            color: groupCode,
            isSystem: true,
            sortOrder: index + 1,
            createdAt: new Date().toISOString()
          });
        }
      });
    });
  }

  return {
    listGroups(spaceId) {
      ensureDefaults(spaceId);
      return tagGroupRepository
        .list((group) => group.spaceId === spaceId)
        .sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0))
        .map((group) => ({
          ...group,
          tags: tagRepository
            .list({ spaceId })
            .filter((tag) => tag.groupId === group.id)
            .sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0))
        }));
    },
    validateSelection({ spaceId, tagIds = [] }) {
      ensureDefaults(spaceId);
      const grouped = new Map();

      [...new Set(tagIds.filter(Boolean))].forEach((tagId) => {
        const tag = tagRepository.findById(tagId);
        if (!tag?.groupId) {
          return;
        }
        const tagGroup = tagGroupRepository.findById(tag.groupId);
        if (!tagGroup) {
          return;
        }
        const values = grouped.get(tagGroup.id) ?? [];
        values.push(tagId);
        grouped.set(tagGroup.id, values);
        if (tagGroup.selectionMode === 'single' && values.length > 1) {
          throw new Error(`Single-select tag group ${tagGroup.code} can contain only one tag`);
        }
      });
    }
  };
}
