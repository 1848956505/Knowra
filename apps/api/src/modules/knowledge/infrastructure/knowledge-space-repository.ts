import type { KnowledgeSpace } from '../domain/knowledge-space.ts';

/** 本地数据只保证标识、归属和名称；历史记录不要求补齐模型字段。 */
export type KnowledgeSpaceRecord = Pick<KnowledgeSpace, 'id' | 'userId' | 'name'> &
  Partial<Omit<KnowledgeSpace, 'id' | 'userId' | 'name'>>;

export interface KnowledgeSpaceListOptions {
  userId?: string | null;
}

/** 同步本地仓库；返回原记录引用，不负责异步持久化或回滚。 */
export interface KnowledgeSpaceRepository {
  save(record: KnowledgeSpaceRecord): KnowledgeSpaceRecord;
  findById(id: string | null | undefined): KnowledgeSpaceRecord | null;
  delete(id: string | null | undefined): KnowledgeSpaceRecord | null;
  list(options?: KnowledgeSpaceListOptions): KnowledgeSpaceRecord[];
}

export interface KnowledgeSpaceRepositoryOptions {
  /** 保留调用方数组引用；省略或 null 时使用新数组。 */
  records?: KnowledgeSpaceRecord[] | null;
  /** 同步变更钩子；每次读取当前回调，抛错不在本仓库内回滚。 */
  onChange?: ((records: KnowledgeSpaceRecord[]) => void) | null;
}

export function createInMemoryKnowledgeSpaceRepository(
  options: KnowledgeSpaceRepositoryOptions = {}
): KnowledgeSpaceRepository {
  const spaces = options.records ?? [];

  function persist() {
    options.onChange?.(spaces);
  }

  return {
    save(space) {
      const existingIndex = spaces.findIndex(item => item.id === space.id);

      if (existingIndex === -1) {
        spaces.push(space);
        persist();
        return space;
      }

      spaces[existingIndex] = space;
      persist();
      return space;
    },
    findById(spaceId) {
      return spaces.find(space => space.id === spaceId) ?? null;
    },
    delete(spaceId) {
      const index = spaces.findIndex(space => space.id === spaceId);
      if (index < 0) return null;
      const [removed] = spaces.splice(index, 1);
      persist();
      return removed;
    },
    list(options = {}) {
      return spaces.filter(space => (options.userId ? space.userId === options.userId : true));
    }
  };
}
