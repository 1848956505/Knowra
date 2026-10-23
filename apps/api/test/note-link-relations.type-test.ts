import {
  addedNoteLinkTargets,
  assertNoteLinkTarget,
  buildNoteLinkRelations,
  type NoteLinkSource,
  type NoteLinkRecord,
  type NoteLinkRelations
} from '../src/modules/knowledge/application/note-link-relations.ts';
import {
  addedNoteLinkTargets as bridgeAdded,
  assertNoteLinkTarget as bridgeAssert,
  buildNoteLinkRelations as bridgeBuild
} from '../src/modules/knowledge/application/note-link-relations.js';
import type { Note } from '../src/modules/knowledge/domain/note.ts';
import type { NoteRecord, NoteRepository } from '../src/modules/knowledge/infrastructure/note-repository.ts';
import { createNoteService } from '../src/modules/knowledge/application/note-service.js';
import { createAsyncNoteService } from '../src/modules/knowledge/application/postgres-async/note-service.js';
import type { NoteLinkOccurrence } from '@study-accelerator/content-anchor';

declare const domainNote: Note;
declare const record: NoteRecord;
declare const repository: NoteRepository;
buildNoteLinkRelations(domainNote, [domainNote]);
buildNoteLinkRelations(record, repository.list());
buildNoteLinkRelations({ id: 'n', rawMarkdown: '', spaceId: undefined }, Object.freeze([record]));
buildNoteLinkRelations({ id: 'n', rawMarkdown: '', spaceId: null }, [
  { id: 't', title: '', rawMarkdown: '', spaceId: null, folderId: undefined, deleted: {} }
]);
const source: NoteLinkSource = { id: 'n', rawMarkdown: '' };
const rows: readonly NoteLinkRecord[] = Object.freeze([
  { id: 't', title: '目标', rawMarkdown: '', folderId: null, deleted: Symbol() }
]);
const result = buildNoteLinkRelations(source, rows);
const spaceId: string | null | undefined = result.spaceId;
const status: 'active' | 'deleted' = result.outgoing[0].status;
const occurrences: NoteLinkOccurrence[] = result.outgoing[0].occurrences;
const targets: string[] = addedNoteLinkTargets('', undefined);
const assertion: void = assertNoteLinkTarget({ spaceId: {} }, {});
assertNoteLinkTarget(null, Symbol());
assertNoteLinkTarget(undefined, undefined);
assertNoteLinkTarget({}, null);
assertNoteLinkTarget({ spaceId: undefined }, undefined);
result.noteId = 'mutable';
result.spaceId = undefined;
result.outgoing.push({ id: 't', title: '', folderId: '', status: 'active', occurrences: [] });
result.backlinks.push({ id: 'b', title: '', folderId: null, occurrences: [] });
result.backlinks[0].occurrences.push(...occurrences);
void [spaceId, status, targets, assertion];

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
export type Added = Assert<Equal<ReturnType<typeof addedNoteLinkTargets>, string[]>>;
export type Assertion = Assert<Equal<ReturnType<typeof assertNoteLinkTarget>, void>>;
export type Output = Assert<Equal<ReturnType<typeof buildNoteLinkRelations>, NoteLinkRelations>>;
export type Space = Assert<Equal<NoteLinkRelations['spaceId'], string | null | undefined>>;
export type Deleted = Assert<Equal<NoteLinkRecord['deleted'], unknown>>;
export type Status = Assert<Equal<NoteLinkRelations['outgoing'][number]['status'], 'active' | 'deleted'>>;
export type Folder = Assert<Equal<NoteLinkRelations['backlinks'][number]['folderId'], string | null>>;
export type Occurrences = Assert<Equal<NoteLinkRelations['outgoing'][number]['occurrences'], NoteLinkOccurrence[]>>;
export type AddedBridge = Assert<Equal<typeof addedNoteLinkTargets, typeof bridgeAdded>>;
export type AssertBridge = Assert<Equal<typeof assertNoteLinkTarget, typeof bridgeAssert>>;
export type BuildBridge = Assert<Equal<typeof buildNoteLinkRelations, typeof bridgeBuild>>;
export type ActualSyncReturn = Assert<
  Equal<ReturnType<ReturnType<typeof createNoteService>['getNoteLinkRelations']>, NoteLinkRelations>
>;
export type ActualAsyncReturn = Assert<
  Equal<ReturnType<ReturnType<typeof createAsyncNoteService>['getNoteLinkRelations']>, Promise<NoteLinkRelations>>
>;
