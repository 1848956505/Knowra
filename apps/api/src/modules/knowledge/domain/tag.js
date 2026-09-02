export class Tag {
  constructor({
    id,
    spaceId,
    name,
    color = 'neutral',
    groupId = null,
    code = null,
    isSystem = false,
    sortOrder = 0,
    createdAt = new Date().toISOString(),
    updatedAt = createdAt
  }) {
    if (!id?.trim()) {
      throw new Error('Tag id is required');
    }
    if (!spaceId?.trim()) {
      throw new Error('Tag spaceId is required');
    }
    if (!name?.trim()) {
      throw new Error('Tag name is required');
    }

    this.id = id;
    this.spaceId = spaceId;
    this.name = name.trim();
    this.color = color;
    this.groupId = groupId;
    this.code = code;
    this.isSystem = Boolean(isSystem);
    this.sortOrder = Number(sortOrder) || 0;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }
}
