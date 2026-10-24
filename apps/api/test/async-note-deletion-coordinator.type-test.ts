import { createAsyncNoteDeletionCoordinator } from '../src/modules/knowledge/application/postgres-async/note-deletion-coordinator.js';
import type {
  Awaitable,
  DeletionValue,
  NoteView,
  AsyncNoteDeletionOptions,
  AsyncNoteDeletionCoordinator,
  AttachmentList,
  AttachmentFilterable,
  AttachmentStore,
  CleanupValue,
  NoteIds,
  NoteList,
  PreflightView,
  ReferenceView
} from '../src/modules/knowledge/application/postgres-async/note-deletion-coordinator.js';
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
const options = {
  noteService: {
    permanentlyDeleteNote: (id: unknown) => ({ id }),
    emptyRecycleBin: async (spaceId: unknown) => ({ spaceId, deletedCount: 1 })
  },
  noteRepository: { list: () => [{ id: Symbol('note'), deleted: 'yes' }] },
  attachmentStore: {
    listAttachments: () => [{ id: 'a', noteId: 'n', storagePath: 42, fileName: null }],
    inspectAttachmentDeletion: () => ({ references: [{ collection: 'notes', id: 'n' }] }),
    removeDetachedAttachmentFiles: () => ({ length: Symbol('truthy') })
  }
};
const c = createAsyncNoteDeletionCoordinator(options);
type P01 = Assert<Equal<Parameters<typeof c.permanentlyDeleteNote>, [noteId: unknown]>>;
type P02 = Assert<Equal<Parameters<typeof c.emptyRecycleBin>, [spaceId?: unknown]>>;
type P03 = Assert<Equal<ReturnType<typeof c.permanentlyDeleteNote>, Promise<unknown>>>;
type P04 = Assert<Equal<ReturnType<typeof c.emptyRecycleBin>, Promise<unknown>>>;
type P05 = Assert<Equal<CleanupValue['length'], unknown>>;
type P06 = Assert<Equal<ReferenceView['collection'], string>>;
type P07 = Assert<Equal<AttachmentList['length'], unknown>>;
type P08 = Assert<Equal<NoteIds['length'], unknown>>;
type P09 = Assert<Equal<Parameters<AttachmentStore['inspectAttachmentDeletion']>, [id: unknown]>>;
type P10 = Assert<
  Equal<Parameters<NonNullable<AttachmentStore['prepareAttachmentCleanup']>>, [attachments: AttachmentList]>
>;
type P11 = Assert<Equal<ReturnType<NonNullable<AttachmentStore['prepareAttachmentCleanup']>>, unknown>>;
type P12 = Assert<Equal<ReturnType<NoteIds['includes']>, unknown>>;
type P13 = Assert<Equal<ReturnType<AttachmentList['some']>, unknown>>;
declare const customAttachments: AttachmentList,
  customFilterable: AttachmentFilterable,
  customNotes: NoteList,
  preflight: PreflightView,
  thenable: PromiseLike<{ id: number }>;
createAsyncNoteDeletionCoordinator({
  ...options,
  noteRepository: { list: () => customNotes },
  attachmentStore: {
    listAttachments: () => customFilterable,
    inspectAttachmentDeletion: () => preflight,
    prepareAttachmentCleanup: () => Promise.resolve(undefined),
    removeDetachedAttachmentFiles: () => Promise.resolve({ length: 'truthy' })
  }
});
const thenableC = createAsyncNoteDeletionCoordinator({
  ...options,
  noteService: { ...options.noteService, permanentlyDeleteNote: () => thenable }
});
type P14 = Assert<Equal<ReturnType<typeof thenableC.permanentlyDeleteNote>, Promise<unknown>>>;
const nullC = createAsyncNoteDeletionCoordinator({
  ...options,
  noteService: { permanentlyDeleteNote: () => null, emptyRecycleBin: () => undefined }
});
createAsyncNoteDeletionCoordinator({
  ...options,
  attachmentStore: {
    inspectAttachmentDeletion: () => preflight,
    listAttachments: undefined,
    prepareAttachmentCleanup: null,
    removeDetachedAttachmentFiles: () => null
  },
  runTransaction: undefined
});
createAsyncNoteDeletionCoordinator({
  ...options,
  attachmentStore: { inspectAttachmentDeletion: () => preflight, removeDetachedAttachmentFiles: () => undefined }
});
createAsyncNoteDeletionCoordinator({ ...options, runTransaction: operation => operation() });
createAsyncNoteDeletionCoordinator({ ...options, runTransaction: async operation => operation() });
const readonlyRows: readonly { id: string; noteId: string }[] = [];
const compatible: AttachmentFilterable = { filter: () => readonlyRows };
void compatible;
const rawCollections: AttachmentList = [{ id: 'a' }];
const rawValues: unknown[] = [Symbol('id'), NaN, {}, 'x', 1];
const rawIds: NoteIds = rawValues;
void [c, thenableC, nullC, customAttachments, rawCollections, rawIds];

type P15 = Assert<Equal<Awaited<ReturnType<typeof c.permanentlyDeleteNote>>, unknown>>;
type P16 = Assert<Equal<Awaited<ReturnType<typeof c.emptyRecycleBin>>, unknown>>;

