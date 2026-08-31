import { asArray, asItems, getData } from './response.js';
import type { RequestJson } from './client.js';
import type { Folder, KnowledgeSpace, Note, Tag } from '../workspace/types.js';

export interface WorkspaceResources {
  folderTree: Folder[];
  notes: Note[];
  tags: Tag[];
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
  rawMarkdown?: string;
  expectedUpdatedAt?: string;
}

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
  setNoteFavorite(noteId: string, favorite: boolean): Promise<Note>;
  updateFolder(folderId: string, input: UpdateFolderInput): Promise<Folder>;
  deleteFolder(folderId: string): Promise<Folder[]>;
  emptyRecycleBin(spaceId: string): Promise<EmptyRecycleBinResult>;
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
    async setNoteFavorite(noteId, favorite) {
      const note = getData<Note>(await requestJson(
        `/api/knowledge/notes/${encodeURIComponent(noteId)}/favorite`,
        { method: 'POST', body: JSON.stringify({ favorite }) }
      ));
      if (!note?.id) throw new Error('Favorite note response is invalid.');
      return note;
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
