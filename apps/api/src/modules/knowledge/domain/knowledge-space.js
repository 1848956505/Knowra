export class KnowledgeSpace {
  constructor({
    id,
    userId,
    name,
    description = '',
    defaultFlag = true,
    createdAt = new Date().toISOString(),
    updatedAt = createdAt
  }) {
    if (!id?.trim()) {
      throw new Error('KnowledgeSpace id is required');
    }
    if (!userId?.trim()) {
      throw new Error('KnowledgeSpace userId is required');
    }
    if (!name?.trim()) {
      throw new Error('KnowledgeSpace name is required');
    }

    this.id = id;
    this.userId = userId;
    this.name = name.trim();
    this.description = description.trim();
    this.defaultFlag = Boolean(defaultFlag);
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }
}
