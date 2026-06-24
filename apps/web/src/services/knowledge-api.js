import { apiClient } from './api-client.js';
import { asArray, asItems, getData } from './api-response.js';
export function createKnowledgeApi({ requestJson = apiClient.requestJson } = {}) {
  async function loadWorkspaceResources(spaceId) {
    const encodedSpaceId = encodeURIComponent(spaceId ?? '');
    const [folderTreePayload, notesPayload, tagsPayload] = await Promise.all([
      requestJson(`/api/knowledge/folders/tree?spaceId=${encodedSpaceId}`),
      requestJson(`/api/knowledge/notes?spaceId=${encodedSpaceId}&includeDeleted=true`),
      requestJson(`/api/knowledge/tags?spaceId=${encodedSpaceId}`)
    ]);

    return {
      folderTree: asArray(folderTreePayload.data),
      notes: asArray(notesPayload.data),
      tags: asArray(tagsPayload.data)
    };
  }

  async function loadNoteSideData({ noteId, spaceId }) {
    const encodedNoteId = encodeURIComponent(noteId ?? '');
    const encodedSpaceId = encodeURIComponent(spaceId ?? '');
    const [
      linkedPayload,
      attachmentsPayload,
      knowledgePointsPayload,
      allKnowledgePointsPayload,
      tagGroupsPayload
    ] = await Promise.all([
      requestJson(`/api/knowledge/notes/${encodedNoteId}/links`),
      requestJson(`/api/storage/attachments?noteId=${encodedNoteId}`),
      requestJson(`/api/knowledge/knowledge-points?spaceId=${encodedSpaceId}&noteId=${encodedNoteId}`),
      requestJson(`/api/knowledge/knowledge-points?spaceId=${encodedSpaceId}`),
      requestJson(`/api/knowledge/knowledge-point-tag-groups?spaceId=${encodedSpaceId}`)
    ]);

    return {
      linkedNotes: asArray(linkedPayload.data),
      attachments: asArray(attachmentsPayload.data),
      knowledgePoints: asArray(knowledgePointsPayload.data),
      allKnowledgePoints: asArray(allKnowledgePointsPayload.data),
      knowledgePointTagGroups: asArray(tagGroupsPayload.data)
    };
  }

  async function createKnowledgePoint(input) {
    return getData(await requestJson('/api/knowledge/knowledge-points', {
      method: 'POST',
      body: JSON.stringify(input)
    }));
  }

  async function listKnowledgeSpaces() {
    return asArray(getData(await requestJson('/api/knowledge/spaces')));
  }

  async function createDefaultKnowledgeSpace(input) {
    return getData(await requestJson('/api/knowledge/spaces/default', {
      method: 'POST',
      body: JSON.stringify(input)
    }));
  }

  async function createFolder(input) {
    return getData(await requestJson('/api/knowledge/folders', {
      method: 'POST',
      body: JSON.stringify(input)
    }));
  }

  async function updateFolder(folderId, updates) {
    return getData(await requestJson(
      `/api/knowledge/folders/${encodeURIComponent(folderId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(updates)
      }
    ));
  }

  async function deleteFolder(folderId) {
    return getData(await requestJson(
      `/api/knowledge/folders/${encodeURIComponent(folderId)}`,
      { method: 'DELETE' }
    ));
  }

  async function createNote(input) {
    return getData(await requestJson('/api/knowledge/notes', {
      method: 'POST',
      body: JSON.stringify(input)
    }));
  }

  async function importMarkdownNotes(items) {
    const normalizedItems = Array.isArray(items) ? items : [];
    if (normalizedItems.length === 1) {
      return asItems(getData(await requestJson('/api/knowledge/notes/import-markdown', {
        method: 'POST',
        body: JSON.stringify(normalizedItems[0])
      })));
    }

    return asItems(getData(await requestJson('/api/knowledge/notes/import-markdown-batch', {
      method: 'POST',
      body: JSON.stringify({ items: normalizedItems })
    })));
  }

  async function updateNote(noteId, updates) {
    return getData(await requestJson(
      `/api/knowledge/notes/${encodeURIComponent(noteId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(updates)
      }
    ));
  }

  async function deleteNote(noteId) {
    return getData(await requestJson(
      `/api/knowledge/notes/${encodeURIComponent(noteId)}`,
      { method: 'DELETE' }
    ));
  }

  async function permanentlyDeleteNote(noteId) {
    return getData(await requestJson(
      `/api/knowledge/notes/${encodeURIComponent(noteId)}/permanent`,
      { method: 'DELETE' }
    ));
  }

  async function restoreNote(noteId) {
    return getData(await requestJson(
      `/api/knowledge/notes/${encodeURIComponent(noteId)}/restore`,
      { method: 'POST' }
    ));
  }

  async function emptyRecycleBin(spaceId) {
    return getData(await requestJson(
      `/api/knowledge/notes/recycle-bin?spaceId=${encodeURIComponent(spaceId ?? '')}`,
      { method: 'DELETE' }
    ));
  }

  async function setNoteFavorite(noteId, favorite) {
    return getData(await requestJson(
      `/api/knowledge/notes/${encodeURIComponent(noteId)}/favorite`,
      {
        method: 'POST',
        body: JSON.stringify({ favorite })
      }
    ));
  }

  async function setNoteTags(noteId, tagIds) {
    return getData(await requestJson(
      `/api/knowledge/notes/${encodeURIComponent(noteId)}/tags`,
      {
        method: 'PUT',
        body: JSON.stringify({ tagIds })
      }
    ));
  }

  async function removeTagFromNote(noteId, tagId) {
    return getData(await requestJson(
      `/api/knowledge/notes/${encodeURIComponent(noteId)}/tags/${encodeURIComponent(tagId)}`,
      { method: 'DELETE' }
    ));
  }

  async function createTag(input) {
    return getData(await requestJson('/api/knowledge/tags', {
      method: 'POST',
      body: JSON.stringify(input)
    }));
  }

  async function deleteTag(tagId) {
    return getData(await requestJson(
      `/api/knowledge/tags/${encodeURIComponent(tagId)}`,
      { method: 'DELETE' }
    ));
  }

  async function addSourceToKnowledgePoint(pointId, input) {
    return getData(await requestJson(
      `/api/knowledge/knowledge-points/${encodeURIComponent(pointId)}/sources`,
      {
        method: 'POST',
        body: JSON.stringify(input)
      }
    ));
  }

  async function deleteKnowledgePointSource(sourceId) {
    return getData(await requestJson(
      `/api/knowledge/knowledge-point-sources/${encodeURIComponent(sourceId)}`,
      { method: 'DELETE' }
    ));
  }

  async function deleteKnowledgePoint(pointId) {
    return getData(await requestJson(
      `/api/knowledge/knowledge-points/${encodeURIComponent(pointId)}`,
      { method: 'DELETE' }
    ));
  }

  async function updateKnowledgePoint(pointId, updates) {
    return getData(await requestJson(
      `/api/knowledge/knowledge-points/${encodeURIComponent(pointId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(updates)
      }
    ));
  }

  return {
    loadWorkspaceResources,
    loadNoteSideData,
    listKnowledgeSpaces,
    createDefaultKnowledgeSpace,
    createFolder,
    updateFolder,
    deleteFolder,
    createNote,
    importMarkdownNotes,
    updateNote,
    deleteNote,
    permanentlyDeleteNote,
    restoreNote,
    emptyRecycleBin,
    setNoteFavorite,
    setNoteTags,
    removeTagFromNote,
    createTag,
    deleteTag,
    createKnowledgePoint,
    addSourceToKnowledgePoint,
    deleteKnowledgePointSource,
    deleteKnowledgePoint,
    updateKnowledgePoint
  };
}

export const knowledgeApi = createKnowledgeApi();
