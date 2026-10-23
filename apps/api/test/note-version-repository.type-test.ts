import {
  createInMemoryNoteVersionRepository,
  type NoteVersionRecord,
  type NoteVersionRepository,
  type NoteVersionRepositoryOptions
} from '../src/modules/knowledge/infrastructure/note-version-repository.ts';
import type { NoteVersion } from '../src/modules/knowledge/domain/note-version.ts';
import {
  versionSummary,
  versionPage,
  type VersionSummaryInput,
  type VersionSummary,
  type VersionPage,
  type VersionPageOptions
} from '../src/modules/knowledge/domain/note-version-page.ts';

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2 ? true : false;
type Assert<Value extends true> = Value;

declare const record: NoteVersionRecord;
declare const model: NoteVersion;
record.id = { historical: true };
record.createdAt = null;
declare const summaryInput: VersionSummaryInput;
const repository = createInMemoryNoteVersionRepository({ records: [record, model] });
const _saved = repository.save({ id: 'new', marker: true });
const _historicalSummary = versionSummary(record);
const _ordinarySummary = versionSummary(summaryInput);
const _historicalPage = repository.listPage({ noteId: {}, limit: 20, after: { id: {}, createdAt: null } });
const _ordinaryPage = versionPage([summaryInput], { limit: 1, total: 1, currentVersionId: 'current' });
const _sparseSummary = versionSummary({ id: 'id', createdAt: null, createdBy: 42 });
const _sparsePage = versionPage([{ id: {}, createdAt: 0 }], { limit: 1, total: 1, currentVersionId: false });
const callbackOptions: NoteVersionRepositoryOptions = { canReuse: () => ({ truthy: true }), onChange: () => null };
createInMemoryNoteVersionRepository(callbackOptions);
repository.deleteByNoteIds(new Set([null, {}, 'note']));
repository.deleteByNoteIds(null);
repository.deleteByNoteIds(undefined);

// 默认字符串 API 保持兼容；泛型仅把未校验字段向外传递，不产生新校验保证。
const _legacySummaryFunction: (version: VersionSummaryInput) => VersionSummary = versionSummary;
const _legacyPageFunction: (items: readonly VersionSummaryInput[], options: VersionPageOptions) => VersionPage =
  versionPage;

export type NoteVersionRepositoryAssertions = [
  Assert<NoteVersion extends NoteVersionRecord ? true : false>,
  Assert<Record<string, never> extends NoteVersionRecord ? true : false>,
  Assert<Equal<NoteVersionRecord['id'], unknown>>,
  Assert<Equal<NoteVersionRecord['noteId'], unknown>>,
  Assert<Equal<NoteVersionRecord['contentHash'], unknown>>,
  Assert<Equal<NoteVersionRecord['content'], unknown>>,
  Assert<Equal<NoteVersionRecord['createdAt'], unknown>>,
  Assert<Equal<NoteVersionRecord['createdBy'], unknown>>,
  Assert<Equal<ReturnType<NoteVersionRepository['save']>, NoteVersionRecord>>,
  Assert<Equal<typeof _saved, NoteVersionRecord>>,
  Assert<Equal<'marker' extends keyof typeof _saved ? true : false, false>>,
  Assert<Equal<ReturnType<NoteVersionRepository['findById']>, NoteVersionRecord | null>>,
  Assert<Equal<ReturnType<NoteVersionRepository['findByNoteIdAndContentHash']>, NoteVersionRecord | null>>,
  Assert<Equal<ReturnType<NoteVersionRepository['list']>, NoteVersionRecord[]>>,
  Assert<Equal<ReturnType<NoteVersionRepository['listIds']>, unknown[]>>,
  Assert<Equal<ReturnType<NoteVersionRepository['deleteById']>, NoteVersionRecord | null>>,
  Assert<Equal<ReturnType<NoteVersionRepository['deleteByNoteIds']>, NoteVersionRecord[]>>,
  Assert<Equal<typeof _historicalSummary.id, unknown>>,
  Assert<Equal<typeof _historicalSummary.noteId, unknown>>,
  Assert<Equal<typeof _historicalSummary.contentHash, unknown>>,
  Assert<Equal<typeof _historicalSummary.createdBy, unknown>>,
  Assert<Equal<typeof _historicalSummary.createdAt, string>>,
  Assert<Equal<(typeof _historicalPage.items)[number]['id'], unknown>>,
  Assert<Equal<typeof _historicalPage.currentVersionId, unknown>>,
  Assert<Equal<typeof _historicalPage.nextCursor, string | null>>,
  Assert<Equal<typeof _historicalPage.total, number>>,
  Assert<Equal<typeof _ordinarySummary, VersionSummary>>,
  Assert<Equal<(typeof _ordinaryPage.items)[number], VersionSummary>>,
  Assert<Equal<typeof _ordinaryPage.currentVersionId, string>>,
  Assert<Equal<typeof _sparseSummary.createdBy, number>>,
  Assert<Equal<typeof _sparseSummary.noteId, unknown>>,
  Assert<Equal<typeof _sparsePage.currentVersionId, boolean>>,
  Assert<Equal<VersionSummary['id'], string>>,
  Assert<Equal<VersionSummary['noteId'], string>>,
  Assert<Equal<VersionSummary['contentHash'], string>>,
  Assert<Equal<VersionSummary['createdBy'], string>>,
  Assert<Equal<VersionPage['currentVersionId'], string | null>>,
  Assert<Equal<VersionPageOptions['currentVersionId'], string | null>>,
  Assert<Equal<ReturnType<typeof versionSummary>, VersionSummary>>,
  Assert<Equal<ReturnType<typeof versionPage>, VersionPage>>,
  Assert<Equal<Parameters<typeof versionSummary>[0], VersionSummaryInput>>,
  Assert<Equal<Parameters<typeof versionPage>[0], readonly VersionSummaryInput[]>>,
  Assert<Equal<typeof _legacySummaryFunction, (version: VersionSummaryInput) => VersionSummary>>,
  Assert<
    Equal<
      typeof _legacyPageFunction,
      (items: readonly VersionSummaryInput[], options: VersionPageOptions) => VersionPage
    >
  >
];
