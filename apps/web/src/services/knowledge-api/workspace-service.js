import { asArray, getData } from '../api-response.js';

export function createWorkspaceApi({ requestJson }) {
  async function loadWorkspaceResources(spaceId) {
    const encodedSpaceId = encodeURIComponent(spaceId ?? '');
    const [folderTreePayload, notesPayload, tagsPayload] = await Promise.all([
      requestJson(`/api/knowledge/folders/tree?spaceId=${encodedSpaceId}`),
      requestJson(`/api/knowledge/notes?spaceId=${encodedSpaceId}&includeDeleted=true&summaryOnly=true`),
      requestJson(`/api/knowledge/tags?spaceId=${encodedSpaceId}`)
    ]);

    return {
      folderTree: asArray(folderTreePayload.data),
      notes: asArray(notesPayload.data),
      tags: asArray(tagsPayload.data)
    };
  }

  async function searchNoteIds({ query, spaceId }) {
    const params = new URLSearchParams({
      query: String(query ?? ''),
      spaceId: String(spaceId ?? ''),
      includeDeleted: 'true',
      result: 'ids'
    });
    return asArray(getData(await requestJson(`/api/knowledge/search/notes?${params}`)));
  }

  async function listKnowledgeSpaces() {
    return asArray(getData(await requestJson('/api/knowledge/spaces')));
  }

  async function createDefaultKnowledgeSpace() {
    return getData(await requestJson('/api/knowledge/spaces/default', {
      method: 'POST',
      body: JSON.stringify({})
    }));
  }

  return {
    loadWorkspaceResources,
    searchNoteIds,
    listKnowledgeSpaces,
    createDefaultKnowledgeSpace
  };
}
