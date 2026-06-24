export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

export function normalizeKnowledgePointQuery(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function buildKnowledgePointTagMap(tagGroups = []) {
  const tags = new Map();
  tagGroups.forEach((group) => {
    (group.tags ?? []).forEach((tag) => {
      tags.set(tag.id, { ...tag, group });
    });
  });
  return tags;
}
