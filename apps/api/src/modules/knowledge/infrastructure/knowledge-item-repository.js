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
    save(item) {
      const index = records.findIndex((record) => record.id === item.id);
      if (index < 0) records.push(item);
      else records[index] = item;
      persist();
      return item;
    },
    findById(id) {
      return records.find((item) => item.id === id) ?? null;
    },
    list({ reviewStatus, includeArchived = false, includeDeleted = false } = {}) {
      return records
        .filter((item) => reviewStatus ? item.reviewStatus === reviewStatus : true)
        .filter((item) => includeArchived || item.reviewStatus !== 'archived')
        .filter((item) => includeDeleted || !item.deletedAt)
        .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
    }
  };
}
