import { createAsyncNavigationReferencePolicy } from '../src/modules/knowledge/application/postgres-async/navigation-reference-policy.ts';
import { createAsyncNavigationReferencePolicy as bridgeCreateAsyncNavigationReferencePolicy } from '../src/modules/knowledge/application/postgres-async/navigation-reference-policy.js';
import type {
  AsyncNavigationReferencePolicy,
  AsyncNavigationReferencePolicyOptions,
  AsyncNavigationReferenceReader,
  AsyncNoteReferenceInput,
  MaybePromise
} from '../src/modules/knowledge/application/postgres-async/navigation-reference-policy.ts';
import type { NavigationReferenceRecord } from '../src/modules/knowledge/application/navigation-reference-policy.ts';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
declare const record: NavigationReferenceRecord;
declare const records: readonly NavigationReferenceRecord[];
declare const options: AsyncNavigationReferencePolicyOptions;
declare const thenRecord: PromiseLike<NavigationReferenceRecord | null | undefined>;
declare const thenRecords: PromiseLike<Pick<ReadonlyArray<NavigationReferenceRecord>, 'map'>>;

const sync = createAsyncNavigationReferencePolicy({
  knowledgeSpaceRepository: { findById: (_id: unknown) => false },
  folderRepository: { findById: (_id: unknown) => record },
  tagRepository: { findByIds: (_ids: Iterable<unknown>) => records },
  tagGroupRepository: { findById: (_id: unknown) => null }
});
const asyncPolicy = createAsyncNavigationReferencePolicy({
  knowledgeSpaceRepository: { findById: async (_id: unknown) => Symbol('unvalidated') },
  folderRepository: { findById: async (_id: unknown) => record },
  tagRepository: { findByIds: async (_ids: Iterable<unknown>) => records },
  tagGroupRepository: { findById: async (_id: unknown) => undefined }
});
const thenablePolicy = createAsyncNavigationReferencePolicy({
  knowledgeSpaceRepository: { findById: (_id: unknown) => thenRecord },
  folderRepository: { findById: (_id: unknown) => thenRecord },
  tagRepository: { findByIds: (_ids: Iterable<unknown>) => thenRecords },
  tagGroupRepository: { findById: (_id: unknown) => thenRecord }
});
const bridge = bridgeCreateAsyncNavigationReferencePolicy(options);
const mapView: Pick<ReadonlyArray<NavigationReferenceRecord>, 'map'> = { map: records.map.bind(records) };
const mapOnlyPolicy = createAsyncNavigationReferencePolicy({
  ...options,
  tagRepository: { findByIds: (_ids: Iterable<unknown>) => mapView }
});
const opaqueRecord: NavigationReferenceRecord = {
  id: Symbol('id'),
  spaceId: { opaque: true },
  groupId: false,
  selectionMode: 7
};
const emptyRecord: NavigationReferenceRecord = {};

export type SyncShape = Assert<Equal<typeof sync, AsyncNavigationReferencePolicy>>;
export type AsyncShape = Assert<Equal<typeof asyncPolicy, AsyncNavigationReferencePolicy>>;
export type ThenableShape = Assert<Equal<typeof thenablePolicy, AsyncNavigationReferencePolicy>>;
export type MapOnlyShape = Assert<Equal<typeof mapOnlyPolicy, AsyncNavigationReferencePolicy>>;
export type BridgeShape = Assert<Equal<typeof bridge, AsyncNavigationReferencePolicy>>;
export type BridgeFactory = Assert<
  Equal<typeof bridgeCreateAsyncNavigationReferencePolicy, typeof createAsyncNavigationReferencePolicy>
>;
export type FactoryArguments = Assert<
  Equal<Parameters<typeof createAsyncNavigationReferencePolicy>, [options: AsyncNavigationReferencePolicyOptions]>
>;
export type FactoryReturn = Assert<
  Equal<ReturnType<typeof createAsyncNavigationReferencePolicy>, AsyncNavigationReferencePolicy>
