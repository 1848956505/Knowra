import { mapKnowledgeItem, toDate } from './mappers.js';
import { withRepositoryErrors } from './repository-utils.js';

export function createPostgresKnowledgeItemRepository({ db }) {
  if (!db?.knowledgeItem) throw new TypeError('PostgreSQL KnowledgeItem repository requires db.knowledgeItem');
  function toData(item) {
    return {
      id: item.id,
      title: item.title,
      canonicalStatement: item.canonicalStatement,
      userExplanation: item.userExplanation ?? '',
      knowledgeType: item.knowledgeType ?? 'concept',
      importance: item.importance === null || item.importance === undefined ? null : Number(item.importance),
      reviewStatus: item.reviewStatus ?? 'candidate',
      sourceMode: item.sourceMode ?? 'manual',
      createdAt: toDate(item.createdAt),
      updatedAt: toDate(item.updatedAt),
      deletedAt: item.deletedAt ? toDate(item.deletedAt) : null
    };
  }
  return {
    async create(item) {
      return withRepositoryErrors(() => db.knowledgeItem.create({
        data: toData(item)
      }).then(mapKnowledgeItem));
    },
    async save(item) {
      const data = toData(item);
      return withRepositoryErrors(() => db.knowledgeItem.upsert({
        where: { id: data.id },
        create: data,
        update: (() => {
          const { id: _ignoredId, createdAt: _ignoredCreatedAt, ...updateData } = data;
          return updateData;
        })()
      }).then(mapKnowledgeItem));
    },
    async findById(id) {
      return withRepositoryErrors(() => db.knowledgeItem.findUnique({ where: { id } }).then(mapKnowledgeItem));
    },
    list({ reviewStatus, includeArchived = false, includeDeleted = false } = {}) {
      const where = {
        ...(includeDeleted ? {} : { deletedAt: null })
      };
      if (reviewStatus) {
        where.reviewStatus = reviewStatus;
      } else if (!includeArchived) {
        where.reviewStatus = { not: 'archived' };
      }
      return withRepositoryErrors(() => db.knowledgeItem.findMany({
        where,
        orderBy: { updatedAt: 'desc' }
      }).then((rows) => rows.map(mapKnowledgeItem)));
    },
    supportsAsync: true
  };
}
