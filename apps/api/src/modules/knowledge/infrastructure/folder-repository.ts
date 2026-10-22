import type { Folder } from '../domain/folder.ts';

/** 本地数据只保证标识、归属和名称；历史记录不要求补齐模型字段。 */
export type FolderRecord = Pick<Folder, 'id' | 'spaceId' | 'name'> & Partial<Omit<Folder, 'id' | 'spaceId' | 'name'>>;

export interface FolderListOptions {
  spaceId?: string | null;
  includeDeleted?: boolean | string;
}

/** 同步本地仓库；返回原记录引用，不负责异步持久化或回滚。 */
export interface FolderRepository {
  save(record: FolderRecord): FolderRecord;
  findById(id: string | null | undefined): FolderRecord | null;
  delete(id: string | null | undefined): FolderRecord | null;
  list(options?: FolderListOptions): FolderRecord[];
}

export interface FolderRepositoryOptions {
  /** 保留调用方数组引用；省略或 null 时使用新数组。 */
  records?: FolderRecord[] | null;
  /** 同步变更钩子；每次读取当前回调，抛错不在本仓库内回滚。 */
  onChange?: ((records: FolderRecord[]) => void) | null;
}

export function createInMemoryFolderRepository(options: FolderRepositoryOptions = {}): FolderRepository {
  const folders = options.records ?? [];

  function persist() {
    options.onChange?.(folders);
  }

  return {
    save(folder) {
      const existingIndex = folders.findIndex(item => item.id === folder.id);

      if (existingIndex === -1) {
        folders.push(folder);
        persist();
        return folder;
      }

      folders[existingIndex] = folder;
      persist();
      return folder;
    },
    findById(folderId) {
      return folders.find(folder => folder.id === folderId) ?? null;
    },
    delete(folderId) {
      const existingIndex = folders.findIndex(folder => folder.id === folderId);

      if (existingIndex === -1) {
        return null;
      }

      const [deletedFolder] = folders.splice(existingIndex, 1);
      options.onChange?.(folders);
      return deletedFolder;
    },
    list(options = {}) {
      return folders.filter(
        folder =>
          (options.spaceId ? folder.spaceId === options.spaceId : true) &&
          (options.includeDeleted === true || options.includeDeleted === 'true' || !folder.deletedAt)
      );
    }
  };
}