>;
export type SpaceResult = Assert<Equal<ReturnType<typeof sync.assertSpaceReference>, Promise<void>>>;
export type NoteResult = Assert<Equal<ReturnType<typeof sync.assertNoteReferences>, Promise<void>>>;
export type GroupResult = Assert<Equal<ReturnType<typeof sync.assertTagGroupReference>, Promise<void>>>;
export type NormalizeResult = Assert<Equal<ReturnType<typeof sync.normalizeTagIds>, Promise<unknown[]>>>;
export type SpaceArguments = Assert<
  Equal<Parameters<typeof sync.assertSpaceReference>, [spaceId: unknown, entityName: unknown]>
>;
export type NoteArguments = Assert<
  Equal<Parameters<typeof sync.assertNoteReferences>, [input: AsyncNoteReferenceInput]>
>;
export type GroupArguments = Assert<
  Equal<Parameters<typeof sync.assertTagGroupReference>, [groupId: unknown, spaceId: unknown]>
>;
export type NormalizeArguments = Assert<
  Equal<Parameters<typeof sync.normalizeTagIds>, [tagIds?: Iterable<unknown> | null | undefined]>
>;
export type SpacePortArgument = Assert<
  Equal<Parameters<AsyncNavigationReferencePolicyOptions['knowledgeSpaceRepository']['findById']>, [id: unknown]>
>;
export type SpacePortResult = Assert<
  Equal<ReturnType<AsyncNavigationReferencePolicyOptions['knowledgeSpaceRepository']['findById']>, unknown>
>;
export type ReaderArgument = Assert<Equal<Parameters<AsyncNavigationReferenceReader['findById']>, [id: unknown]>>;
export type ReaderResult = Assert<
  Equal<
    ReturnType<AsyncNavigationReferenceReader['findById']>,
    MaybePromise<NavigationReferenceRecord | null | undefined>
  >
>;
export type TagPortArgument = Assert<
  Equal<Parameters<AsyncNavigationReferencePolicyOptions['tagRepository']['findByIds']>, [ids: Iterable<unknown>]>
>;
export type TagPortResult = Assert<
  Equal<
    ReturnType<AsyncNavigationReferencePolicyOptions['tagRepository']['findByIds']>,
    MaybePromise<Pick<ReadonlyArray<NavigationReferenceRecord>, 'map'>>
  >
>;
export type RecordId = Assert<Equal<NavigationReferenceRecord['id'], unknown>>;
export type RecordSpace = Assert<Equal<NavigationReferenceRecord['spaceId'], unknown>>;
export type RecordGroup = Assert<Equal<NavigationReferenceRecord['groupId'], unknown>>;
export type RecordSelection = Assert<Equal<NavigationReferenceRecord['selectionMode'], unknown>>;
export type NoteTags = Assert<Equal<AsyncNoteReferenceInput['tagIds'], Iterable<unknown> | null | undefined>>;
export type NoteSpace = Assert<Equal<AsyncNoteReferenceInput['spaceId'], unknown>>;
export type NoteFolder = Assert<Equal<AsyncNoteReferenceInput['folderId'], unknown>>;

sync.assertSpaceReference(Symbol('space'), { opaque: true });
sync.assertTagGroupReference(false, 42);
sync.assertNoteReferences({});
sync.assertNoteReferences({ spaceId: undefined, folderId: undefined, tagIds: undefined });
sync.assertNoteReferences({ spaceId: 1, folderId: false, tagIds: null });
sync.assertNoteReferences({ tagIds: new Set([Symbol('tag'), 'tag']) });
sync.assertNoteReferences({ tagIds: 'iterable-not-necessarily-a-valid-pg-array' });
sync.normalizeTagIds();
sync.normalizeTagIds(null);
sync.normalizeTagIds(undefined);
sync.normalizeTagIds(new Set([null, false, Symbol('tag')]));
const readonlyIds: readonly unknown[] = [opaqueRecord, emptyRecord, 0, ''];
sync.normalizeTagIds(readonlyIds);
bridge.assertNoteReferences({ tagIds: readonlyIds });
void [asyncPolicy, thenablePolicy, bridge, mapOnlyPolicy];
