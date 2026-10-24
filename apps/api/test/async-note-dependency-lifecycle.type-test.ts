import { createAsyncNoteDependencyLifecycle } from '../src/modules/knowledge/application/postgres-async/note-dependency-lifecycle.ts';
import { createAsyncNoteDependencyLifecycle as bridgeCreateAsyncNoteDependencyLifecycle } from '../src/modules/knowledge/application/postgres-async/note-dependency-lifecycle.js';
import type {
  AsyncNoteDependencyLifecycle,
  AsyncNoteDependencyOptions,
  DependencyAnnotationRecord,
  DependencyIdRecord,
  DependencyQuestionSource,
  DependencyScopeSnapshot,
  DependencyScopeVersion,
  DependencyVersionRecord,
  MaybePromise
} from '../src/modules/knowledge/application/postgres-async/note-dependency-lifecycle.ts';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
declare const options: AsyncNoteDependencyOptions;
declare const thenRecords: PromiseLike<readonly DependencyIdRecord[]>;
declare const thenReconciliation: PromiseLike<{ contentChangedAnnotationIds: Iterable<unknown> }>;
declare const thenAnnotation: PromiseLike<DependencyAnnotationRecord | null | undefined>;
declare const thenIds: PromiseLike<Pick<readonly unknown[], 'filter'>>;
declare const thenLength: PromiseLike<{ readonly length: number }>;
declare const thenSources: PromiseLike<Pick<readonly DependencyQuestionSource[], 'some'>>;
declare const thenScopes: PromiseLike<Pick<readonly DependencyScopeSnapshot[], 'some'>>;
const records: readonly DependencyIdRecord[] = [{ id: NaN }, { id: Symbol('id') }, { id: {} }, {}];
const snapshots: readonly DependencyScopeSnapshot[] = [
  {},
  { noteVersions: null },
  { noteVersions: undefined },
  { noteVersions: [{ noteId: false, noteVersionId: {} }] }
];
const ids: readonly unknown[] = [null, false, Symbol('version'), {}];
const mapOnly: Pick<readonly DependencyIdRecord[], 'map'> = { map: records.map.bind(records) };
const filterOnly: Pick<readonly unknown[], 'filter'> = { filter: ids.filter.bind(ids) };
const someOnly: Pick<readonly DependencyScopeSnapshot[], 'some'> = { some: snapshots.some.bind(snapshots) };
const direct: AsyncNoteDependencyOptions = {
  createAnnotationService: () => ({
    reconcileForNote: (_id: unknown, _hash: unknown, _change: unknown) => ({
      contentChangedAnnotationIds: new Set([Symbol('annotation'), {}])
    })
  }),
  contentAnnotationRepository: { findById: (_id: unknown) => ({ anchorStatus: true }) },
  noteVersionRepository: {
    listIds: (_input: { noteId: unknown }) => filterOnly,
    list: (_input: { noteId: unknown }) => mapOnly
  },
  knowledgeEvidenceRepository: { list: (_input: { noteId: unknown }) => ({ length: 0 }) },
  questionSourceRepository: { list: () => [{ sourceType: Symbol('source'), sourceId: {} }] },
  analysisScopeRepository: { list: () => someOnly },
  knowledgeItemService: {
    markEvidenceByAnnotationId: (_id: unknown, _status: 'insufficient' | 'stale') => new Set(records),
    markEvidenceByNoteVersionIds: (versionIds: unknown[], _status: 'stale', _type: 'noteVersion') => {
      versionIds.push(Symbol('collaborator-can-mutate'));
      return mapOnly;
    },
    markEvidenceByNoteId: (_id: unknown, _status: 'invalid') => records
  },
  questionService: {
    markSourcesStale: (_type: 'knowledgeEvidence' | 'noteVersion', sourceIds: unknown[]) => {
      sourceIds.push(null);
      return { ignored: true };
    }
  }
};
const lifecycle = createAsyncNoteDependencyLifecycle(direct);
const bridge = bridgeCreateAsyncNoteDependencyLifecycle(options);
const promiseLifecycle = createAsyncNoteDependencyLifecycle({
  createAnnotationService: () => ({ reconcileForNote: async () => ({ contentChangedAnnotationIds: ids }) }),
  contentAnnotationRepository: { findById: async () => null },
  noteVersionRepository: { listIds: async () => ids, list: async () => records },
  knowledgeEvidenceRepository: { list: async () => ({ length: 0 }) },
  questionSourceRepository: { list: async () => [] },
  analysisScopeRepository: { list: async () => snapshots },
  knowledgeItemService: {
    markEvidenceByAnnotationId: async () => new Set(records),
    markEvidenceByNoteVersionIds: async () => records,
    markEvidenceByNoteId: async () => records
  },
  questionService: { markSourcesStale: async () => undefined }
});
const thenableLifecycle = createAsyncNoteDependencyLifecycle({
  createAnnotationService: () => ({ reconcileForNote: () => thenReconciliation }),
  contentAnnotationRepository: { findById: () => thenAnnotation },
  noteVersionRepository: { listIds: () => thenIds, list: () => thenRecords },
  knowledgeEvidenceRepository: { list: () => thenLength },
  questionSourceRepository: { list: () => thenSources },
  analysisScopeRepository: { list: () => thenScopes },
  knowledgeItemService: {
    markEvidenceByAnnotationId: () => thenRecords,
    markEvidenceByNoteVersionIds: () => thenRecords,
    markEvidenceByNoteId: () => thenRecords
  },
  questionService: { markSourcesStale: () => thenRecords }
});
createAsyncNoteDependencyLifecycle({ ...options, contentAnnotationRepository: { findById: () => undefined } });
createAsyncNoteDependencyLifecycle({
  ...options,
  createAnnotationService: () => ({ reconcileForNote: () => ({ contentChangedAnnotationIds: 'iterable' }) })
});
const nullableAnnotation: ReturnType<AsyncNoteDependencyOptions['contentAnnotationRepository']['findById']> = null;
const nestedCapability: DependencyScopeSnapshot = {
  noteVersions: { some: _predicate => false }
};
lifecycle.onNoteContentChanged({ id: Symbol('note') }, { id: {}, contentHash: false }, null);
lifecycle.onNoteContentChanged({}, {}, undefined);
lifecycle.onNoteDeleted(NaN);
lifecycle.onBeforePermanentDelete({ opaque: true });
bridge.onNoteContentChanged({ id: undefined }, { contentHash: null }, Symbol('change'));
bridge.onNoteDeleted(null);
bridge.onBeforePermanentDelete(undefined);

