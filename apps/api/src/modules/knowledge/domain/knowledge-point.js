export class KnowledgePoint {
  constructor({
    id,
    spaceId,
    title,
    comment = '',
    status = 'active',
    deletedAt = null,
    createdAt = new Date().toISOString(),
    updatedAt = createdAt
  }) {
    if (!id?.trim()) {
      throw new Error('Knowledge point id is required');
    }
    if (!spaceId?.trim()) {
      throw new Error('Knowledge point spaceId is required');
    }
    if (!title?.trim()) {
      throw new Error('Knowledge point title is required');
    }

    this.id = id;
    this.spaceId = spaceId;
    this.title = title.trim();
    this.comment = comment;
    this.status = status;
    this.deletedAt = deletedAt;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }
}

export class KnowledgePointSource {
  constructor({
    id,
    knowledgePointId,
    noteId,
    spaceId,
    sourceText,
    sourceTextHash = '',
    anchor = null,
    startOffset = null,
    endOffset = null,
    blockId = null,
    noteVersion = null,
    contextBefore = '',
    contextAfter = '',
    sortOrder = 0,
    isAnchorValid = true,
    createdAt = new Date().toISOString(),
    updatedAt = createdAt
  }) {
    if (!id?.trim()) {
      throw new Error('Knowledge point source id is required');
    }
    if (!knowledgePointId?.trim()) {
      throw new Error('Knowledge point source knowledgePointId is required');
    }
    if (!noteId?.trim()) {
      throw new Error('Knowledge point source noteId is required');
    }
    if (!spaceId?.trim()) {
      throw new Error('Knowledge point source spaceId is required');
    }
    if (!sourceText?.trim()) {
      throw new Error('Knowledge point source text is required');
    }

    this.id = id;
    this.knowledgePointId = knowledgePointId;
    this.noteId = noteId;
    this.spaceId = spaceId;
    this.sourceText = sourceText;
    this.sourceTextHash = sourceTextHash;
    this.anchor = anchor;
    this.startOffset = startOffset;
    this.endOffset = endOffset;
    this.blockId = blockId;
    this.noteVersion = noteVersion;
    this.contextBefore = contextBefore;
    this.contextAfter = contextAfter;
    this.sortOrder = sortOrder;
    this.isAnchorValid = isAnchorValid;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }
}
