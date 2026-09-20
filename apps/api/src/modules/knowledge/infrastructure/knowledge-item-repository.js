import { createAppError } from '../../../errors/app-error.js';

export function createInMemoryKnowledgeItemRepository(options = {}) {
  const records = options.records ?? [];
  const persist = () => options.onChange?.(records);
  return {
    create(item) {
      if (records.some((record) => record.id === item.id)) {
        throw createAppError(
          'KNOWLEDGE_ITEM_ID_CONFLICT',
          'A KnowledgeItem with the same id already exists',
          409
        );
      }
      records.push(item);
      persist();
      return item;
    },
    save(item, { expectedUpdatedAt } = {}) {
      const index = records.findIndex((record) => record.id === item.id);
      if (expectedUpdatedAt && (index < 0 || records[index].updatedAt !== expectedUpdatedAt)) {
        throw createAppError('KNOWLEDGE_ITEM_UPDATE_CONFLICT', '知识已被其他操作修改，请重新加载并核对。', 409);
      }
      if (index < 0) records.push(item);
      else records[index] = item;
      persist();
      return item;
    },
    findById(id) {
      return records.find((item) => item.id === id) ?? null;
    },
    list({ reviewStatus, query = '', includeArchived = false, includeDeleted = false } = {}) {
      const search = String(query).trim().toLocaleLowerCase();
      const showArchived = includeArchived === true || includeArchived === 'true';
      const showDeleted = includeDeleted === true || includeDeleted === 'true';
      return records
        .filter((item) => reviewStatus ? item.reviewStatus === reviewStatus : true)
        .filter((item) => reviewStatus === 'archived' || showArchived || item.reviewStatus !== 'archived')
        .filter((item) => showDeleted || !item.deletedAt)
        .filter((item) => !search || [item.title, item.canonicalStatement, item.userExplanation].some((value) => String(value).toLocaleLowerCase().includes(search)))
        .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
    }
  };
}