type P17 = Assert<Equal<Parameters<typeof createAsyncNoteDeletionCoordinator>, [options: AsyncNoteDeletionOptions]>>;
type P18 = Assert<Equal<ReturnType<typeof createAsyncNoteDeletionCoordinator>, AsyncNoteDeletionCoordinator>>;
type P19 = Assert<Equal<DeletionValue, object | null | undefined>>;
type P20 = Assert<Equal<Awaitable<CleanupValue>, CleanupValue | PromiseLike<CleanupValue>>>;
type P21 = Assert<
  Equal<
    ReturnType<NonNullable<AttachmentStore['removeDetachedAttachmentFiles']>>,
    Awaitable<CleanupValue | null | undefined>
  >
>;
type P22 = Assert<
  Equal<ReturnType<NonNullable<AttachmentStore['listAttachments']>>, Awaitable<AttachmentFilterable | null | undefined>>
>;
type P23 = Assert<Equal<ReturnType<AttachmentStore['inspectAttachmentDeletion']>, Awaitable<PreflightView>>>;
type P24 = Assert<
  Equal<
    Parameters<AsyncNoteDeletionOptions['noteRepository']['list']>,
    [options: { includeDeleted: true; spaceId: unknown }]
  >
>;
type P25 = Assert<Equal<ReturnType<AsyncNoteDeletionOptions['noteRepository']['list']>, Awaitable<NoteList>>>;
type P26 = Assert<Equal<NoteView['id'], unknown>>;
type P27 = Assert<Equal<NoteView['deleted'], unknown>>;
type P28 = Assert<Equal<ReturnType<NoteIds['some']>, unknown>>;
type P29 = Assert<Equal<Parameters<NoteIds['includes']>, [id: unknown]>>;
type P30 = Assert<Equal<ReturnType<AttachmentList['map']>, Iterable<readonly [unknown, string], unknown, unknown>>>;
type P31 = Assert<
  Equal<Parameters<NonNullable<AttachmentStore['removeDetachedAttachmentFiles']>>, [attachments: AttachmentList]>
>;
type P32 = Assert<
  Equal<ReturnType<AsyncNoteDeletionOptions['noteService']['permanentlyDeleteNote']>, Awaitable<DeletionValue>>
>;
type P33 = Assert<
  Equal<ReturnType<AsyncNoteDeletionOptions['noteService']['emptyRecycleBin']>, Awaitable<DeletionValue>>
>;
type P34 = Assert<
  Equal<
    NonNullable<AsyncNoteDeletionOptions['runTransaction']>,
    <Value>(operation: () => Promise<Value>) => Awaitable<Value>
  >
>;
declare const asyncNotes: PromiseLike<NoteList>,
  asyncAttachments: PromiseLike<AttachmentFilterable | null | undefined>,
  asyncPreflight: PromiseLike<PreflightView>,
  asyncCleanup: PromiseLike<CleanupValue | null | undefined>;
createAsyncNoteDeletionCoordinator({
  ...options,
  noteRepository: { list: () => asyncNotes },
  attachmentStore: {
    listAttachments: () => asyncAttachments,
    inspectAttachmentDeletion: () => asyncPreflight,
    removeDetachedAttachmentFiles: () => asyncCleanup
  }
});
createAsyncNoteDeletionCoordinator({
  ...options,
  attachmentStore: { inspectAttachmentDeletion: () => preflight, removeDetachedAttachmentFiles: async () => undefined }
});
createAsyncNoteDeletionCoordinator({
  ...options,
  attachmentStore: { inspectAttachmentDeletion: () => preflight, removeDetachedAttachmentFiles: async () => null }
});
createAsyncNoteDeletionCoordinator({
  ...options,
  attachmentStore: { inspectAttachmentDeletion: () => preflight, prepareAttachmentCleanup: () => {} }
});
// Structural widening can hide an enumerable dynamic then getter. The result stays unknown.
let reads = 0;
const unstable = {
  id: 1,
  get then(): undefined | ((resolve: (value: string) => void) => void) {
    reads++;
    return reads === 3 ? resolve => resolve('absorbed-string') : undefined;
  }
};
const widened: { id: number } = unstable;
const adversarial = createAsyncNoteDeletionCoordinator({
  ...options,
  noteService: { ...options.noteService, permanentlyDeleteNote: () => widened }
});
type P35 = Assert<Equal<ReturnType<typeof adversarial.permanentlyDeleteNote>, Promise<unknown>>>;
type P36 = Assert<Equal<Awaited<ReturnType<typeof adversarial.permanentlyDeleteNote>>, unknown>>;
export type AsyncDeletionContractChecks = [
  P01,
  P02,
  P03,
  P04,
  P05,
  P06,
  P07,
  P08,
  P09,
  P10,
  P11,
  P12,
  P13,
  P14,
  P15,
  P16,
  P17,
  P18,
  P19,
  P20,
  P21,
  P22,
  P23,
  P24,
  P25,
  P26,
  P27,
  P28,
  P29,
  P30,
  P31,
  P32,
  P33,
  P34,
  P35,
  P36
];

void adversarial;
