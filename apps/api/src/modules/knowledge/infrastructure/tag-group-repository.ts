import type { TagGroup } from '../domain/tag-group.ts';

/** 本地数据只保证标识、归属和名称；历史记录不要求补齐模型字段。 */
export type TagGroupRecord = Pick<TagGroup, 'id' | 'spaceId' | 'name'> &
  Partial<Omit<TagGroup, 'id' | 'spaceId' | 'name'>>;

export interface TagGroupListOptions {
  spaceId?: string | null;
}

/** 同步本地仓库；返回原记录引用，不负责异步持久化或回滚。 */
export interface TagGroupRepository {
  create(group: TagGroupRecord): TagGroupRecord;
  save(record: TagGroupRecord): TagGroupRecord;
  findById(id: string | null | undefined): TagGroupRecord | null;
  delete(id: string | null | undefined): TagGroupRecord | null;
  list(options?: TagGroupListOptions): TagGroupRecord[];
}

export interface TagGroupRepositoryOptions {
  /** 保留调用方数组引用；省略或 null 时使用新数组。 */
  records?: TagGroupRecord[] | null;
  /** 同步变更钩子；每次读取当前回调，抛错不在本仓库内回滚。 */
  onChange?: ((records: TagGroupRecord[]) => void) | null;
}

export function createInMemoryTagGroupRepository(options: TagGroupRepositoryOptions = {}): TagGroupRepository {
  const groups = options.records ?? [];
  const persist = () => options.onChange?.(groups);
  return {
    create(group) {
      if (groups.some(item => item.id === group.id)) {
        const error: Error & { code?: 'TAG_GROUP_ID_CONFLICT' } = new Error('Tag group id already exists');
        error.code = 'TAG_GROUP_ID_CONFLICT';
        throw error;
      }
      groups.push(group);
      persist();
      return group;
    },
    save(group) {
      const index = groups.findIndex(item => item.id === group.id);
      if (index === -1) groups.push(group);
      else groups[index] = group;
      persist();
      return group;
    },
    findById(id) {
      return groups.find(group => group.id === id) ?? null;
    },
    delete(id) {
      const index = groups.findIndex(group => group.id === id);
      if (index === -1) return null;
      const [deleted] = groups.splice(index, 1);
      persist();
      return deleted;
    },
    list(options = {}) {
      return groups
        .filter(group => (options.spaceId ? group.spaceId === options.spaceId : true))
        .sort((a, b) => {
          const left = a.sortOrder;
          const right = b.sortOrder;
          return (
            (left === undefined ? NaN : left) - (right === undefined ? NaN : right) || a.name.localeCompare(b.name)
          );
        });
    }
  };
}
