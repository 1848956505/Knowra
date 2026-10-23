import { Note, type NoteConstructorInput, type NoteDeletionPackage } from '../src/modules/knowledge/domain/note.js';
import type { NoteRecord } from '../src/modules/knowledge/infrastructure/note-repository.js';
import type { AnnotationStructure } from '@study-accelerator/content-anchor';
type Assert<T extends true> = T;
type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
declare const history: NoteRecord;
const _historical = new Note(history);
const _ordinary = new Note({ id: 'n', title: 'title', rawMarkdown: 'body' });
const _unusual = new Note({
  id: 'n',
  title: 'title',
  rawMarkdown: 'body',
  favorite: 'yes',
  createdAt: 42,
  updatedAt: false,
  annotationStructure: false
});
const _fallback = new Note({ id: 'n', title: 'title', rawMarkdown: 'body', createdAt: 42 });
export type Audit = [
  Assert<Equal<typeof _historical.favorite, unknown>>,
  Assert<Equal<typeof _historical.createdAt, unknown>>,
  Assert<Equal<typeof _historical.annotationStructure, NonNullable<unknown> | AnnotationStructure>>,
  Assert<Equal<typeof _ordinary.favorite, boolean>>,
  Assert<Equal<typeof _ordinary.annotationStructure, AnnotationStructure>>,
  Assert<Equal<typeof _unusual.favorite, string | boolean>>,
  Assert<Equal<typeof _unusual.createdAt, number | string>>,
  Assert<Equal<typeof _unusual.updatedAt, boolean | number | string>>,
  Assert<Equal<typeof _unusual.annotationStructure, boolean | AnnotationStructure>>,
  Assert<Equal<typeof _fallback.updatedAt, number | string | null>>,
  Assert<typeof _historical extends Note ? false : true>,
  Assert<typeof _unusual extends Note ? false : true>
];

type DefaultPassthrough = {
  status: string;
  sourceType: string;
  favorite: boolean;
  deleted: boolean;
  contentHash: string | null;
  annotationStructure: AnnotationStructure;
  createdAt: string | null;
  updatedAt: string | null;
  folderDeletionPackageId: string | null;
  deletionPackage: NoteDeletionPackage | null;
};
export type DefaultAndUnknownContracts = [
  Assert<Equal<Pick<Note, keyof DefaultPassthrough>, DefaultPassthrough>>,
  Assert<Equal<NoteConstructorInput['favorite'], boolean | undefined>>,
  Assert<Equal<NoteConstructorInput['createdAt'], string | null | undefined>>,
  Assert<Equal<typeof _historical.status, unknown>>,
  Assert<Equal<typeof _historical.sourceType, unknown>>,
  Assert<Equal<typeof _historical.deleted, unknown>>,
  Assert<Equal<typeof _historical.contentHash, unknown>>,
  Assert<Equal<typeof _historical.updatedAt, unknown>>,
  Assert<Equal<typeof _historical.folderDeletionPackageId, unknown>>,
  Assert<Equal<typeof _historical.deletionPackage, unknown>>,
  Assert<typeof _historical.annotationStructure extends AnnotationStructure ? false : true>
];
