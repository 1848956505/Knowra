import { createAppError } from '../../../errors/app-error.js';

function createCollectionRepository({ records = [], onChange = null, sort = null, filter = () => true } = {}) {
  const persist = () => onChange?.(records);
  return {
    create(record) {
      if (records.some((item) => item.id === record.id)) {
        throw createAppError(
          'ASSESSMENT_ASSET_ID_CONFLICT',
          'An assessment asset with the same id already exists',
          409
        );
      }
      records.push(record);
      persist();
      return record;
    },
    save(record) {
      const index = records.findIndex((item) => item.id === record.id);
      if (index < 0) records.push(record);
      else records[index] = record;
      persist();
      return record;
    },
    findById(id) {
      return records.find((item) => item.id === id) ?? null;
    },
    list(options = {}) {
      const result = records.filter((item) => filter(item, options));
      const ordered = sort ? result.sort(sort) : result;
      const limit = Number(options.limit);
      return Number.isInteger(limit) && limit > 0 ? ordered.slice(0, limit) : ordered;
    },
    deleteByQuestionId(questionId) {
      const removed = records.filter((item) => item.questionId === questionId);
      if (!removed.length) return [];
      for (const item of removed) records.splice(records.indexOf(item), 1);
      persist();
      return removed;
    }
  };
}

const newestFirst = (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();

export function createInMemoryLearningObjectiveRepository(options = {}) {
  return createCollectionRepository({
    records: options.records,
    onChange: options.onChange,
    sort: (left, right) => left.order - right.order || newestFirst(left, right),
    filter: (item, query) => (
      (!query.knowledgeItemId || item.knowledgeItemId === query.knowledgeItemId)
      && (!query.reviewStatus || item.reviewStatus === query.reviewStatus)
      && (query.includeArchived || item.reviewStatus !== 'archived')
    )
  });
}

export function createInMemoryExamProfileRepository(options = {}) {
  return createCollectionRepository({
    records: options.records,
    onChange: options.onChange,
    sort: newestFirst,
    filter: (item, query) => query.includeArchived || !item.archivedAt
  });
}

export function createInMemoryExamFocusRepository(options = {}) {
  const records = options.records ?? [];
  const repository = createCollectionRepository({
    records,
    onChange: options.onChange,
    sort: (left, right) => left.priority - right.priority || newestFirst(left, right),
    filter: (item, query) => (
      (!query.examProfileId || item.examProfileId === query.examProfileId)
      && (!query.learningObjectiveId || item.learningObjectiveId === query.learningObjectiveId)
      && (!query.reviewStatus || item.reviewStatus === query.reviewStatus)
      && (query.includeArchived || item.reviewStatus !== 'archived')
    )
  });
  return {
    ...repository,
    findByProfileAndObjective(examProfileId, learningObjectiveId) {
      return records.find((item) => item.examProfileId === examProfileId && item.learningObjectiveId === learningObjectiveId) ?? null;
    }
  };
}

export function createInMemoryQuestionRepository(options = {}) {
  return createCollectionRepository({
    records: options.records,
    onChange: options.onChange,
    sort: newestFirst,
    filter: (item, query) => (
      (!query.reviewStatus || item.reviewStatus === query.reviewStatus)
      && (query.includeArchived || item.reviewStatus !== 'archived')
    )
  });
}

export function createInMemoryQuestionObjectiveRepository(options = {}) {
  const records = options.records ?? [];
  const repository = createCollectionRepository({ records, onChange: options.onChange });
  return {
    ...repository,
    listByQuestionIds(questionIds = []) {
      const wanted = new Set(questionIds);
      return records.filter((item) => wanted.has(item.questionId));
    },
    listByObjectiveId(learningObjectiveId) {
      return records.filter((item) => item.learningObjectiveId === learningObjectiveId);
    },
    replaceForQuestion(questionId, objectiveIds = []) {
      const removed = records.filter((item) => item.questionId === questionId);
      for (const item of removed) records.splice(records.indexOf(item), 1);
      const next = [...new Set(objectiveIds)].map((learningObjectiveId, index) => ({
        id: `question-objective-${questionId}-${learningObjectiveId}`,
        questionId,
        learningObjectiveId,
        isPrimary: index === 0,
        order: index,
        createdAt: new Date().toISOString()
      }));
      records.push(...next);
      options.onChange?.(records);
      return next;
    }
  };
}

export function createInMemoryQuestionSourceRepository(options = {}) {
  const records = options.records ?? [];
  const repository = createCollectionRepository({ records, onChange: options.onChange, sort: (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime() });
  return {
    ...repository,
    listByQuestionIds(questionIds = []) {
      const wanted = new Set(questionIds);
      return records.filter((item) => wanted.has(item.questionId));
    },
    list({ questionId } = {}) {
      return records
        .filter((item) => !questionId || item.questionId === questionId)
        .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
    },
    replaceForQuestion(questionId, sources = []) {
      const removed = records.filter((item) => item.questionId === questionId);
      for (const item of removed) records.splice(records.indexOf(item), 1);
      records.push(...sources);
      options.onChange?.(records);
      return sources;
    },
    markBySourceId(sourceType, sourceId, status = 'stale') {
      return this.markBySourceIds(sourceType, [sourceId], status);
    },
    markBySourceIds(sourceType, sourceIds = [], status = 'stale') {
      const wanted = new Set(sourceIds.filter(Boolean));
      const changed = [];
      for (const item of records) {
        if (item.sourceType !== sourceType || !wanted.has(item.sourceId) || item.status === status) continue;
        item.status = status;
        item.updatedAt = new Date().toISOString();
        changed.push(item);
      }
      if (changed.length) options.onChange?.(records);
      return changed;
    }
  };
}
