export class Folder {
  constructor({
    id,
    spaceId,
    name,
    parentId = null,
    pathCache = '/',
    sortOrder = 0,
    createdAt = new Date().toISOString(),
    updatedAt = createdAt
  }) {
    if (!id?.trim()) {
      throw new Error('Folder id is required');
    }
    if (!spaceId?.trim()) {
      throw new Error('Folder spaceId is required');
    }
    if (!name?.trim()) {
      throw new Error('Folder name is required');
    }

    this.id = id;
    this.spaceId = spaceId;
    this.name = name.trim();
    this.parentId = parentId;
    this.pathCache = pathCache;
    this.sortOrder = sortOrder;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }
}
