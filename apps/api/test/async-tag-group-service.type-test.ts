import { createAsyncTagGroupService } from '../src/modules/knowledge/application/postgres-async/tag-group-service.ts';
import { createAsyncTagGroupService as bridgeCreateAsyncTagGroupService } from '../src/modules/knowledge/application/postgres-async/tag-group-service.js';
import type {
  AsyncTagGroupRepository,
  AsyncTagGroupService,
  AsyncTagGroupServiceOptions,
  MaybePromise
} from '../src/modules/knowledge/application/postgres-async/tag-group-service.ts';
import type { TagGroup } from '../src/modules/knowledge/domain/tag-group.ts';
import type { TagGroupDtoInput } from '../src/modules/knowledge/application/dto/tag-group.dto.ts';
import type {
  TagGroupListOptions,
  TagGroupRecord
} from '../src/modules/knowledge/infrastructure/tag-group-repository.ts';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
interface ReadRecord extends TagGroupRecord {
  marker: 'record';
}
declare const record: ReadRecord;
declare const records: ReadRecord[];
declare const readonlyRecords: readonly ReadRecord[];
declare const readonlyTags: readonly { groupId?: unknown }[];
declare const promisedRecords: Promise<ReadRecord[]>;
declare const thenableRecords: PromiseLike<readonly ReadRecord[]>;

const sync = createAsyncTagGroupService({
  repository: {
    findById: (_id: string | null | undefined) => record,
    list: () => records,
    create: (_group: TagGroup<unknown>) => ({ created: 'yes' }),
    save: (_group: TagGroup<unknown>) => 42,
    delete: (_id: string | null | undefined) => undefined
  },
  tagRepository: { list: () => [] },
  validateSpaceReference: null
});
export type SyncCreate = Assert<Equal<ReturnType<typeof sync.createTagGroup>, Promise<{ created: string }>>>;
export type SyncSave = Assert<Equal<ReturnType<typeof sync.updateTagGroup>, Promise<number>>>;
export type SyncDelete = Assert<Equal<ReturnType<typeof sync.deleteTagGroup>, Promise<ReadRecord>>>;
export type SyncList = Assert<Equal<ReturnType<typeof sync.listTagGroups>, ReadRecord[]>>;

const asyncService = createAsyncTagGroupService({
  repository: {
    findById: async (_id: string | null | undefined) => record,
    list: () => promisedRecords,
    create: async (_group: TagGroup<unknown>) => ({ created: 'yes' }),
    save: async (_group: TagGroup<unknown>) => 42,
    delete: async (_id: string | null | undefined) => 'ignored delete result'
  },
  tagRepository: { list: async () => [{ groupId: Symbol('opaque') }] },
  validateSpaceReference: async (_spaceId: string) => undefined
});
export type AsyncCreate = Assert<Equal<ReturnType<typeof asyncService.createTagGroup>, Promise<{ created: string }>>>;
export type AsyncSave = Assert<Equal<ReturnType<typeof asyncService.updateTagGroup>, Promise<number>>>;
export type AsyncDelete = Assert<Equal<ReturnType<typeof asyncService.deleteTagGroup>, Promise<ReadRecord>>>;
export type AsyncList = Assert<Equal<ReturnType<typeof asyncService.listTagGroups>, Promise<ReadRecord[]>>>;

declare const thenableOptions: AsyncTagGroupServiceOptions<
  ReadRecord,
  PromiseLike<PromiseLike<string>>,
  PromiseLike<Promise<boolean>>,
  typeof thenableRecords
>;
const thenableService = createAsyncTagGroupService(thenableOptions);
const bridgeThenableService = bridgeCreateAsyncTagGroupService(thenableOptions);
export type ThenableCreate = Assert<Equal<ReturnType<typeof thenableService.createTagGroup>, Promise<string>>>;
export type ThenableSave = Assert<Equal<ReturnType<typeof thenableService.updateTagGroup>, Promise<boolean>>>;
export type ThenableDelete = Assert<Equal<ReturnType<typeof thenableService.deleteTagGroup>, Promise<ReadRecord>>>;
export type ThenableList = Assert<
  Equal<ReturnType<typeof thenableService.listTagGroups>, PromiseLike<readonly ReadRecord[]>>
>;
export type BridgeShape = Assert<Equal<typeof bridgeCreateAsyncTagGroupService, typeof createAsyncTagGroupService>>;
export type BridgeThenableShape = Assert<Equal<typeof bridgeThenableService, typeof thenableService>>;

