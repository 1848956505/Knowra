export function hasActiveSearchFilters(search) {
  return Boolean(search.keyword || search.selectedTagIds.length);
}

export function getSelectedSearchTags(tags, search) {
  return search.selectedTagIds
    .map((tagId) => tags.find((tag) => tag.id === tagId))
    .filter(Boolean);
}

export function getVisibleSearchTags(tags, search) {
  if (!search.keyword) {
    return tags;
  }

  return tags.filter((tag) => String(tag.name ?? '').toLowerCase().includes(search.keyword));
}

export function getTagUsageCount(notes, tagId) {
  return notes.filter((note) => (note.tagIds ?? []).includes(tagId)).length;
}

export function withTagUsageCounts(tags, notes) {
  return tags.map((tag) => ({
    ...tag,
    usageCount: getTagUsageCount(notes, tag.id)
  }));
}

export function matchesSearch(value, search) {
  if (!search.keyword) {
    return true;
  }

  return String(value ?? '').toLowerCase().includes(search.keyword);
}

export function noteMatchesSelectedTags(note, search) {
  if (!search.selectedTagIds.length) {
    return true;
  }

  const noteTagIds = note.tagIds ?? [];
  return search.selectedTagIds.every((tagId) => noteTagIds.includes(tagId));
}

export function toggleSearchTagId(selectedTagIds, tagId) {
  if (!tagId) {
    return selectedTagIds;
  }

  if (selectedTagIds.includes(tagId)) {
    return selectedTagIds.filter((currentTagId) => currentTagId !== tagId);
  }

  return [...selectedTagIds, tagId];
}
