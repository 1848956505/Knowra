export class TagGroup {
  constructor({
    id,
    spaceId,
    code = null,
    name,
    selectionMode = 'multiple',
    isSystem = false,
    sortOrder = 0,
    createdAt = new Date().toISOString(),
    updatedAt = createdAt
  }) {
    if (!id?.trim()) throw new Error('Tag group id is required');
    if (!spaceId?.trim()) throw new Error('Tag group spaceId is required');
    if (!name?.trim()) throw new Error('Tag group name is required');
    if (!['single', 'multiple'].includes(selectionMode)) throw new Error('Tag group selectionMode is invalid');
    this.id = id;
    this.spaceId = spaceId;
    this.code = code;
    this.name = name.trim();
    this.selectionMode = selectionMode;
    this.isSystem = Boolean(isSystem);
    this.sortOrder = Number(sortOrder) || 0;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }
}