const readonlyService = createAsyncTagGroupService({
  repository: {
    findById: () => record,
    list: () => readonlyRecords,
    create: () => undefined,
    save: () => null,
    delete: () => false
  },
  tagRepository: { list: () => readonlyTags }
});
export type ReadonlyList = Assert<Equal<ReturnType<typeof readonlyService.listTagGroups>, readonly ReadRecord[]>>;
export type UndefinedCreate = Assert<Equal<ReturnType<typeof readonlyService.createTagGroup>, Promise<undefined>>>;
export type NullSave = Assert<Equal<ReturnType<typeof readonlyService.updateTagGroup>, Promise<null>>>;

declare const fallback: AsyncTagGroupService;
export type DefaultCreate = Assert<Equal<ReturnType<typeof fallback.createTagGroup>, Promise<unknown>>>;
export type DefaultSave = Assert<Equal<ReturnType<typeof fallback.updateTagGroup>, Promise<unknown>>>;
export type DefaultDelete = Assert<Equal<ReturnType<typeof fallback.deleteTagGroup>, Promise<TagGroupRecord>>>;
export type DefaultList = Assert<
  Equal<ReturnType<typeof fallback.listTagGroups>, MaybePromise<readonly TagGroupRecord[]>>
>;
export type CreateArguments = Assert<
  Equal<Parameters<typeof fallback.createTagGroup>, [input?: TagGroupDtoInput | undefined]>
>;
export type UpdateArguments = Assert<
  Equal<
    Parameters<typeof fallback.updateTagGroup>,
    [id: string | null | undefined, updates?: TagGroupDtoInput | undefined]
  >
>;
export type DeleteArguments = Assert<
  Equal<Parameters<typeof fallback.deleteTagGroup>, [id: string | null | undefined]>
>;
export type ListArguments = Assert<
  Equal<Parameters<typeof fallback.listTagGroups>, [options?: TagGroupListOptions | undefined]>
>;
export type CreatePortArgument = Assert<
  Equal<Parameters<AsyncTagGroupRepository['create']>, [group: TagGroup<unknown>]>
>;
export type SavePortArgument = Assert<Equal<Parameters<AsyncTagGroupRepository['save']>, [group: TagGroup<unknown>]>>;
export type FindPortResult = Assert<
  Equal<ReturnType<AsyncTagGroupRepository['findById']>, MaybePromise<TagGroupRecord | null | undefined>>
>;
export type TagReferenceResult = Assert<
  Equal<
    ReturnType<AsyncTagGroupServiceOptions['tagRepository']['list']>,
    MaybePromise<readonly { groupId?: unknown }[]>
  >
>;

// 记录自身也可能是 thenable；真正的 async 返回值不会把它误报为未展开对象。
interface ThenableRecord extends TagGroupRecord, PromiseLike<ReadRecord> {
  outerMarker: 'thenable-record';
}
declare const assimilationOptions: AsyncTagGroupServiceOptions<
  ThenableRecord,
  string | PromiseLike<number>,
  PromiseLike<PromiseLike<null>>,
  readonly ThenableRecord[]
>;
const assimilation = createAsyncTagGroupService(assimilationOptions);
export type AssimilatedRecord = Assert<Equal<ReturnType<typeof assimilation.deleteTagGroup>, Promise<ReadRecord>>>;
export type AssimilatedCreate = Assert<Equal<ReturnType<typeof assimilation.createTagGroup>, Promise<string | number>>>;
export type AssimilatedSave = Assert<Equal<ReturnType<typeof assimilation.updateTagGroup>, Promise<null>>>;
export type UnassimilatedList = Assert<Equal<ReturnType<typeof assimilation.listTagGroups>, readonly ThenableRecord[]>>;

// 泛型调用方保留 Awaited，不依赖具体测试结果碰巧不是 thenable。
export function abstractContract<
  Record extends TagGroupRecord,
  Created,
  Saved,
  Listed extends MaybePromise<readonly Record[]>
>(options: AsyncTagGroupServiceOptions<Record, Created, Saved, Listed>) {
  const service = createAsyncTagGroupService(options);
  const created: Promise<Awaited<Created>> = service.createTagGroup();
  const saved: Promise<Awaited<Saved>> = service.updateTagGroup(undefined);
  const deleted: Promise<Awaited<Record>> = service.deleteTagGroup(null);
  const listed: Listed = service.listTagGroups();
  return { created, saved, deleted, listed };
}

sync.createTagGroup();
sync.createTagGroup({ name: 'Name', spaceId: 's', selectionMode: Symbol('unvalidated') });
sync.updateTagGroup(null);
sync.updateTagGroup(undefined, { sortOrder: {} });
sync.deleteTagGroup(undefined);
sync.listTagGroups({ spaceId: null });
createAsyncTagGroupService({ ...thenableOptions, validateSpaceReference: undefined });
void [thenableRecords, asyncService, thenableService, bridgeThenableService, readonlyService, fallback, assimilation];