export type SourceShape = Assert<Equal<typeof lifecycle, AsyncNoteDependencyLifecycle>>;
export type BridgeShape = Assert<Equal<typeof bridge, AsyncNoteDependencyLifecycle>>;
export type PromiseShape = Assert<Equal<typeof promiseLifecycle, AsyncNoteDependencyLifecycle>>;
export type ThenableShape = Assert<Equal<typeof thenableLifecycle, AsyncNoteDependencyLifecycle>>;
export type BridgeFactory = Assert<
  Equal<typeof bridgeCreateAsyncNoteDependencyLifecycle, typeof createAsyncNoteDependencyLifecycle>
>;
export type FactoryArguments = Assert<
  Equal<Parameters<typeof createAsyncNoteDependencyLifecycle>, [options: AsyncNoteDependencyOptions]>
>;
export type FactoryReturn = Assert<
  Equal<ReturnType<typeof createAsyncNoteDependencyLifecycle>, AsyncNoteDependencyLifecycle>
>;
export type ContentResult = Assert<Equal<ReturnType<typeof lifecycle.onNoteContentChanged>, Promise<void>>>;
export type DeletedResult = Assert<Equal<ReturnType<typeof lifecycle.onNoteDeleted>, Promise<void>>>;
export type PermanentResult = Assert<Equal<ReturnType<typeof lifecycle.onBeforePermanentDelete>, Promise<void>>>;
export type ContentArguments = Assert<
  Equal<
    Parameters<typeof lifecycle.onNoteContentChanged>,
    [note: DependencyIdRecord, version: DependencyVersionRecord, annotationChange: unknown]
  >
