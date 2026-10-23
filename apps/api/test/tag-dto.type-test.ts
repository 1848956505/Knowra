import {
  buildCreateTagDto,
  buildUpdateTagDto,
  type TagDtoInput,
  type CreateTagDto,
  type UpdateTagDto
} from '../src/modules/knowledge/application/dto/tag.dto.js';
import { Tag, type TagConstructorInput } from '../src/modules/knowledge/domain/tag.js';
import {
  createInMemoryTagRepository,
  type TagRecord,
  type TagRepository
} from '../src/modules/knowledge/infrastructure/tag-repository.js';

type Assert<T extends true> = T;
type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
type IsAny<T> = 0 extends 1 & T ? true : false;
declare const unknownValue: unknown;
const _dto = buildCreateTagDto({
  id: unknownValue,
  spaceId: unknownValue,
  name: unknownValue,
  color: unknownValue,
  groupId: unknownValue,
  code: unknownValue,
  isSystem: unknownValue,
  sortOrder: unknownValue
});
const _update = buildUpdateTagDto({
  name: unknownValue,
  color: unknownValue,
  groupId: unknownValue,
  sortOrder: unknownValue
});
const _model = new Tag(_dto);
const _repository = createInMemoryTagRepository();
const _saved = _repository.save(_model);
const _updated = _repository.save(new Tag({ ..._saved, ..._update, id: _saved.id, spaceId: _saved.spaceId }));
const _reordered = _repository.save(new Tag({ ..._saved, sortOrder: 1, updatedAt: new Date().toISOString() }));
const _directUnknown = new Tag({ id: 'id', spaceId: 'space', name: 'name', color: unknownValue });
const _default = new Tag({ id: 'id', spaceId: 'space', name: 'name' });
const _null = new Tag({ id: 'id', spaceId: 'space', name: 'name', color: null });
const _object = new Tag({ id: 'id', spaceId: 'space', name: 'name', color: { legacy: true } });
const _number = new Tag<number>({ id: 'id', spaceId: 'space', name: 'name', color: 2 });
const _never = new Tag<never>({ id: 'id', spaceId: 'space', name: 'name' });
const _undefined = new Tag<undefined>({ id: 'id', spaceId: 'space', name: 'name', color: undefined });
const _oldInput: TagConstructorInput = {
  id: 'id',
  spaceId: 'space',
  name: 'name',
  color: null,
  createdAt: null,
  updatedAt: null
};
const _oldModel: Tag = new Tag(_oldInput);
const _oldRecord: TagRecord = _oldModel;
_repository.save(_oldRecord);
_repository.save({ id: 'minimum', spaceId: 'space', name: 'name' });
_repository.save({ id: 'historical', spaceId: 'space', name: 'name', color: unknownValue });
// @ts-expect-error 动态 has 不能证明颜色是字符串。
const _narrowColor: string = _dto.color;
// @ts-expect-error unknown 结果不能冒充默认规范模型。
const _narrowModel: Tag = _model;
// @ts-expect-error 直接读取历史颜色不能当作已验证字符串。
const _narrowRecordColor: string | null | undefined = _saved.color;
// @ts-expect-error 默认输入契约仍拒绝非字符串且非 null 的颜色。
const _invalidDefault: TagConstructorInput = { id: 'id', spaceId: 'space', name: 'name', color: 2 };
// @ts-expect-error DTO 未证明默认模型的颜色契约。
const _invalidInput: TagConstructorInput = _dto;
// @ts-expect-error 其他必填标识契约没有弱化。
_repository.save({ name: 'missing-identity' });
// @ts-expect-error 单独指定 number 不接受 null，只保留原字符串默认路径。
new Tag<number>({ id: 'id', spaceId: 'space', name: 'name', color: null });

interface OriginalTagConstructorInput {
  id: string;
  spaceId: string;
  name: string;
  color?: string | null;
  groupId?: string | null;
  code?: string | null;
  isSystem?: unknown;
  sortOrder?: unknown;
  createdAt?: string | null;
  updatedAt?: string | null;
}
export type TagDtoContracts = [
  Assert<Equal<Parameters<typeof buildCreateTagDto>[0], TagDtoInput | undefined>>,
  Assert<Equal<Parameters<typeof buildUpdateTagDto>[0], TagDtoInput | undefined>>,
  Assert<Equal<typeof _dto, CreateTagDto>>,
  Assert<Equal<typeof _update, UpdateTagDto>>,
  Assert<Equal<typeof _dto.id, string>>,
  Assert<Equal<typeof _dto.spaceId, string>>,
  Assert<Equal<typeof _dto.name, string>>,
  Assert<Equal<typeof _dto.color, unknown>>,
  Assert<Equal<typeof _dto.groupId, string | null>>,
  Assert<Equal<typeof _dto.code, string | null>>,
  Assert<Equal<typeof _dto.isSystem, boolean>>,
  Assert<Equal<typeof _dto.sortOrder, number>>,
  Assert<Equal<typeof _update.name, string | undefined>>,
  Assert<Equal<typeof _update.color, unknown>>,
  Assert<Equal<typeof _update.groupId, string | null | undefined>>,
  Assert<Equal<typeof _update.sortOrder, number | undefined>>,
  Assert<Equal<typeof _model, Tag<unknown>>>,
  Assert<Equal<typeof _model.color, unknown>>,
  Assert<Equal<typeof _directUnknown, Tag<unknown>>>,
  Assert<Equal<typeof _default, Tag<string | null>>>,
  Assert<Equal<typeof _default.color, string | null>>,
  Assert<Equal<typeof _null.color, string | null>>,
  Assert<Equal<typeof _object.color, { legacy: boolean } | string>>,
  Assert<Equal<typeof _number.color, number | string>>,
  Assert<Equal<typeof _never.color, string>>,
  Assert<Equal<typeof _undefined.color, string | undefined>>,
  Assert<Equal<Tag['color'], string | null>>,
  Assert<Equal<TagConstructorInput, OriginalTagConstructorInput>>,
  Assert<Equal<ConstructorParameters<typeof Tag<string | null>>[0], OriginalTagConstructorInput>>,
  Assert<Equal<TagConstructorInput<never>['color'], string | undefined>>,
  Assert<Equal<TagConstructorInput<unknown>['color'], unknown>>,
  Assert<Equal<TagRecord['color'], unknown>>,
  Assert<Equal<typeof _repository, TagRepository>>,
  Assert<Equal<typeof _saved, TagRecord>>,
  Assert<Equal<typeof _updated, TagRecord>>,
  Assert<Equal<typeof _reordered, TagRecord>>,
  Assert<
    Equal<
      Omit<TagRecord, 'color'>,
      Omit<Pick<Tag, 'id' | 'spaceId' | 'name'> & Partial<Omit<Tag, 'id' | 'spaceId' | 'name'>>, 'color'>
    >
  >,
  Assert<Equal<Omit<Tag<unknown>, 'color'>, Omit<Tag, 'color'>>>,
  Assert<Equal<IsAny<typeof _dto.color>, false>>,
  Assert<Equal<IsAny<typeof _model.color>, false>>,
  Assert<Equal<IsAny<TagRecord['color']>, false>>
];
