import {
  commandSearchInput,
  commandSearchResults,
  assertCommandSearchOwner,
  type CommandSearchRequest,
  type CommandSearchInput,
  type CommandSearchNote,
  type CommandSearchHit
} from '../src/modules/knowledge/application/command-note-search.ts';
import {
  commandSearchInput as bridgeInput,
  commandSearchResults as bridgeResults,
  assertCommandSearchOwner as bridgeOwner
} from '../src/modules/knowledge/application/command-note-search.js';
import type { Note } from '../src/modules/knowledge/domain/note.ts';
import type { NoteRecord, NoteRepository } from '../src/modules/knowledge/infrastructure/note-repository.ts';
import type { KnowledgeSpaceRepository } from '../src/modules/knowledge/infrastructure/knowledge-space-repository.ts';
import { toQueryObject } from '../src/http/request.js';

declare const notes: NoteRepository;
declare const spaces: KnowledgeSpaceRepository;
declare const record: NoteRecord;
declare const domain: Note;
declare const unknownValue: unknown;
const request: CommandSearchRequest = toQueryObject(new URL('https://example.test/?query=q&spaceId=s'));
const scoped: CommandSearchInput = commandSearchInput(request);
const out: CommandSearchHit[] = commandSearchResults(notes.list(), scoped);
commandSearchResults([record, domain], scoped);
const readonlyNotes: readonly CommandSearchNote[] = Object.freeze([record, domain]);
commandSearchResults(readonlyNotes, scoped);
commandSearchInput();
commandSearchInput(undefined);
commandSearchInput({ query: null, spaceId: undefined, limit: unknownValue });
commandSearchInput({ query: undefined, spaceId: null });
commandSearchInput({
  query: 'q',
  spaceId: 's',
  limit: {
    valueOf() {
      return 2;
    }
  }
});
commandSearchInput({ query: 'q', spaceId: 's', limit: 2n });
const row: CommandSearchNote = {
  id: 'n',
  title: 't',
  folderId: undefined,
  spaceId: undefined,
  plainText: unknownValue,
  deleted: unknownValue
};
commandSearchResults([row, { id: 'n', title: 't', folderId: null }], scoped);
assertCommandSearchOwner(spaces.findById('s'), unknownValue);
assertCommandSearchOwner(null, unknownValue);
assertCommandSearchOwner(undefined, unknownValue);
assertCommandSearchOwner({}, unknownValue);
assertCommandSearchOwner({ userId: unknownValue }, unknownValue);
const nothing: void = assertCommandSearchOwner({ userId: {} }, {});
// 结构合法但会变化的 getter 仍被接受；成功结果只能是 string，变为 null/undefined 可以抛错。
let reads = 0;
const changing: CommandSearchRequest = {
  get query(): string | null | undefined {
    return ++reads % 3 ? 'q' : null;
  },
  get spaceId(): string | null | undefined {
    return ++reads % 4 ? 's' : undefined;
  }
};
const changingOutput: CommandSearchInput = commandSearchInput(changing);
const query: string = changingOutput.query;
const space: string = changingOutput.spaceId;
out.push({ id: 'new', title: 'mutable', folderId: null, snippet: '' });
out[0].id = 'changed';
out[0].title = 'changed';
out[0].folderId = '';
out[0].snippet = 'changed';
void [nothing, query, space];
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
export type Request = Assert<Equal<Parameters<typeof commandSearchInput>, [input?: CommandSearchRequest | undefined]>>;
export type InputOutput = Assert<Equal<ReturnType<typeof commandSearchInput>, CommandSearchInput>>;
export type RequestQuery = Assert<Equal<CommandSearchRequest['query'], string | null | undefined>>;
export type RequestSpace = Assert<Equal<CommandSearchRequest['spaceId'], string | null | undefined>>;
export type RequestLimit = Assert<Equal<CommandSearchRequest['limit'], unknown>>;
export type Query = Assert<Equal<CommandSearchInput['query'], string>>;
export type Space = Assert<Equal<CommandSearchInput['spaceId'], string>>;
export type Limit = Assert<Equal<CommandSearchInput['limit'], number>>;
export type ResultsInput = Assert<
  Equal<Parameters<typeof commandSearchResults>, [notes: readonly CommandSearchNote[], input: CommandSearchInput]>
>;
export type ResultsOutput = Assert<Equal<ReturnType<typeof commandSearchResults>, CommandSearchHit[]>>;
export type NoteId = Assert<Equal<CommandSearchNote['id'], string>>;
export type NoteTitle = Assert<Equal<CommandSearchNote['title'], string>>;
export type NoteSpace = Assert<Equal<CommandSearchNote['spaceId'], string | null | undefined>>;
export type NoteFolder = Assert<Equal<CommandSearchNote['folderId'], string | null | undefined>>;
export type NoteText = Assert<Equal<CommandSearchNote['plainText'], unknown>>;
export type NoteDeleted = Assert<Equal<CommandSearchNote['deleted'], unknown>>;
export type HitId = Assert<Equal<CommandSearchHit['id'], string>>;
export type HitTitle = Assert<Equal<CommandSearchHit['title'], string>>;
export type HitFolder = Assert<Equal<CommandSearchHit['folderId'], string | null>>;
export type HitSnippet = Assert<Equal<CommandSearchHit['snippet'], string>>;
export type HitKeys = Assert<Equal<keyof CommandSearchHit, 'id' | 'title' | 'folderId' | 'snippet'>>;
export type OwnerInput = Assert<
  Equal<Parameters<typeof assertCommandSearchOwner>, [space: { userId?: unknown } | null | undefined, ownerId: unknown]>
>;
export type OwnerOutput = Assert<Equal<ReturnType<typeof assertCommandSearchOwner>, void>>;
export type InputBridge = Assert<Equal<typeof bridgeInput, typeof commandSearchInput>>;
export type ResultsBridge = Assert<Equal<typeof bridgeResults, typeof commandSearchResults>>;
export type OwnerBridge = Assert<Equal<typeof bridgeOwner, typeof assertCommandSearchOwner>>;
