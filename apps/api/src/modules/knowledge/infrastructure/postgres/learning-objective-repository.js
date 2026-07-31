import { mapLearningObjective, toDate } from './mappers.js';
import { withRepositoryErrors } from './repository-utils.js';

export function createPostgresLearningObjectiveRepository({ db }) {
  if (!db?.learningObjective) throw new TypeError('PostgreSQL LearningObjective repository requires db.learningObjective');
  function toData(objective) {
    return {
      id: objective.id,
      knowledgeItemId: objective.knowledgeItemId,
      objective: objective.objective,
      actionVerb: objective.actionVerb,
      cognitiveLevel: objective.cognitiveLevel,
      difficultyHint: objective.difficultyHint ?? null,
      reviewStatus: objective.reviewStatus,
      reviewNote: objective.reviewNote ?? null,
      order: objective.order,
      createdAt: toDate(objective.createdAt),
      updatedAt: toDate(objective.updatedAt)
    };
  }
  return {
    async create(objective) {
      return withRepositoryErrors(() => db.learningObjective.create({
        data: toData(objective)
      }).then(mapLearningObjective));
    },
    async save(objective) {
      const data = toData(objective);
      return withRepositoryErrors(() => db.learningObjective.upsert({ where: { id: data.id }, create: data, update: (() => { const { id: _id, createdAt: _createdAt, ...rest } = data; return rest; })() }).then(mapLearningObjective));
    },
    async findById(id) { return withRepositoryErrors(() => db.learningObjective.findUnique({ where: { id } }).then(mapLearningObjective)); },
    list({ knowledgeItemId, reviewStatus, includeArchived = false } = {}) {
      const where = { ...(knowledgeItemId ? { knowledgeItemId } : {}) };
      if (reviewStatus) where.reviewStatus = reviewStatus;
      else if (!includeArchived) where.reviewStatus = { not: 'archived' };
      return withRepositoryErrors(() => db.learningObjective.findMany({ where, orderBy: [{ order: 'asc' }, { updatedAt: 'desc' }] }).then((rows) => rows.map(mapLearningObjective)));
    },
    supportsAsync: true
  };
}
