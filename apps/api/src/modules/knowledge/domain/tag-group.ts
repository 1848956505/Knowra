export type TagGroupSelectionMode = 'single' | 'multiple';

export interface TagGroupConstructorInput {
  id: string;
  spaceId: string;
  code?: string | null;
  name: string;
  selectionMode?: string;
  isSystem?: unknown;
  sortOrder?: unknown;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export class TagGroup {
  declare id: string;
  declare spaceId: string;
  declare code: string | null;
  declare name: string;
  declare selectionMode: string;
  declare isSystem: boolean;
  declare sortOrder: number;
  declare createdAt: string | null;
  declare updatedAt: string | null;

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
  }: TagGroupConstructorInput) {
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
