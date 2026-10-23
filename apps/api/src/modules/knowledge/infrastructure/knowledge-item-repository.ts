import { createAppError } from '../../../errors/app-error.js';

import type { KnowledgeItem } from '../domain/knowledge-item.ts';

/** 本地历史记录只保证标识；其余字段不假定已经过领域构造器规范化。 */
export interface KnowledgeItemRecord {
  id: string;
  title?: string;
  canonicalStatement?: string;
  reviewStatus?: KnowledgeItem['reviewStatus'] | null;
  sourceMode?: KnowledgeItem['sourceMode'] | null;
  userExplanation?: unknown;
  knowledgeType?: unknown;
  importance?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  deletedAt?: unknown;
}

export interface KnowledgeItemSaveOptions {
  expectedUpdatedAt?: string | null;
}

export interface KnowledgeItemListOptions {
  reviewStatus?: KnowledgeItem['reviewStatus'] | '' | null;
  query?: unknown;
  includeArchived?: boolean | string | null;
  includeDeleted?: boolean | string | null;
}

/** 同步本地仓库；返回原记录引用，不负责异步持久化或回滚。 */
export interface KnowledgeItemRepository {
  create(item: KnowledgeItemRecord): KnowledgeItemRecord;
  save(item: KnowledgeItemRecord, options?: KnowledgeItemSaveOptions): KnowledgeItemRecord;
  findById(id: string | null | undefined): KnowledgeItemRecord | null;
  delete(id: string | null | undefined): KnowledgeItemRecord | null;
  list(options?: KnowledgeItemListOptions): KnowledgeItemRecord[];
}

export interface KnowledgeItemRepositoryOptions {
  /** 保留调用方数组引用；省略或 null 时使用新数组。 */
  records?: KnowledgeItemRecord[] | null;
  /** 同步变更钩子；每次读取当前回调，抛错不在本仓库内回滚。 */
  onChange?: ((records: KnowledgeItemRecord[]) => void) | null;
}

// 原生 Date 单参数构造器接受任意 JavaScript 值且可能抛错；这里只补齐其重载边界。
type NativeDateConstructor = new (value: unknown) => Date;

export function createInMemoryKnowledgeItemRepository(
  options: KnowledgeItemRepositoryOptions = {}
): KnowledgeItemRepository {
  const records = options.records ?? [];
  const persist = () => options.onChange?.(records);
  return {
    create(item) {
      if (records.some(record => record.id === item.id)) {
        throw createAppError('KNOWLEDGE_ITEM_ID_CONFLICT', 'A KnowledgeItem with the same id already exists', 409);
      }
      records.push(item);
      persist();
      return item;
    },
    save(item, { expectedUpdatedAt } = {}) {
      const index = records.findIndex(record => record.id === item.id);
      if (expectedUpdatedAt && (index < 0 || records[index].updatedAt !== expectedUpdatedAt)) {
        throw createAppError('KNOWLEDGE_ITEM_UPDATE_CONFLICT', '知识已被其他操作修改，请重新加载并核对。', 409);
      }
      if (index < 0) records.push(item);
      else records[index] = item;
      persist();
      return item;
    },
    findById(id) {
      return records.find(item => item.id === id) ?? null;
    },
    delete(id) {
      const index = records.findIndex(item => item.id === id);
      if (index < 0) return null;
      const [deleted] = records.splice(index, 1);
      persist();
      return deleted;
    },
    list({ reviewStatus, query = '', includeArchived = false, includeDeleted = false } = {}) {
      const search = String(query).trim().toLocaleLowerCase();
      const showArchived = includeArchived === true || includeArchived === 'true';
      const showDeleted = includeDeleted === true || includeDeleted === 'true';
      return records
        .filter(item => (reviewStatus ? item.reviewStatus === reviewStatus : true))
        .filter(item => reviewStatus === 'archived' || showArchived || item.reviewStatus !== 'archived')
        .filter(item => showDeleted || !item.deletedAt)
        .filter(
          item =>
            !search ||
            [item.title, item.canonicalStatement, item.userExplanation].some(value =>
              String(value).toLocaleLowerCase().includes(search)
            )
        )
        .sort(
          (left, right) =>
            new (Date as NativeDateConstructor)(right.updatedAt).getTime() -
            new (Date as NativeDateConstructor)(left.updatedAt).getTime()
        );
    }
  };
}
