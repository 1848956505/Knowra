import type { Tag } from '../domain/tag.ts';

/** 本地数据只保证标识、归属和名称；历史记录不要求补齐模型字段。 */
export type TagRecord = Pick<Tag, 'id' | 'spaceId' | 'name'> & Partial<Omit<Tag, 'id' | 'spaceId' | 'name'>>;

export interface TagListOptions {
  spaceId?: string | null;
}

/** 同步本地仓库；返回原记录引用，不负责异步持久化或回滚。 */
export interface TagRepository {
  save(record: TagRecord): TagRecord;
  findById(id: string | null | undefined): TagRecord | null;
  delete(id: string | null | undefined): TagRecord | null;
  list(options?: TagListOptions): TagRecord[];
}

export interface TagRepositoryOptions {
  /** 保留调用方数组引用；省略或 null 时使用新数组。 */
  records?: TagRecord[] | null;
  /** 同步变更钩子；每次读取当前回调，抛错不在本仓库内回滚。 */
  onChange?: ((records: TagRecord[]) => void) | null;
}

export function createInMemoryTagRepository(options: TagRepositoryOptions = {}): TagRepository {
  const tags = options.records ?? [];

  function persist() {
    options.onChange?.(tags);
  }

  return {
    save(tag) {
      const existingIndex = tags.findIndex(item => item.id === tag.id);

      if (existingIndex === -1) {
        tags.push(tag);
        persist();
        return tag;
      }

      tags[existingIndex] = tag;
      persist();
      return tag;
    },
    findById(tagId) {
      return tags.find(tag => tag.id === tagId) ?? null;
    },
    delete(tagId) {
      const existingIndex = tags.findIndex(tag => tag.id === tagId);

      if (existingIndex === -1) {
        return null;
      }

      const [deletedTag] = tags.splice(existingIndex, 1);
      options.onChange?.(tags);
      return deletedTag;
    },
    list(options = {}) {
      return tags
        .filter(tag => (options.spaceId ? tag.spaceId === options.spaceId : true))
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));
    }
  };
}
