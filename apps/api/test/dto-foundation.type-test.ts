import {
  trimIfString,
  createSlug,
  createPrefixedId,
  requireText,
  normalizeOptionalId,
  normalizeIdList
} from '../src/modules/knowledge/application/dto/_shared.js';
import {
  buildDefaultKnowledgeSpaceDto,
  type DefaultKnowledgeSpaceDto,
  type DefaultKnowledgeSpaceInput
} from '../src/modules/knowledge/application/dto/knowledge-space.dto.js';
import { KnowledgeSpace } from '../src/modules/knowledge/domain/knowledge-space.js';
import type { KnowledgeSpaceConstructorInput } from '../src/modules/knowledge/domain/knowledge-space.js';
import type { KnowledgeSpaceRepository } from '../src/modules/knowledge/infrastructure/knowledge-space-repository.js';

type Assert<T extends true> = T;
type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
declare const unknownInput: unknown;
declare const stringOrNumber: string | number;
declare const repository: KnowledgeSpaceRepository;
const _unknownTrim = trimIfString(unknownInput);
const _unionTrim = trimIfString(stringOrNumber);
const _literalTrim = trimIfString(' x ' as const);
const _numberTrim = trimIfString(42 as const);
const _objectTrim = trimIfString({ marker: true as const });
const _nullTrim = trimIfString(null);
const _undefinedTrim = trimIfString(undefined);
const _text = requireText(unknownInput, 'CODE', 'message');
const _optional = normalizeOptionalId(unknownInput, 'CODE', 'message');
const _ids = normalizeIdList(unknownInput, 'CODE', 'message');
const _slug = createSlug(unknownInput);
const _id = createPrefixedId(unknownInput, unknownInput);
const _dto = buildDefaultKnowledgeSpaceDto({ userId: unknownInput });
const _space = new KnowledgeSpace(_dto);
repository.save(_space);

export type DtoFoundationContract = [
  Assert<Equal<typeof _unknownTrim, unknown>>,
  Assert<Equal<typeof _unionTrim, string | number>>,
  Assert<Equal<typeof _literalTrim, string>>,
  Assert<Equal<typeof _numberTrim, 42>>,
  Assert<Equal<typeof _objectTrim, { marker: true }>>,
  Assert<Equal<typeof _nullTrim, null>>,
  Assert<Equal<typeof _undefinedTrim, undefined>>,
  Assert<Equal<typeof _text, string>>,
  Assert<Equal<typeof _optional, string | null>>,
  Assert<Equal<typeof _ids, unknown[]>>,
  Assert<Equal<typeof _ids extends string[] ? true : false, false>>,
  Assert<Equal<typeof _ids extends (string | undefined)[] ? true : false, false>>,
  Assert<Equal<typeof _slug, string>>,
  Assert<Equal<typeof _id, string>>,
  Assert<Equal<typeof _dto, DefaultKnowledgeSpaceDto>>,
  Assert<DefaultKnowledgeSpaceDto extends KnowledgeSpaceConstructorInput ? true : false>,
  Assert<Equal<Parameters<typeof buildDefaultKnowledgeSpaceDto>[0], DefaultKnowledgeSpaceInput | undefined>>,
  Assert<Equal<Parameters<typeof requireText>[0], unknown>>,
  Assert<Equal<Parameters<typeof normalizeIdList>[0], unknown>>,
  Assert<Equal<Parameters<typeof createSlug>[0], unknown>>,
  Assert<
    Equal<
      ReturnType<typeof buildDefaultKnowledgeSpaceDto>,
      {
        id: string;
        userId: string;
        name: string;
        description: string;
      }
    >
  >
];

import { Note, type NoteConstructorInput } from '../src/modules/knowledge/domain/note.js';
const _note = new Note({ id: 'n', title: 'title', rawMarkdown: 'body', tagIds: _ids });
const _defaultNote = new Note({ id: 'n', title: 'title', rawMarkdown: 'body' });
const _stringNote = new Note({ id: 'n', title: 'title', rawMarkdown: 'body', tagIds: ['x'] });
const _sparseNote = new Note({ id: 'n', title: 'title', rawMarkdown: 'body', tagIds: ['x', undefined] });
const _numericNote = new Note({ id: 'n', title: 'title', rawMarkdown: 'body', tagIds: [42] });
const _markerNote = new Note({ id: 'n', title: 'title', rawMarkdown: 'body', tagIds: [{ marker: true }] });
export type NoteTagConsumerContract = [
  Assert<Equal<Note['tagIds'], string[]>>,
  Assert<Equal<NoteConstructorInput['tagIds'], string[] | undefined>>,
  Assert<Equal<typeof _note.tagIds, unknown[]>>,
  Assert<Equal<typeof _defaultNote.tagIds, string[]>>,
  Assert<Equal<typeof _stringNote.tagIds, string[]>>,
  Assert<Equal<typeof _sparseNote.tagIds, (string | undefined)[]>>,
  Assert<Equal<typeof _numericNote.tagIds, number[]>>,
  Assert<Equal<typeof _markerNote.tagIds, { marker: boolean }[]>>,
  Assert<Equal<typeof _note extends Note ? true : false, false>>,
  Assert<Equal<typeof _sparseNote extends Note ? true : false, false>>,
  Assert<Equal<typeof _note extends NoteConstructorInput ? true : false, false>>,
  Assert<typeof _stringNote extends Note ? true : false>
];
