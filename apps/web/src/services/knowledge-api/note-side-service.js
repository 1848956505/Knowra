import { asArray } from '../api-response.js';

export function createNoteSideApi({ requestJson }) {
  async function loadNoteSideData({ noteId, spaceId }) {
    const encodedNoteId = encodeURIComponent(noteId ?? '');
    const encodedSpaceId = encodeURIComponent(spaceId ?? '');
    const [
      linkedPayload,
      attachmentsPayload,
      annotationsPayload
    ] = await Promise.all([
      requestJson(`/api/knowledge/notes/${encodedNoteId}/links`),
      requestJson(`/api/storage/attachments?noteId=${encodedNoteId}`),
      requestJson(`/api/knowledge/annotations?spaceId=${encodedSpaceId}&noteId=${encodedNoteId}`)
    ]);

    return {
      linkedNotes: asArray(linkedPayload.data),
      attachments: asArray(attachmentsPayload.data),
      annotations: asArray(annotationsPayload.data)
    };
  }

  return { loadNoteSideData };
}
