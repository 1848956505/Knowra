import { mapExamFocus, toDate } from './mappers.js';
import { withRepositoryErrors } from './repository-utils.js';

export function createPostgresExamFocusRepository({ db }) {
  if (!db?.examFocus) throw new TypeError('PostgreSQL ExamFocus repository requires db.examFocus');
  function toData(focus) {
    return {
      id: focus.id,
      examProfileId: focus.examProfileId,
      learningObjectiveId: focus.learningObjectiveId,
      description: focus.description ?? '',
      priority: focus.priority,
      difficultyHint: focus.difficultyHint ?? null,
      questionTypeSuggestions: focus.questionTypeSuggestions ?? [],
      sourceType: focus.sourceType ?? 'manual',
      reviewStatus: focus.reviewStatus ?? 'candidate',
      createdAt: toDate(focus.createdAt),
      updatedAt: toDate(focus.updatedAt)
    };
  }
  function whereFor({ examProfileId, learningObjectiveId, reviewStatus, includeArchived = false } = {}) {
    const where = {
      ...(examProfileId ? { examProfileId } : {}),
      ...(learningObjectiveId ? { learningObjectiveId } : {})
    };
    if (reviewStatus) where.reviewStatus = reviewStatus;
    else if (!includeArchived) where.reviewStatus = { not: 'archived' };
    return where;
  }
  return {
    async create(focus) {
      return withRepositoryErrors(() => db.examFocus.create({
        data: toData(focus)
      }).then(mapExamFocus));
    },
    async save(focus) {
      const data = toData(focus);
      return withRepositoryErrors(() => db.examFocus.upsert({ where: { id: data.id }, create: data, update: (() => { const { id: _id, createdAt: _createdAt, ...rest } = data; return rest; })() }).then(mapExamFocus));
    },
    async findById(id) { return withRepositoryErrors(() => db.examFocus.findUnique({ where: { id } }).then(mapExamFocus)); },
    async findByProfileAndObjective(examProfileId, learningObjectiveId) {
      return withRepositoryErrors(() => db.examFocus.findUnique({ where: { examProfileId_learningObjectiveId: { examProfileId, learningObjectiveId } } }).then(mapExamFocus));
    },
    list(options = {}) { return withRepositoryErrors(() => db.examFocus.findMany({ where: whereFor(options), orderBy: [{ priority: 'asc' }, { updatedAt: 'desc' }] }).then((rows) => rows.map(mapExamFocus))); },
    supportsAsync: true
  };
}