>;
export type DeletedArgument = Assert<Equal<Parameters<typeof lifecycle.onNoteDeleted>, [noteId: unknown]>>;
export type PermanentArgument = Assert<Equal<Parameters<typeof lifecycle.onBeforePermanentDelete>, [noteId: unknown]>>;
export type IdIsUnknown = Assert<Equal<DependencyIdRecord['id'], unknown>>;
export type HashIsUnknown = Assert<Equal<DependencyVersionRecord['contentHash'], unknown>>;
export type AnchorIsUnknown = Assert<Equal<DependencyAnnotationRecord['anchorStatus'], unknown>>;
export type SourceTypeIsUnknown = Assert<Equal<DependencyQuestionSource['sourceType'], unknown>>;
export type SourceIdIsUnknown = Assert<Equal<DependencyQuestionSource['sourceId'], unknown>>;
export type ScopeNoteIsUnknown = Assert<Equal<DependencyScopeVersion['noteId'], unknown>>;
export type ScopeVersionIsUnknown = Assert<Equal<DependencyScopeVersion['noteVersionId'], unknown>>;
export type OptionalScopeCapability = Assert<
  Equal<DependencyScopeSnapshot['noteVersions'], Pick<readonly DependencyScopeVersion[], 'some'> | null | undefined>
>;
export type ReconcileArguments = Assert<
  Equal<
    Parameters<ReturnType<AsyncNoteDependencyOptions['createAnnotationService']>['reconcileForNote']>,
    [noteId: unknown, contentHash: unknown, annotationChange: unknown]
  >
>;
export type ReconcileResult = Assert<
  Equal<
    ReturnType<ReturnType<AsyncNoteDependencyOptions['createAnnotationService']>['reconcileForNote']>,
    MaybePromise<{ contentChangedAnnotationIds: Iterable<unknown> }>
  >
>;
export type AnnotationResult = Assert<
  Equal<
    ReturnType<AsyncNoteDependencyOptions['contentAnnotationRepository']['findById']>,
    MaybePromise<DependencyAnnotationRecord | null | undefined>
  >
>;
export type AnnotationMarks = Assert<
  Equal<
    Parameters<AsyncNoteDependencyOptions['knowledgeItemService']['markEvidenceByAnnotationId']>,
    [annotationId: unknown, status: 'insufficient' | 'stale']
  >
>;
export type AnnotationEvidenceIterable = Assert<
  Equal<
    ReturnType<AsyncNoteDependencyOptions['knowledgeItemService']['markEvidenceByAnnotationId']>,
    MaybePromise<Iterable<DependencyIdRecord>>
  >
>;
export type MutableVersionArguments = Assert<
  Equal<
    Parameters<AsyncNoteDependencyOptions['knowledgeItemService']['markEvidenceByNoteVersionIds']>,
    [versionIds: unknown[], status: 'stale', sourceType: 'noteVersion']
  >
>;
export type MutableSourceArguments = Assert<
  Equal<
    Parameters<AsyncNoteDependencyOptions['questionService']['markSourcesStale']>,
    [sourceType: 'knowledgeEvidence' | 'noteVersion', sourceIds: unknown[]]
  >
>;
export type SourceMarkResultUnknown = Assert<
  Equal<ReturnType<AsyncNoteDependencyOptions['questionService']['markSourcesStale']>, unknown>
>;
export type VersionIdCapability = Assert<
  Equal<
    ReturnType<AsyncNoteDependencyOptions['noteVersionRepository']['listIds']>,
    MaybePromise<Pick<readonly unknown[], 'filter'>>
  >
>;
export type VersionMapCapability = Assert<
  Equal<
    ReturnType<AsyncNoteDependencyOptions['noteVersionRepository']['list']>,
    MaybePromise<Pick<readonly DependencyIdRecord[], 'map'>>
  >
>;
export type EvidenceLengthCapability = Assert<
  Equal<
    ReturnType<AsyncNoteDependencyOptions['knowledgeEvidenceRepository']['list']>,
    MaybePromise<{ readonly length: number }>
  >
>;
export type SourceSomeCapability = Assert<
  Equal<
    ReturnType<AsyncNoteDependencyOptions['questionSourceRepository']['list']>,
    MaybePromise<Pick<readonly DependencyQuestionSource[], 'some'>>
  >
>;
export type ScopeSomeCapability = Assert<
  Equal<
    ReturnType<AsyncNoteDependencyOptions['analysisScopeRepository']['list']>,
    MaybePromise<Pick<readonly DependencyScopeSnapshot[], 'some'>>
  >
>;
void [promiseLifecycle, thenableLifecycle, nullableAnnotation, nestedCapability];
