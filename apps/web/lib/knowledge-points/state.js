function withoutPoint(points, pointId) {
  return (points ?? []).filter((point) => point.id !== pointId);
}

function getCollections(collections = {}) {
  return {
    knowledgePoints: collections.knowledgePoints ?? [],
    allKnowledgePoints: collections.allKnowledgePoints ?? []
  };
}

export function insertKnowledgePointCollections(collections, point) {
  const current = getCollections(collections);
  return {
    knowledgePoints: [point, ...withoutPoint(current.knowledgePoints, point.id)],
    allKnowledgePoints: [point, ...withoutPoint(current.allKnowledgePoints, point.id)]
  };
}

export function replaceKnowledgePointCollections(collections, point) {
  const current = getCollections(collections);
  return {
    knowledgePoints: current.knowledgePoints.map((item) => (item.id === point.id ? point : item)),
    allKnowledgePoints: current.allKnowledgePoints.map((item) => (item.id === point.id ? point : item))
  };
}

export function removeKnowledgePointCollections(collections, pointId) {
  const current = getCollections(collections);
  return {
    knowledgePoints: withoutPoint(current.knowledgePoints, pointId),
    allKnowledgePoints: withoutPoint(current.allKnowledgePoints, pointId)
  };
}

export function syncKnowledgePointMembershipCollections(collections, point, currentNoteId) {
  const current = getCollections(collections);
  const nextAllKnowledgePoints = [point, ...withoutPoint(current.allKnowledgePoints, point.id)];
  const belongsToCurrentNote = Boolean(currentNoteId && (point.noteIds ?? []).includes(currentNoteId));

  return {
    knowledgePoints: belongsToCurrentNote
      ? [point, ...withoutPoint(current.knowledgePoints, point.id)]
      : withoutPoint(current.knowledgePoints, point.id),
    allKnowledgePoints: nextAllKnowledgePoints
  };
}

export function buildCurrentNoteKnowledgePointSources(points, currentNoteId) {
  if (!currentNoteId) {
    return [];
  }

  return (points ?? []).flatMap((point) => (point.sources ?? [])
    .filter((source) => source.noteId === currentNoteId)
    .map((source) => ({
      ...source,
      knowledgePointId: point.id
    })));
}
