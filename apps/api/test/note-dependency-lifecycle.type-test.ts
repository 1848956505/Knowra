import { createNoteDependencyLifecycle } from '../src/modules/knowledge/application/note-dependency-lifecycle.ts';
import type {
  NoteDependencyOptions,
  NoteDependencyLifecycle,
  DependencyIdRecord,
  DependencyVersionRecord
} from '../src/modules/knowledge/application/note-dependency-lifecycle.ts';
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
export type Assert<T extends true> = T;
declare const options: NoteDependencyOptions;
const lifecycle = createNoteDependencyLifecycle(options);
export type A1 = Assert<Equal<typeof lifecycle, NoteDependencyLifecycle>>;
export type A2 = Assert<Equal<ReturnType<typeof lifecycle.onNoteContentChanged>, void>>;
export type A3 = Assert<Equal<ReturnType<typeof lifecycle.onNoteDeleted>, void>>;
export type A4 = Assert<Equal<ReturnType<typeof lifecycle.onBeforePermanentDelete>, void>>;
export type A5 = Assert<
  Equal<
    Parameters<typeof lifecycle.onNoteContentChanged>,
    [note: DependencyIdRecord, version: DependencyVersionRecord, annotationChange: unknown]
  >
>;
export type A6 = Assert<Equal<Parameters<typeof lifecycle.onNoteDeleted>, [noteId: unknown]>>;
export type A7 = Assert<
  Equal<
    ReturnType<NoteDependencyOptions['knowledgeItemService']['markEvidenceByAnnotationId']>,
    DependencyIdRecord | readonly DependencyIdRecord[]
  >
>;
export type A8 = Assert<Equal<ReturnType<NoteDependencyOptions['questionService']['markSourcesStale']>, unknown>>;
export type A9 = Assert<Equal<ReturnType<NoteDependencyOptions['coalescePreviousVersion']>, unknown>>;
const sampleIds: readonly unknown[] = [];
const sampleRecords: readonly DependencyIdRecord[] = [];
const custom = createNoteDependencyLifecycle({
  ...options,
  contentAnnotationService: {
    reconcileForNote: () => ({ contentChangedAnnotationIds: { flatMap: sampleIds.flatMap } })
  },
  knowledgeItemService: { ...options.knowledgeItemService, markEvidenceByAnnotationId: () => ({ id: Symbol('id') }) },
  noteVersionService: {
    listVersionIds: () => ({ filter: sampleIds.filter }),
    listVersions: () => ({ map: sampleRecords.map })
  },
  annotationIdentityShadow: { observe: () => Promise.resolve({ ignored: true }) },
  coalescePreviousVersion: () => ({
    then() {
      throw new Error('must not inspect');
    }
  })
});
custom.onNoteContentChanged({ id: {} }, { id: NaN, contentHash: Symbol('hash') }, () => undefined);
custom.onNoteDeleted(new Set());
custom.onBeforePermanentDelete(Symbol());
const readonlyResults: NoteDependencyOptions = {
  ...options,
  contentAnnotationService: { reconcileForNote: () => ({ contentChangedAnnotationIds: Object.freeze(['a']) }) },
  knowledgeItemService: {
    ...options.knowledgeItemService,
    markEvidenceByAnnotationId: () => Object.freeze([{ id: 'e' }])
  }
};
void readonlyResults;

const customFlatMap: NoteDependencyOptions = {
  ...options,
  contentAnnotationService: {
    reconcileForNote: () => ({
      contentChangedAnnotationIds: {
        flatMap: callback => {
          callback('synthetic');
          return { map: sampleRecords.map };
        }
      }
    })
  }
};
void customFlatMap;

