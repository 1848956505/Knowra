import {
  createTagService,
  type TagService,
  type TagServiceOptions,
  type TagServiceRepository
} from '../src/modules/knowledge/application/tag-service.ts';
import {
  createTagGroupService,
  type TagGroupService,
  type TagGroupServiceOptions,
  type TagGroupServiceRepository
} from '../src/modules/knowledge/application/tag-group-service.ts';
import { Tag } from '../src/modules/knowledge/domain/tag.ts';
import { TagGroup } from '../src/modules/knowledge/domain/tag-group.ts';
import { createInMemoryTagRepository, type TagRecord } from '../src/modules/knowledge/infrastructure/tag-repository.ts';
import {
  createInMemoryTagGroupRepository,
  type TagGroupRecord
} from '../src/modules/knowledge/infrastructure/tag-group-repository.ts';

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2 ? true : false;
type Assert<Value extends true> = Value;

const tags = createTagService();
const groups = createTagGroupService();
const _tag = tags.createTag({ spaceId: 'space', name: 'tag', color: {} });
const _group = groups.createTagGroup({ spaceId: 'space', name: 'group', selectionMode: {} });
const _defaultTags = createTagService({ repository: undefined, validateSpaceReference: null });
const _defaultGroups = createTagGroupService({ tagRepository: null, validateSpaceReference: null });
const tagRepository = createInMemoryTagRepository();
const groupRepository = createInMemoryTagGroupRepository();
const _realTags = createTagService({ repository: tagRepository });
const _realGroups = createTagGroupService({ repository: groupRepository, tagRepository });
const _emptyTags = createTagService({});
const _emptyGroups = createTagGroupService({});

declare const record: TagRecord;
declare const group: TagGroupRecord;
record.color = { unvalidated: true };
group.selectionMode = { unvalidated: true };
record.name = 'mutable';
group.name = 'mutable';
const enriched = { id: 'id', spaceId: 'space', name: 'name', marker: 42 };
const customTags = createTagService({
  repository: {
    findById: () => enriched,
    list: () => [enriched],
    save: () => 17,
    delete: () => false
  },
  validateSpaceReference: spaceId => spaceId.length,
  validateGroupReference: (groupId, spaceId) => ({ groupId, spaceId })
});
const customGroups = createTagGroupService({
  repository: {
    findById: () => enriched,
    list: () => [enriched],
    create: () => 'created',
    save: () => false,
    delete: () => null
  },
  tagRepository: { list: () => [{ groupId: { legacy: true } }] },
  validateSpaceReference: () => ({ arbitrary: true })
});
const _made = customTags.createTag();
const _updated = customTags.updateTag(undefined);
const _deleted = customTags.deleteTag(null);
const _reordered = customTags.reorderTags(['id', null, undefined]);
const _listed = customTags.listTags({ spaceId: null });
const _groupCreated = customGroups.createTagGroup();
const _groupUpdated = customGroups.updateTagGroup(undefined);
const _groupDeleted = customGroups.deleteTagGroup(null);
const _groupListed = customGroups.listTagGroups();

declare const broadOptions: TagServiceOptions;
declare const broadGroupOptions: TagGroupServiceOptions;
const _broad = createTagService(broadOptions);
const _broadGroup = createTagGroupService(broadGroupOptions);
const _nullableCallbacks = createTagService({ validateSpaceReference: null, validateGroupReference: null });
const _nullableRepository = createTagGroupService({ tagRepository: null });
const _noResult = createTagService({
  repository: { findById: () => record, list: () => [record], save: () => undefined, delete: () => undefined }
});
const _asyncResults = createTagGroupService({
  repository: {
    findById: () => group,
    list: () => [group],
    create: () => Promise.resolve(42),
    save: () => Promise.resolve('saved'),
    delete: () => undefined
  }
});

