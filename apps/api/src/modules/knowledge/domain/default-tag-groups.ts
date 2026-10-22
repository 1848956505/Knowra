import type { TagGroupSelectionMode } from './tag-group.ts';

export interface DefaultTagGroupDefinition {
  readonly code: string;
  readonly name: string;
  readonly selectionMode: TagGroupSelectionMode;
}

export interface DefaultTagGroup {
  id: string;
  spaceId: string;
  code: string;
  name: string;
  selectionMode: TagGroupSelectionMode;
  isSystem: boolean;
  sortOrder: number;
}

export const DEFAULT_TAG_GROUP_DEFINITIONS: readonly DefaultTagGroupDefinition[] = Object.freeze([
  Object.freeze({ code: 'ordinary', name: '普通标签', selectionMode: 'multiple' }),
  Object.freeze({ code: 'mastery', name: '掌握程度', selectionMode: 'single' }),
  Object.freeze({ code: 'importance', name: '重要程度', selectionMode: 'single' }),
  Object.freeze({ code: 'purpose', name: '用途', selectionMode: 'multiple' })
]);

export function buildDefaultTagGroups(spaceId: string): DefaultTagGroup[] {
  return DEFAULT_TAG_GROUP_DEFINITIONS.map((definition, index) => ({
    id: `tag-group-${spaceId}-${definition.code}`,
    spaceId,
    ...definition,
    isSystem: true,
    sortOrder: index + 1
  }));
}
