import { asArray, asItems, getData } from './response.js';
import type { RequestJson } from './client.js';
import type { Annotation, Attachment, Folder, KnowledgeSpace, Note, NoteVersion, Tag, TagColor, TagGroup } from '../workspace/types.js';

export interface WorkspaceResources {
  folderTree: Folder[];
  notes: Note[];
  tags: Tag[];
  tagGroups?: TagGroup[];
}

export interface CreateNoteInput {
  id?: string;
  title?: string;
  rawMarkdown: string;
  spaceId?: string | null;
  folderId?: string | null;
  status?: string;
  sourceType?: string;
  favorite?: boolean;
  tagIds?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateFolderInput {
  id?: string;
  spaceId: string;
  parentId?: string | null;
  name: string;
  pathCache?: string;
}

export interface UpdateNoteInput {
  title?: string;
  folderId?: string | null;
  status?: string;
  rawMarkdown?: string;
  expectedUpdatedAt?: string;
}

export interface UploadAttachmentInput {
  noteId: string;
  fileName: string;
  mimeType: string;
  contentBase64: string;
}

export interface NoteQueryInput {
  query?: string;
  spaceId?: string;
  folderId?: string | null;
  tagId?: string | null;
  tagIds?: string[];
  tagMatch?: 'all' | 'any';
  favoriteOnly?: boolean;
  deletedOnly?: boolean;
  includeDeleted?: boolean;
  sortBy?: 'title' | 'createdAt' | 'updatedAt';
  order?: 'asc' | 'desc';
  offset?: number;
  limit?: number;
}

export interface NoteQueryPage {
  items: Note[];
  hasNext: boolean;
}

export interface CreateAnnotationInput {
  spaceId: string;
  noteId: string;
  quoteText: string;
  headingPath: string[];
  fromPosition: number;
  toPosition: number;
  prefixText: string;
  suffixText: string;
  anchorFingerprint: string;
  noteContentHash: string;
  idempotencyKey: string;
  kind: 'important';
  sourceMode: 'manual';
}

export type UpdateAnnotationAnchorInput = Pick<CreateAnnotationInput,
  'quoteText' | 'headingPath' | 'fromPosition' | 'toPosition' | 'prefixText' | 'suffixText' | 'anchorFingerprint' | 'noteContentHash'>;

export interface UpdateFolderInput {
  name?: string;
  parentId?: string | null;
}

export interface EmptyRecycleBinResult {
  deletedCount?: number;
  deleted?: number;
  noteIds?: string[];
}

export interface WorkspaceApi {
  loadWorkspaceResources(spaceId: string): Promise<WorkspaceResources>;
  searchNoteIds(input: { query?: string; spaceId?: string }): Promise<string[]>;
  listKnowledgeSpaces(): Promise<KnowledgeSpace[]>;
  createDefaultKnowledgeSpace(): Promise<KnowledgeSpace>;
  createNote(input: CreateNoteInput): Promise<Note>;
  importMarkdownNotes(items: CreateNoteInput[]): Promise<Note[]>;
  getNote(noteId: string): Promise<Note>;
  createFolder(input: CreateFolderInput): Promise<Folder>;
  updateNote(noteId: string, input: UpdateNoteInput): Promise<Note>;
  deleteNote(noteId: string): Promise<Note>;
  restoreNote(noteId: string): Promise<Note>;
  permanentlyDeleteNote(noteId: string): Promise<Note>;
  setNoteFavorite(noteId: string, favorite: boolean): Promise<Note>;
  setNoteTags(noteId: string, tagIds: string[]): Promise<Note>;
  createTag(input: { spaceId: string; name: string; color: TagColor; groupId: string }): Promise<Tag>;
  updateTag(tagId: string, input: { name?: string; color?: TagColor; groupId?: string; sortOrder?: number }): Promise<Tag>;
  deleteTag(tagId: string): Promise<Tag>;
  mergeTags(sourceTagId: string, targetTagId: string): Promise<Tag>;
  reorderTags(tagIds: string[]): Promise<Tag[]>;
  createTagGroup(input: { spaceId: string; name: string; selectionMode: 'single' | 'multiple' }): Promise<TagGroup>;
  updateTagGroup(groupId: string, input: { name?: string; selectionMode?: 'single' | 'multiple'; sortOrder?: number }): Promise<TagGroup>;
  deleteTagGroup(groupId: string): Promise<TagGroup>;
  deleteNotes(noteIds: string[]): Promise<Note[]>;
  assignTagToNotes(noteIds: string[], tagId: string): Promise<Note[]>;
  updateTagsForNotes(noteIds: string[], addTagIds: string[], removeTagIds: string[]): Promise<Note[]>;
  queryNotes(input: NoteQueryInput): Promise<NoteQueryPage>;
  getLinkedNotes(noteId: string): Promise<Note[]>;
  listAnnotations(noteId: string, spaceId: string): Promise<Annotation[]>;
  createAnnotation(input: CreateAnnotationInput): Promise<Annotation>;
  deleteAnnotation(annotationId: string): Promise<Annotation>;
  restoreAnnotation(annotationId: string): Promise<Annotation>;
  updateAnnotationAnchor(annotationId: string, input: UpdateAnnotationAnchorInput): Promise<Annotation>;
  listNoteVersions(noteId: string): Promise<NoteVersion[]>;
  getNoteVersion(noteId: string, versionId: string): Promise<NoteVersion>;
  listNoteAttachments(noteId: string): Promise<Attachment[]>;
  uploadNoteAttachment(input: UploadAttachmentInput): Promise<Attachment>;
  renameNoteAttachment(attachmentId: string, fileName: string): Promise<Attachment>;
  deleteNoteAttachment(attachmentId: string): Promise<Attachment>;
  updateFolder(folderId: string, input: UpdateFolderInput): Promise<Folder>;
  deleteFolder(folderId: string): Promise<Folder[]>;
  emptyRecycleBin(spaceId: string): Promise<EmptyRecycleBinResult>;
}

export function createWorkspaceApi({ requestJson }: { requestJson: RequestJson }): WorkspaceApi {
  function requireEntity<T extends { id?: string }>(value: T | undefined, message: string): T {
    if (!value?.id) throw new Error(message);
    return value;
  }

  return {
    async loadWorkspaceResources(spaceId) {
      const encodedSpaceId = encodeURIComponent(spaceId ?? '');
      const [folderTreePayload, notesPayload, tagsPayload, tagGroupsPayload] = await Promise.all([
        requestJson(`/api/knowledge/folders/tree?spaceId=${encodedSpaceId}`),
        requestJson(`/api/knowledge/notes?spaceId=${encodedSpaceId}&includeDeleted=true&summaryOnly=true`),
        requestJson(`/api/knowledge/tags?spaceId=${encodedSpaceId}`),
        requestJson(`/api/knowledge/tag-groups?spaceId=${encodedSpaceId}`)
      ]);
      return {
        folderTree: asArray<Folder>(getData(folderTreePayload)),
        notes: asArray<Note>(getData(notesPayload)),
        tags: asArray<Tag>(getData(tagsPayload)),
        tagGroups: asArray<TagGroup>(getData(tagGroupsPayload))
      };
    },
    async searchNoteIds({ query, spaceId }) {
      const params = [
        ['query', query ?? ''],
        ['spaceId', spaceId ?? ''],
        ['includeDeleted', 'true'],
        ['result', 'ids']
      ].map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join('&');
      return asArray<string>(getData(await requestJson(`/api/knowledge/search/notes?${params}`)));
    },
    async listKnowledgeSpaces() {
      return asArray<KnowledgeSpace>(getData(await requestJson('/api/knowledge/spaces')));
    },
    async createDefaultKnowledgeSpace() {
      const space = getData<KnowledgeSpace>(await requestJson('/api/knowledge/spaces/default', {
        method: 'POST',
        body: JSON.stringify({})
      }));
      if (!space?.id) throw new Error('Default knowledge space response is invalid.');
      return space;
    },
    async createNote(input) {
      const note = getData<Note>(await requestJson('/api/knowledge/notes', {
        method: 'POST',
        body: JSON.stringify(input)
      }));
      if (!note?.id) throw new Error('Create note response is invalid.');
      return note;
    },
    async importMarkdownNotes(items) {
      const path = items.length === 1
        ? '/api/knowledge/notes/import-markdown'
        : '/api/knowledge/notes/import-markdown-batch';
      const body = items.length === 1 ? items[0] : { items };
      const notes = asItems<Note>(getData(await requestJson(path, {
        method: 'POST',
        body: JSON.stringify(body)
      })));
      if (notes.length === 0 || notes.some((note) => !note?.id)) {
        throw new Error('Import Markdown response is invalid.');
      }
      return notes;
    },
    async getNote(noteId) {
      const note = getData<Note>(await requestJson(
        `/api/knowledge/notes/${encodeURIComponent(noteId)}`
      ));
      if (!note?.id) throw new Error('Note detail response is invalid.');
      return note;
    },
    async createFolder(input) {
      const folder = getData<Folder>(await requestJson('/api/knowledge/folders', {
        method: 'POST',
        body: JSON.stringify(input)
      }));
      if (!folder?.id) throw new Error('Create folder response is invalid.');
      return folder;
    },
    async updateNote(noteId, input) {
      const note = getData<Note>(await requestJson(
        `/api/knowledge/notes/${encodeURIComponent(noteId)}`,
        { method: 'PATCH', body: JSON.stringify(input) }
      ));
      if (!note?.id) throw new Error('Update note response is invalid.');
      return note;
    },
    async deleteNote(noteId) {
      const note = getData<Note>(await requestJson(
        `/api/knowledge/notes/${encodeURIComponent(noteId)}`,
        { method: 'DELETE' }
      ));
      if (!note?.id) throw new Error('Delete note response is invalid.');
      return note;
    },
    async restoreNote(noteId) {
      const note = getData<Note>(await requestJson(
        `/api/knowledge/notes/${encodeURIComponent(noteId)}/restore`,
        { method: 'POST' }
      ));
      if (!note?.id) throw new Error('Restore note response is invalid.');
      return note;
    },
    async permanentlyDeleteNote(noteId) {
      const note = getData<Note>(await requestJson(
        `/api/knowledge/notes/${encodeURIComponent(noteId)}/permanent`,
        { method: 'DELETE' }
      ));
      if (!note?.id) throw new Error('Permanent delete note response is invalid.');
      return note;
    },
    async setNoteFavorite(noteId, favorite) {
      const note = getData<Note>(await requestJson(
        `/api/knowledge/notes/${encodeURIComponent(noteId)}/favorite`,
        { method: 'POST', body: JSON.stringify({ favorite }) }
      ));
      if (!note?.id) throw new Error('Favorite note response is invalid.');
      return note;
    },
    async setNoteTags(noteId, tagIds) {
      const note = getData<Note>(await requestJson(
        `/api/knowledge/notes/${encodeURIComponent(noteId)}/tags`,
        { method: 'PUT', body: JSON.stringify({ tagIds }) }
      ));
      if (!note?.id) throw new Error('Set note tags response is invalid.');
      return note;
    },
    async createTag(input) {
      return requireEntity(getData<Tag>(await requestJson('/api/knowledge/tags', { method: 'POST', body: JSON.stringify(input) })), 'Create tag response is invalid.');
    },
    async updateTag(tagId, input) {
      return requireEntity(getData<Tag>(await requestJson(`/api/knowledge/tags/${encodeURIComponent(tagId)}`, { method: 'PATCH', body: JSON.stringify(input) })), 'Update tag response is invalid.');
    },
    async deleteTag(tagId) {
      return requireEntity(getData<Tag>(await requestJson(`/api/knowledge/tags/${encodeURIComponent(tagId)}`, { method: 'DELETE' })), 'Delete tag response is invalid.');
    },
    async mergeTags(sourceTagId, targetTagId) {
      return requireEntity(getData<Tag>(await requestJson('/api/knowledge/tags/merge', { method: 'POST', body: JSON.stringify({ sourceTagId, targetTagId }) })), 'Merge tags response is invalid.');
    },
    async reorderTags(tagIds) {
      return asItems<Tag>(getData(await requestJson('/api/knowledge/tags/reorder', { method: 'POST', body: JSON.stringify({ tagIds }) })));
    },
    async createTagGroup(input) {
      return requireEntity(getData<TagGroup>(await requestJson('/api/knowledge/tag-groups', { method: 'POST', body: JSON.stringify(input) })), 'Create tag group response is invalid.');
    },
    async updateTagGroup(groupId, input) {
      return requireEntity(getData<TagGroup>(await requestJson(`/api/knowledge/tag-groups/${encodeURIComponent(groupId)}`, { method: 'PATCH', body: JSON.stringify(input) })), 'Update tag group response is invalid.');
    },
    async deleteTagGroup(groupId) {
      return requireEntity(getData<TagGroup>(await requestJson(`/api/knowledge/tag-groups/${encodeURIComponent(groupId)}`, { method: 'DELETE' })), 'Delete tag group response is invalid.');
    },
    async deleteNotes(noteIds) {
      return asItems<Note>(getData(await requestJson('/api/knowledge/notes/batch/delete', {
        method: 'POST', body: JSON.stringify({ noteIds })
      })));
    },
    async assignTagToNotes(noteIds, tagId) {
      return asItems<Note>(getData(await requestJson('/api/knowledge/notes/batch/tags', {
        method: 'POST', body: JSON.stringify({ noteIds, tagId })
      })));
    },
    async updateTagsForNotes(noteIds, addTagIds, removeTagIds) {
      return asItems<Note>(getData(await requestJson('/api/knowledge/notes/batch/tags', {
        method: 'PATCH', body: JSON.stringify({ noteIds, addTagIds, removeTagIds })
      })));
    },
    async queryNotes(input) {
      const limit = Math.max(1, input.limit ?? 30);
      const values: Record<string, string | number | boolean | null | undefined> = {
        spaceId: input.spaceId,
        folderId: input.folderId,
        tagId: input.tagId,
        tagIds: input.tagIds?.join(','),
        match: input.tagMatch,
        favoriteOnly: input.favoriteOnly,
        deletedOnly: input.deletedOnly,
        includeDeleted: input.includeDeleted,
        sortBy: input.sortBy,
        order: input.order,
        offset: input.offset ?? 0,
        limit: limit + 1
      };
      const params = Object.entries(values)
        .filter(([, value]) => value !== undefined && value !== null && value !== false && value !== '')
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
        .join('&');
      const query = input.query?.trim();
      const path = query
        ? `/api/knowledge/search/notes?query=${encodeURIComponent(query)}&${params}`
        : `/api/knowledge/notes?summaryOnly=true&${params}`;
      const notes = asArray<Note>(getData(await requestJson(path)));
      return { items: notes.slice(0, limit), hasNext: notes.length > limit };
    },
    async getLinkedNotes(noteId) {
      return asArray<Note>(getData(await requestJson(
        `/api/knowledge/notes/${encodeURIComponent(noteId)}/links`
      )));
    },
    async listAnnotations(noteId, spaceId) {
      return asArray<Annotation>(getData(await requestJson(
        `/api/knowledge/annotations?noteId=${encodeURIComponent(noteId)}&spaceId=${encodeURIComponent(spaceId)}&includeDeleted=true`
      )));
    },
    async createAnnotation(input) {
      const annotation = getData<Annotation>(await requestJson('/api/knowledge/annotations', {
        method: 'POST', body: JSON.stringify(input)
      }));
      if (!annotation?.id) throw new Error('Create annotation response is invalid.');
      return annotation;
    },
    async deleteAnnotation(annotationId) {
      const annotation = getData<Annotation>(await requestJson(
        `/api/knowledge/annotations/${encodeURIComponent(annotationId)}`,
        { method: 'DELETE' }
      ));
      if (!annotation?.id) throw new Error('Delete annotation response is invalid.');
      return annotation;
    },
    async restoreAnnotation(annotationId) {
      const annotation = getData<Annotation>(await requestJson(
        `/api/knowledge/annotations/${encodeURIComponent(annotationId)}/restore`,
        { method: 'POST' }
      ));
      if (!annotation?.id) throw new Error('Restore annotation response is invalid.');
      return annotation;
    },
    async updateAnnotationAnchor(annotationId, input) {
      const annotation = getData<Annotation>(await requestJson(
        `/api/knowledge/annotations/${encodeURIComponent(annotationId)}/anchor`,
        { method: 'PATCH', body: JSON.stringify(input) }
      ));
      if (!annotation?.id) throw new Error('Update annotation anchor response is invalid.');
      return annotation;
    },
    async listNoteVersions(noteId) {
      return asArray<NoteVersion>(getData(await requestJson(
        `/api/knowledge/notes/${encodeURIComponent(noteId)}/versions`
      )));
    },
    async getNoteVersion(noteId, versionId) {
      const version = getData<NoteVersion>(await requestJson(
        `/api/knowledge/notes/${encodeURIComponent(noteId)}/versions/${encodeURIComponent(versionId)}`
      ));
      if (!version?.id) throw new Error('Note version response is invalid.');
      return version;
    },
    async listNoteAttachments(noteId) {
      return asArray<Attachment>(getData(await requestJson(
        `/api/storage/attachments?noteId=${encodeURIComponent(noteId)}`
      )));
    },
    async uploadNoteAttachment(input) {
      const attachment = getData<Attachment>(await requestJson('/api/storage/attachments', {
        method: 'POST',
        body: JSON.stringify(input)
      }));
      if (!attachment?.id) throw new Error('Upload attachment response is invalid.');
      return attachment;
    },
    async renameNoteAttachment(attachmentId, fileName) {
      const attachment = getData<Attachment>(await requestJson(
        `/api/storage/attachments/${encodeURIComponent(attachmentId)}`,
        { method: 'PATCH', body: JSON.stringify({ fileName }) }
      ));
      if (!attachment?.id) throw new Error('Rename attachment response is invalid.');
      return attachment;
    },
    async deleteNoteAttachment(attachmentId) {
      const attachment = getData<Attachment>(await requestJson(
        `/api/storage/attachments/${encodeURIComponent(attachmentId)}`,
        { method: 'DELETE' }
      ));
      if (!attachment?.id) throw new Error('Delete attachment response is invalid.');
      return attachment;
    },
    async updateFolder(folderId, input) {
      const folder = getData<Folder>(await requestJson(
        `/api/knowledge/folders/${encodeURIComponent(folderId)}`,
        { method: 'PATCH', body: JSON.stringify(input) }
      ));
      if (!folder?.id) throw new Error('Update folder response is invalid.');
      return folder;
    },
    async deleteFolder(folderId) {
      return asArray<Folder>(getData(await requestJson(
        `/api/knowledge/folders/${encodeURIComponent(folderId)}`,
        { method: 'DELETE' }
      )));
    },
    async emptyRecycleBin(spaceId) {
      return getData<EmptyRecycleBinResult>(await requestJson(
        `/api/knowledge/notes/recycle-bin?spaceId=${encodeURIComponent(spaceId ?? '')}`,
        { method: 'DELETE' }
      )) ?? {};
    }
  };
}
