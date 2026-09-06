export const DEFAULT_TAG_GROUP_DEFINITIONS = Object.freeze([
  Object.freeze({ code: 'ordinary', name: '普通标签', selectionMode: 'multiple' }),
  Object.freeze({ code: 'mastery', name: '掌握程度', selectionMode: 'single' }),
  Object.freeze({ code: 'importance', name: '重要程度', selectionMode: 'single' }),
  Object.freeze({ code: 'purpose', name: '用途', selectionMode: 'multiple' })
]);

export function buildDefaultTagGroups(spaceId) {
  return DEFAULT_TAG_GROUP_DEFINITIONS.map((definition, index) => ({
    id: `tag-group-${spaceId}-${definition.code}`,
    spaceId,
    ...definition,
    isSystem: true,
    sortOrder: index + 1
  }));
}
