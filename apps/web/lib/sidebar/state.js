export function createClearedNoteSideData({ editing = null, keepEditing = false } = {}) {
  return {
    linkedNotes: [],
    attachments: [],
    knowledgePoints: [],
    allKnowledgePoints: [],
    knowledgePointTagGroups: [],
    knowledgePointEditing: keepEditing ? editing : null
  };
}
