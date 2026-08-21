import { asArray, getData } from './response.js';
import type { RequestJson } from './client.js';
import type { Folder, KnowledgeSpace, Note, Tag } from '../workspace/types.js';

export interface WorkspaceResources {
  folderTree: Folder[];
  notes: Note[];
  tags: Tag[];
}

export interface CreateFolderInput {
  name: string;
  spaceId: string;
  parentId?: string | null;
}

export interface UpdateFolderInput {
  name?: string;
  parentId?: string | null;
}

export interface CreateNoteInput {
  title?: string;
  rawMarkdown: string;
  spaceId: string;
  folderId?: string | null;
  tagIds?: string[];
  status?: string;
  sourceType?: string;
}

export interface UpdateNoteInput {
  title?: string;
  folderId?: string | null;
  tagIds?: string[];
  status?: string;
  favorite?: boolean;
}

export interface WorkspaceApi {
  loadWorkspaceResources(spaceId: string): Promise<WorkspaceResources>;
  searchNoteIds(input: { query?: string; spaceId?: string }): Promise<string[]>;
  listKnowledgeSpaces(): Promise<KnowledgeSpace[]>;
  createDefaultKnowledgeSpace(): Promise<KnowledgeSpace>;
  createFolder(input: CreateFolderInput): Promise<Folder>;
  updateFolder(folderId: string, input: UpdateFolderInput): Promise<Folder>;
  deleteFolder(folderId: string): Promise<Folder[]>;
  createNote(input: CreateNoteInput): Promise<Note>;
  updateNote(noteId: string, input: UpdateNoteInput): Promise<Note>;
  deleteNote(noteId: string): Promise<Note>;
  restoreNote(noteId: string): Promise<Note>;
  permanentlyDeleteNote(noteId: string): Promise<Note>;
  setNoteFavorite(noteId: string, favorite: boolean): Promise<Note>;
  setNoteTags(noteId: string, tagIds: string[]): Promise<Note>;
}

export function createWorkspaceApi({ requestJson }: { requestJson: RequestJson }): WorkspaceApi {
  return {
    async loadWorkspaceResources(spaceId) {
      const encodedSpaceId = encodeURIComponent(spaceId ?? '');
      const [folderTreePayload, notesPayload, tagsPayload] = await Promise.all([
        requestJson(`/api/knowledge/folders/tree?spaceId=${encodedSpaceId}`),
        requestJson(`/api/knowledge/notes?spaceId=${encodedSpaceId}&includeDeleted=true&summaryOnly=true`),
        requestJson(`/api/knowledge/tags?spaceId=${encodedSpaceId}`)
      ]);
      return {
        folderTree: asArray<Folder>(getData(folderTreePayload)),
        notes: asArray<Note>(getData(notesPayload)),
        tags: asArray<Tag>(getData(tagsPayload))
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
    async createFolder(input) {
      const folder = getData<Folder>(await requestJson('/api/knowledge/folders', {
        method: 'POST',
        body: JSON.stringify(input)
      }));
      if (!folder?.id) throw new Error('Create folder response is invalid.');
      return folder;
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
    async createNote(input) {
      const note = getData<Note>(await requestJson('/api/knowledge/notes', {
        method: 'POST',
        body: JSON.stringify(input)
      }));
      if (!note?.id) throw new Error('Create note response is invalid.');
      return note;
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
      if (!note?.id) throw new Error('Permanent delete response is invalid.');
      return note;
    },
    async setNoteFavorite(noteId, favorite) {
      const note = getData<Note>(await requestJson(
        `/api/knowledge/notes/${encodeURIComponent(noteId)}/favorite`,
        { method: 'POST', body: JSON.stringify({ favorite }) }
      ));
      if (!note?.id) throw new Error('Favorite response is invalid.');
      return note;
    },
    async setNoteTags(noteId, tagIds) {
      const note = getData<Note>(await requestJson(
        `/api/knowledge/notes/${encodeURIComponent(noteId)}/tags`,
        { method: 'PUT', body: JSON.stringify({ tagIds }) }
      ));
      if (!note?.id) throw new Error('Tag update response is invalid.');
      return note;
    }
  };
}
