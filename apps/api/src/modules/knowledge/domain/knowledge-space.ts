export interface KnowledgeSpaceConstructorInput {
  id: string;
  userId: string;
  name: string;
  description?: string;
  defaultFlag?: unknown;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export class KnowledgeSpace {
  declare id: string;
  declare userId: string;
  declare name: string;
  declare description: string;
  declare defaultFlag: boolean;
  declare createdAt: string | null;
  declare updatedAt: string | null;

  constructor({
    id,
    userId,
    name,
    description = '',
    defaultFlag = true,
    createdAt = new Date().toISOString(),
    updatedAt = createdAt
  }: KnowledgeSpaceConstructorInput) {
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
