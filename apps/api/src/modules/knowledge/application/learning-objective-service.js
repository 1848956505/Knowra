import { LearningObjective } from '../domain/learning-objective.js';
import { buildCreateLearningObjectiveDto, buildUpdateLearningObjectiveDto } from './dto/learning-objective.dto.js';
import { assertLearningObjectiveConfirmable } from './formal-asset-validation.js';
import { conflictError, notFoundError, validationError } from './knowledge-errors.js';

const now = () => new Date().toISOString();

export function createLearningObjectiveService({
  repository,
  knowledgeItemRepository,
  onObjectiveInvalidated = null,
  runTransaction = (operation) => operation()
} = {}) {
  if (!repository || !knowledgeItemRepository) throw new TypeError('LearningObjective repositories are required');

  function requireObjective(id, { includeArchived = false } = {}) {
    const objective = repository.findById(id);
    if (!objective || (!includeArchived && objective.reviewStatus === 'archived')) {
      throw notFoundError('LEARNING_OBJECTIVE_NOT_FOUND', 'LearningObjective not found');
    }
    return objective;
  }

  function requireKnowledgeItem(id, { confirmed = false } = {}) {
    const item = knowledgeItemRepository.findById(id);
    if (!item || item.deletedAt || item.reviewStatus === 'archived') {
      throw notFoundError('KNOWLEDGE_ITEM_NOT_FOUND', 'KnowledgeItem not found');
    }
    if (confirmed && item.reviewStatus !== 'confirmed') {
      throw validationError('KNOWLEDGE_ITEM_NOT_CONFIRMED', 'LearningObjective confirmation requires a confirmed KnowledgeItem');
    }
    return item;
  }

  function assertConfirmable(objective) {
    const item = knowledgeItemRepository.findById(objective.knowledgeItemId);
    return assertLearningObjectiveConfirmable(objective, item);
  }

  function assertObjectiveIdAvailable(id) {
    if (repository.findById(id)) {
      throw conflictError(
        'LEARNING_OBJECTIVE_ID_CONFLICT',
        'A LearningObjective with the same id already exists'
      );
    }
  }

  function saveNew(objective) {
    return repository.create?.(objective) ?? repository.save(objective);
  }

  function notifyIfInvalidated(previous, next) {
    if (
      previous?.reviewStatus === 'confirmed'
      && next?.reviewStatus !== 'confirmed'
    ) {
      onObjectiveInvalidated?.(next.id);
    }
  }

  function createCandidate(input = {}) {
    const dto = buildCreateLearningObjectiveDto(input);
    requireKnowledgeItem(dto.knowledgeItemId);
    assertObjectiveIdAvailable(dto.id);
    return runTransaction(() => saveNew(new LearningObjective({ ...dto, id: dto.id })));
  }

  function updateObjective(id, input = {}) {
    const current = requireObjective(id);
    const dto = buildUpdateLearningObjectiveDto(input);
    const changed = Object.keys(dto).some((field) => dto[field] !== current[field]);
    return runTransaction(() => {
      const next = repository.save(new LearningObjective({
        ...current,
        ...dto,
        reviewStatus: current.reviewStatus === 'confirmed' && changed ? 'candidate' : current.reviewStatus,
        updatedAt: now()
      }));
      notifyIfInvalidated(current, next);
      return next;
    });
  }

  return {
    createCandidate,
    getObjective: (id) => requireObjective(id, { includeArchived: true }),
    listObjectives(options = {}) {
      return repository.list(options);
    },
    updateObjective,
    confirmObjective(id) {
      const current = requireObjective(id);
      assertConfirmable(current);
      return repository.save(new LearningObjective({ ...current, reviewStatus: 'confirmed', reviewNote: null, updatedAt: now() }));
    },
    requestRevision(id, reviewNote = null) {
      const current = requireObjective(id);
      return runTransaction(() => {
        const next = repository.save(new LearningObjective({
          ...current,
          reviewStatus: 'candidate',
          reviewNote: reviewNote?.trim?.() || current.reviewNote || null,
          updatedAt: now()
        }));
        notifyIfInvalidated(current, next);
        return next;
      });
    },
    archive(id) {
      const current = requireObjective(id);
      return runTransaction(() => {
        const next = repository.save(new LearningObjective({ ...current, reviewStatus: 'archived', updatedAt: now() }));
        notifyIfInvalidated(current, next);
        return next;
      });
    },
    restore(id) {
      const current = requireObjective(id, { includeArchived: true });
      if (current.reviewStatus !== 'archived') return current;
      return repository.save(new LearningObjective({ ...current, reviewStatus: 'candidate', updatedAt: now() }));
    },
    invalidateByKnowledgeItemId(knowledgeItemId) {
      return runTransaction(() => {
        const changed = [];
        for (const current of repository.list({
          knowledgeItemId,
          includeArchived: true
        })) {
          if (current.reviewStatus !== 'confirmed') continue;
          const next = repository.save(new LearningObjective({
            ...current,
            reviewStatus: 'candidate',
            reviewNote: current.reviewNote || 'Parent KnowledgeItem requires review',
            updatedAt: now()
          }));
          changed.push(next);
          notifyIfInvalidated(current, next);
        }
        return changed;
      });
    },
    assertConfirmable
  };
}
