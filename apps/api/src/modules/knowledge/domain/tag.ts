// 默认 string | null 契约不变；泛型保留未收窄的颜色值及原 neutral 默认。
export interface TagConstructorInput<Color = string | null> {
  id: string;
  spaceId: string;
  name: string;
  color?: Color | string;
  groupId?: string | null;
  code?: string | null;
  isSystem?: unknown;
  sortOrder?: unknown;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export class Tag<Color = string | null> {
  declare id: string;
  declare spaceId: string;
  declare name: string;
  declare color: Color | string;
  declare groupId: string | null;
  declare code: string | null;
  declare isSystem: boolean;
  declare sortOrder: number;
  declare createdAt: string | null;
  declare updatedAt: string | null;

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
  }: TagConstructorInput<Color>) {
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
