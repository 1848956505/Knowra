import {
  buildCreateFolderDto,
  buildUpdateFolderDto,
  type FolderDtoInput,
  type CreateFolderDto,
  type UpdateFolderDto
} from '../src/modules/knowledge/application/dto/folder.dto.js';
import {
  buildCreateTagGroupDto,
  buildUpdateTagGroupDto,
  type TagGroupDtoInput,
  type CreateTagGroupDto,
  type UpdateTagGroupDto
} from '../src/modules/knowledge/application/dto/tag-group.dto.js';
import { Folder } from '../src/modules/knowledge/domain/folder.js';
import { TagGroup, type TagGroupConstructorInput } from '../src/modules/knowledge/domain/tag-group.js';
import {
  createInMemoryTagGroupRepository,
  type TagGroupRecord,
  type TagGroupRepository
} from '../src/modules/knowledge/infrastructure/tag-group-repository.js';

type Assert<T extends true> = T;
type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
declare const unknownValue: unknown;
const _folder = buildCreateFolderDto({
  id: unknownValue,
  name: unknownValue,
  spaceId: unknownValue,
  parentId: unknownValue,
  pathCache: unknownValue
});
const _folderUpdate = buildUpdateFolderDto({ name: unknownValue, parentId: unknownValue, pathCache: unknownValue });
const _normalizedFolder = new Folder({ ..._folder, pathCache: '/rebuilt-by-service' });
// @ts-expect-error 原 DTO 没有校验 pathCache，不能冒充规范 Folder 构造输入。
new Folder(_folder);
// @ts-expect-error unknown pathCache 不能冒充字符串。
const _path: string = _folder.pathCache;
const _groupDto = buildCreateTagGroupDto({
  id: unknownValue,
  spaceId: unknownValue,
  code: unknownValue,
  name: unknownValue,
  selectionMode: unknownValue,
  isSystem: unknownValue,
  sortOrder: unknownValue
});
const _groupUpdate = buildUpdateTagGroupDto({
  name: unknownValue,
  selectionMode: unknownValue,
  sortOrder: unknownValue
});
const _group = new TagGroup(_groupDto);
const _repository = createInMemoryTagGroupRepository();
const _saved = _repository.create(_group);
const _updated = _repository.save(new TagGroup({ ..._group, ..._groupUpdate }));
const _directUnknown = new TagGroup({ id: 'id', spaceId: 'space', name: 'name', selectionMode: unknownValue });
const _default = new TagGroup({ id: 'id', spaceId: 'space', name: 'name' });
const _number = new TagGroup<number>({ id: 'id', spaceId: 'space', name: 'name', selectionMode: 2 });
const _never = new TagGroup<never>({ id: 'id', spaceId: 'space', name: 'name' });
const _null = new TagGroup<null>({ id: 'id', spaceId: 'space', name: 'name', selectionMode: null });
const _undefined = new TagGroup<undefined>({ id: 'id', spaceId: 'space', name: 'name', selectionMode: undefined });
const _oldInput: TagGroupConstructorInput = {
  id: 'id',
  spaceId: 'space',
  name: 'name',
  selectionMode: 'single',
  createdAt: null,
  updatedAt: null
};
const _oldModel: TagGroup = new TagGroup(_oldInput);
const _oldRecord: TagGroupRecord = _oldModel;
_repository.save(_oldRecord);
_repository.create({ id: 'minimal', spaceId: 'space', name: 'name' });
_repository.save({ id: 'historical', spaceId: 'space', name: 'name', selectionMode: unknownValue });
// @ts-expect-error unknown 结果不变成默认规范模型。
const _narrowModel: TagGroup = _group;
// @ts-expect-error 动态 includes 的返回值不证明枚举或字符串。
const _selection: string = _groupDto.selectionMode;
// @ts-expect-error 默认输入类型继续拒绝非字符串。
const _invalidDefault: TagGroupConstructorInput = { id: 'id', spaceId: 'space', name: 'name', selectionMode: 2 };
// @ts-expect-error 已有必填字段没有被弱化。
_repository.create({ name: 'missing-identity' });

interface OriginalTagGroupConstructorInput {
  id: string;
  spaceId: string;
  code?: string | null;
  name: string;
  selectionMode?: string;
  isSystem?: unknown;
  sortOrder?: unknown;
  createdAt?: string | null;
  updatedAt?: string | null;
}
export type MetadataDtoContracts = [
  Assert<Equal<Parameters<typeof buildCreateFolderDto>[0], FolderDtoInput | undefined>>,
  Assert<Equal<Parameters<typeof buildUpdateFolderDto>[0], FolderDtoInput | undefined>>,
  Assert<Equal<Parameters<typeof buildCreateTagGroupDto>[0], TagGroupDtoInput | undefined>>,
  Assert<Equal<Parameters<typeof buildUpdateTagGroupDto>[0], TagGroupDtoInput | undefined>>,
  Assert<Equal<typeof _folder, CreateFolderDto>>,
  Assert<Equal<typeof _folderUpdate, UpdateFolderDto>>,
  Assert<Equal<typeof _folder.pathCache, unknown>>,
  Assert<Equal<typeof _folder.parentId, string | null>>,
  Assert<Equal<typeof _folderUpdate.name, string | undefined>>,
  Assert<Equal<typeof _normalizedFolder.pathCache, string | null>>,
  Assert<Equal<typeof _groupDto, CreateTagGroupDto>>,
  Assert<Equal<typeof _groupUpdate, UpdateTagGroupDto>>,
  Assert<Equal<typeof _groupDto.selectionMode, unknown>>,
  Assert<Equal<typeof _groupDto.code, string | null>>,
  Assert<Equal<typeof _groupDto.isSystem, boolean>>,
  Assert<Equal<typeof _groupDto.sortOrder, number>>,
  Assert<Equal<typeof _group, TagGroup<unknown>>>,
  Assert<Equal<typeof _group.selectionMode, unknown>>,
  Assert<Equal<typeof _directUnknown.selectionMode, unknown>>,
  Assert<Equal<typeof _default.selectionMode, string>>,
  Assert<Equal<typeof _number.selectionMode, number | string>>,
  Assert<Equal<typeof _never.selectionMode, string>>,
  Assert<Equal<typeof _null.selectionMode, null | string>>,
  Assert<Equal<typeof _undefined.selectionMode, undefined | string>>,
  Assert<Equal<TagGroup['selectionMode'], string>>,
  Assert<Equal<TagGroupConstructorInput, OriginalTagGroupConstructorInput>>,
  Assert<Equal<TagGroupConstructorInput<never>['selectionMode'], string | undefined>>,
  Assert<Equal<TagGroupConstructorInput<unknown>['selectionMode'], unknown>>,
  Assert<Equal<TagGroupRecord['selectionMode'], unknown>>,
  Assert<Equal<typeof _repository, TagGroupRepository>>,
  Assert<Equal<typeof _saved, TagGroupRecord>>,
  Assert<Equal<typeof _updated, TagGroupRecord>>,
  Assert<
    Equal<
      Omit<TagGroupRecord, 'selectionMode'>,
      Omit<
        Pick<TagGroup, 'id' | 'spaceId' | 'name'> & Partial<Omit<TagGroup, 'id' | 'spaceId' | 'name'>>,
        'selectionMode'
      >
    >
  >,
  Assert<Equal<ConstructorParameters<typeof TagGroup<string>>[0], OriginalTagGroupConstructorInput>>
];