export type TagServiceAssertions = [
  Assert<Equal<{ save: (tag: Tag) => unknown } extends Pick<TagServiceRepository, 'save'> ? true : false, false>>,
  Assert<
    Equal<
      { create: (group: TagGroup) => unknown } extends Pick<TagGroupServiceRepository, 'create'> ? true : false,
      false
    >
  >,
  Assert<
    Equal<{ save: (group: TagGroup) => unknown } extends Pick<TagGroupServiceRepository, 'save'> ? true : false, false>
  >,
  Assert<
    Equal<{ findById: (id: string) => TagRecord } extends Pick<TagServiceRepository, 'findById'> ? true : false, false>
  >,
  Assert<Equal<{ delete: (id: string) => unknown } extends Pick<TagServiceRepository, 'delete'> ? true : false, false>>,
  Assert<
    Equal<
      { findById: (id: string) => TagGroupRecord } extends Pick<TagGroupServiceRepository, 'findById'> ? true : false,
      false
    >
  >,
  Assert<
    Equal<{ delete: (id: string) => unknown } extends Pick<TagGroupServiceRepository, 'delete'> ? true : false, false>
  >,
  Assert<
    Equal<
      { list: (options: { spaceId: 's' }) => TagRecord[] } extends Pick<TagServiceRepository, 'list'> ? true : false,
      false
    >
  >,
  Assert<Equal<typeof _tag, Tag<unknown>>>,
  Assert<Equal<typeof _group, TagGroupRecord>>,
  Assert<Equal<typeof tags, TagService<TagRecord, TagRecord>>>,
  Assert<Equal<typeof groups, TagGroupService<TagGroupRecord, TagGroupRecord, TagGroupRecord>>>,
  Assert<Equal<typeof _defaultTags, typeof tags>>,
  Assert<Equal<typeof _defaultGroups, typeof groups>>,
  Assert<Equal<typeof _emptyTags, typeof tags>>,
  Assert<Equal<typeof _emptyGroups, typeof groups>>,
  Assert<Equal<typeof _realTags, typeof tags>>,
  Assert<Equal<typeof _realGroups, typeof groups>>,
  Assert<Equal<typeof _made, Tag<unknown>>>,
  Assert<Equal<typeof _updated, Tag<unknown>>>,
  Assert<Equal<typeof _deleted, typeof enriched>>,
  Assert<Equal<typeof _reordered, number[]>>,
  Assert<Equal<typeof _listed, (typeof enriched)[]>>,
  Assert<Equal<typeof _groupCreated, string>>,
  Assert<Equal<typeof _groupUpdated, boolean>>,
  Assert<Equal<typeof _groupDeleted, typeof enriched>>,
  Assert<Equal<typeof _groupListed, (typeof enriched)[]>>,
  Assert<Equal<typeof _broad, TagService>>,
  Assert<Equal<typeof _broadGroup, TagGroupService>>,
  Assert<Equal<ReturnType<typeof createTagService>, TagService>>,
  Assert<Equal<ReturnType<typeof createTagGroupService>, TagGroupService>>,
  Assert<Equal<Parameters<typeof createTagService>[0], TagServiceOptions | undefined>>,
  Assert<Equal<Parameters<typeof createTagGroupService>[0], TagGroupServiceOptions | undefined>>,
  Assert<Equal<ReturnType<TagService['createTag']>['color'], unknown>>,
  Assert<Equal<ReturnType<TagService['updateTag']>['color'], unknown>>,
  Assert<Equal<ReturnType<TagGroupService['createTagGroup']>, unknown>>,
  Assert<Equal<ReturnType<TagGroupService['updateTagGroup']>, unknown>>,
  Assert<Equal<ReturnType<TagService['reorderTags']>, unknown[]>>,
  Assert<Equal<ReturnType<TagService['deleteTag']>, TagRecord>>,
  Assert<Equal<ReturnType<TagGroupService['deleteTagGroup']>, TagGroupRecord>>,
  Assert<Equal<ReturnType<TagServiceRepository['save']>, unknown>>,
  Assert<Equal<ReturnType<TagGroupServiceRepository['create']>, unknown>>,
  Assert<Equal<ReturnType<TagGroupServiceRepository['save']>, unknown>>,
  Assert<Equal<ReturnType<TagServiceRepository['delete']>, unknown>>,
  Assert<Equal<ReturnType<TagGroupServiceRepository['delete']>, unknown>>,
  Assert<Equal<Parameters<TagServiceRepository['save']>[0], Tag<unknown>>>,
  Assert<Equal<Parameters<TagGroupServiceRepository['create']>[0], TagGroup<unknown>>>,
  Assert<Equal<Parameters<TagGroupServiceRepository['save']>[0], TagGroup<unknown>>>,
  Assert<Equal<Parameters<NonNullable<TagServiceOptions['validateGroupReference']>>[0], string | null>>,
  Assert<Equal<ReturnType<NonNullable<TagServiceOptions['validateSpaceReference']>>, unknown>>,
  Assert<Equal<ReturnType<NonNullable<TagGroupServiceOptions['validateSpaceReference']>>, unknown>>,
  Assert<Equal<typeof _nullableCallbacks, typeof tags>>,
  Assert<Equal<typeof _nullableRepository, typeof groups>>,
  Assert<Equal<ReturnType<typeof _noResult.reorderTags>, undefined[]>>,
  Assert<Equal<ReturnType<typeof _asyncResults.createTagGroup>, Promise<number>>>,
  Assert<Equal<ReturnType<typeof _asyncResults.updateTagGroup>, Promise<string>>>
];