import { createNoteDependencyLifecycle as bridgeFactory } from '../src/modules/knowledge/application/note-dependency-lifecycle.js';
import type {
  DependencyAnnotationRecord,
  DependencyQuestionSource,
  DependencyScopeVersion,
  DependencyScopeSnapshot
} from '../src/modules/knowledge/application/note-dependency-lifecycle.ts';
export type A10 = Assert<Equal<typeof bridgeFactory, typeof createNoteDependencyLifecycle>>;
export type A11 = Assert<Equal<Parameters<typeof lifecycle.onBeforePermanentDelete>, [noteId: unknown]>>;
export type A12 = Assert<Equal<Parameters<typeof createNoteDependencyLifecycle>, [options: NoteDependencyOptions]>>;
export type A13 = Assert<Equal<DependencyIdRecord['id'], unknown>>;
export type A14 = Assert<Equal<DependencyVersionRecord['contentHash'], unknown>>;
export type A15 = Assert<Equal<DependencyAnnotationRecord['anchorStatus'], unknown>>;
export type A16 = Assert<Equal<DependencyQuestionSource['sourceType'], unknown>>;
export type A17 = Assert<Equal<DependencyQuestionSource['sourceId'], unknown>>;
export type A18 = Assert<Equal<DependencyScopeVersion['noteId'], unknown>>;
export type A19 = Assert<Equal<DependencyScopeVersion['noteVersionId'], unknown>>;
export type A20 = Assert<
  Equal<DependencyScopeSnapshot['noteVersions'], Pick<readonly DependencyScopeVersion[], 'some'> | null | undefined>
>;
export type A21 = Assert<
  Equal<
    Parameters<NoteDependencyOptions['knowledgeItemService']['markEvidenceByNoteVersionIds']>,
    [versionIds: unknown[], status: 'stale', sourceType: 'noteVersion']
  >
>;
export type A22 = Assert<
  Equal<
    Parameters<NoteDependencyOptions['knowledgeItemService']['markEvidenceByAnnotationId']>,
    [annotationId: unknown, status: 'insufficient' | 'stale']
  >
>;
export type A23 = Assert<
  Equal<
    Parameters<NoteDependencyOptions['knowledgeItemService']['markEvidenceByNoteId']>,
    [noteId: unknown, status: 'invalid']
  >
>;
export type A24 = Assert<Equal<ReturnType<NoteDependencyOptions['annotationIdentityShadow']['observe']>, unknown>>;
export type A25 = Assert<
  Equal<
    ReturnType<NoteDependencyOptions['knowledgeItemService']['markEvidenceByNoteId']>,
    Pick<readonly DependencyIdRecord[], 'map'>
  >
>;
export type A26 = Assert<
  Equal<
    ReturnType<NoteDependencyOptions['knowledgeItemService']['markEvidenceByNoteVersionIds']>,
    Pick<readonly DependencyIdRecord[], 'map'>
  >
>;
export type A27 = Assert<
  Equal<ReturnType<NoteDependencyOptions['noteVersionService']['listVersionIds']>, Pick<readonly unknown[], 'filter'>>
>;
export type A28 = Assert<
  Equal<
    ReturnType<NoteDependencyOptions['noteVersionService']['listVersions']>,
    Pick<readonly DependencyIdRecord[], 'map'>
  >
>;
export type A29 = Assert<
  Equal<ReturnType<NoteDependencyOptions['noteVersionRepository']['list']>, Pick<readonly DependencyIdRecord[], 'map'>>
>;
export type A30 = Assert<
  Equal<ReturnType<NoteDependencyOptions['knowledgeEvidenceRepository']['list']>, { readonly length: number }>
>;
export type A31 = Assert<
  Equal<
    ReturnType<NoteDependencyOptions['questionSourceRepository']['list']>,
    Pick<readonly DependencyQuestionSource[], 'some'>
  >
>;
export type A32 = Assert<
  Equal<
    ReturnType<NoteDependencyOptions['analysisScopeRepository']['list']>,
    Pick<readonly DependencyScopeSnapshot[], 'some'>
  >
>;
const mutableIds: NoteDependencyOptions = {
  ...options,
  knowledgeItemService: {
    ...options.knowledgeItemService,
    markEvidenceByNoteVersionIds: ids => {
      ids.push(Symbol());
      return sampleRecords;
    }
  }
};
const scopes: readonly DependencyScopeSnapshot[] = [
  {},
  { noteVersions: null },
  { noteVersions: undefined },
  { noteVersions: { some: [{ noteId: {} }].some } }
];
void mutableIds;
void scopes;

void lifecycle;
