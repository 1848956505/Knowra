import { normalizeKnowledgePointQuery } from './panel-utils.js';

export function filterKnowledgePoints(points = [], filters = {}) {
  const query = normalizeKnowledgePointQuery(filters.query);
  const selectedTagIds = Array.isArray(filters.tagIds) ? filters.tagIds : [];

  return points.filter((point) => {
    const text = [
      point.title,
      point.comment,
      ...(point.sources ?? []).map((source) => source.sourceText)
    ].join(' ').toLowerCase();
    const matchesQuery = query ? text.includes(query) : true;
    const matchesTags = selectedTagIds.every((tagId) => (point.tagIds ?? []).includes(tagId));
    return matchesQuery && matchesTags;
  });
}
