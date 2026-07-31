import { mapQuestionObjective, toDate } from './mappers.js';
import { withRepositoryErrors } from './repository-utils.js';

export function createPostgresQuestionObjectiveRepository({ db }) {
  if (!db?.questionObjective) throw new TypeError('PostgreSQL QuestionObjective repository requires db.questionObjective');
  return {
    async listByQuestionIds(questionIds = []) {
      if (!questionIds.length) return [];
      return withRepositoryErrors(() => db.questionObjective.findMany({ where: { questionId: { in: questionIds } }, orderBy: { order: 'asc' } }).then((rows) => rows.map(mapQuestionObjective)));
    },
    async listByObjectiveId(learningObjectiveId) { return withRepositoryErrors(() => db.questionObjective.findMany({ where: { learningObjectiveId }, orderBy: { order: 'asc' } }).then((rows) => rows.map(mapQuestionObjective))); },
    async replaceForQuestion(questionId, objectiveIds = []) {
      return withRepositoryErrors(async () => {
        await db.questionObjective.deleteMany({ where: { questionId } });
        if (!objectiveIds.length) return [];
        const records = [...new Set(objectiveIds)].map((learningObjectiveId, order) => ({ id: `question-objective-${questionId}-${learningObjectiveId}`, questionId, learningObjectiveId, isPrimary: order === 0, order, createdAt: new Date() }));
        await db.questionObjective.createMany({ data: records });
        return records.map(mapQuestionObjective);
      });
    },
    supportsAsync: true
  };
}
