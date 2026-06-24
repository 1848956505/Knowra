const TITLE_MAX_LENGTH = 30;

function compactText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function timestampIdPart(now = new Date()) {
  return now.toISOString().replace(/[-:.]/g, '');
}

function randomIdPart() {
  return Math.random().toString(36).slice(2, 8);
}

export function deriveKnowledgePointTitle(sourceText) {
  const compacted = compactText(sourceText);
  if (compacted.length <= TITLE_MAX_LENGTH) {
    return compacted;
  }
  return `${compacted.slice(0, TITLE_MAX_LENGTH)}...`;
}

export function buildKnowledgePointInputFromSelection({ note, selection, now = new Date() } = {}) {
  const sourceText = compactText(selection?.sourceText);
  if (!note?.id || !note?.spaceId || !sourceText) {
    throw new Error('Cannot create a knowledge point without note and selection text');
  }

  const idPart = `${timestampIdPart(now)}-${randomIdPart()}`;
  return {
    id: `kp-${idPart}`,
    spaceId: note.spaceId,
    noteId: note.id,
    title: deriveKnowledgePointTitle(sourceText),
    comment: '',
    tagIds: [],
    sources: [
      {
        id: `kps-${idPart}`,
        noteId: note.id,
        spaceId: note.spaceId,
        sourceText,
        anchor: selection.anchor ?? null,
        startOffset: selection.startOffset ?? null,
        endOffset: selection.endOffset ?? null,
        contextBefore: selection.contextBefore ?? '',
        contextAfter: selection.contextAfter ?? ''
      }
    ]
  };
}

export function buildKnowledgePointSourceInputFromSelection({ note, selection, now = new Date() } = {}) {
  const sourceText = compactText(selection?.sourceText);
  if (!note?.id || !note?.spaceId || !sourceText) {
    throw new Error('Cannot create a knowledge point source without note and selection text');
  }

  return {
    id: `kps-${timestampIdPart(now)}-${randomIdPart()}`,
    noteId: note.id,
    spaceId: note.spaceId,
    sourceText,
    anchor: selection.anchor ?? null,
    startOffset: selection.startOffset ?? null,
    endOffset: selection.endOffset ?? null,
    contextBefore: selection.contextBefore ?? '',
    contextAfter: selection.contextAfter ?? ''
  };
}
