import { getData } from '../api-response.js';

export function createAnnotationApi({ requestJson }) {
  return {
    createAnnotation: (input) => getData(requestJson('/api/knowledge/annotations', { method: 'POST', body: JSON.stringify(input) })),
    listAnnotations: ({ noteId, spaceId }) => getData(requestJson(`/api/knowledge/annotations?noteId=${encodeURIComponent(noteId)}&spaceId=${encodeURIComponent(spaceId ?? '')}`)),
    deleteAnnotation: (id) => getData(requestJson(`/api/knowledge/annotations/${encodeURIComponent(id)}`, { method: 'DELETE' })),
    restoreAnnotation: (id) => getData(requestJson(`/api/knowledge/annotations/${encodeURIComponent(id)}/restore`, { method: 'POST' })),
    updateAnnotationAnchor: (id, input) => getData(requestJson(`/api/knowledge/annotations/${encodeURIComponent(id)}/anchor`, { method: 'PATCH', body: JSON.stringify(input) }))
  };
}
