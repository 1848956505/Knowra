import { asArray, getData } from './response.js';
import type { RequestJson } from './client.js';
import type { Folder, KnowledgeSpace, Note, Tag } from '../workspace/types.js';

export interface WorkspaceResources {
  folderTree: Folder[];
  notes: Note[];
  tags: Tag[];
}

export interface WorkspaceApi {
  loadWorkspaceResources(spaceId: string): Promise<WorkspaceResources>;
  searchNoteIds(input: { query?: string; spaceId?: string }): Promise<string[]>;
  listKnowledgeSpaces(): Promise<KnowledgeSpace[]>;
  createDefaultKnowledgeSpace(): Promise<KnowledgeSpace>;
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
    }
  };
}
