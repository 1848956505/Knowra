import { LearningObjective } from '../../domain/learning-objective.js';
import { buildCreateLearningObjectiveDto, buildUpdateLearningObjectiveDto } from '../dto/learning-objective.dto.js';
import { assertLearningObjectiveConfirmable } from '../formal-asset-validation.js';
import { conflictError, notFoundError, validationError } from '../knowledge-errors.js';

const now = () => new Date().toISOString();

export function createAsyncLearningObjectiveService({
  repository,
  knowledgeItemRepository,
  onObjectiveInvalidated = null,
  runTransaction = (operation) => operation()
} = {}) {
  if (!repository || !knowledgeItemRepository) throw new TypeError('Async LearningObjective repositories are required');

  async function requireObjective(id, { includeArchived = false } = {}) {
    const objective = await repository.findById(id);
    if (!objective || (!includeArchived && objective.reviewStatus === 'archived')) throw notFoundError('LEARNING_OBJECTIVE_NOT_FOUND', 'LearningObjective not found');
    return objective;
  }

  async function requireKnowledgeItem(id, { confirmed = false } = {}) {
    const item = await knowledgeItemRepository.findById(id);
    if (!item || item.deletedAt || item.reviewStatus === 'archived') throw notFoundError('KNOWLEDGE_ITEM_NOT_FOUND', 'KnowledgeItem not found');
    if (confirmed && item.reviewStatus !== 'confirmed') throw validationError('KNOWLEDGE_ITEM_NOT_CONFIRMED', 'LearningObjective confirmation requires a confirmed KnowledgeItem');
    return item;
  }

  async function assertConfirmable(objective) {
    const item = await knowledgeItemRepository.findById(objective.knowledgeItemId);
    return assertLearningObjectiveConfirmable(objective, item);
  }

  async function assertObjectiveIdAvailable(id) {
    if (await repository.findById(id)) {
      throw conflictError(
        'LEARNING_OBJECTIVE_ID_CONFLICT',
        'A LearningObjective with the same id already exists'
      );
    }
  }

  async function saveNew(targetRepository, objective) {
    return targetRepository.create
      ? targetRepository.create(objective)
      : targetRepository.save(objective);
  }

  async function notifyIfInvalidated(previous, next) {
    if (
      previous?.reviewStatus === 'confirmed'
      && next?.reviewStatus !== 'confirmed'
    ) {
      await onObjectiveInvalidated?.(next.id);
    }
  }

  return {
    async createCandidate(input = {}) {
      const dto = buildCreateLearningObjectiveDto(input);
      await requireKnowledgeItem(dto.knowledgeItemId);
      await assertObjectiveIdAvailable(dto.id);
      return runTransaction(async ({ learningObjectiveRepository = repository } = {}) => saveNew(
        learningObjectiveRepository,
        new LearningObjective({ ...dto, id: dto.id })
      ));
    },
    getObjective: (id) => requireObjective(id, { includeArchived: true }),
    listObjectives: (options = {}) => repository.list(options),
    async updateObjective(id, input = {}) {
      const current = await requireObjective(id);
      const dto = buildUpdateLearningObjectiveDto(input);
      const changed = Object.keys(dto).some((field) => dto[field] !== current[field]);
      const next = await repository.save(new LearningObjective({ ...current, ...dto, reviewStatus: current.reviewStatus === 'confirmed' && changed ? 'candidate' : current.reviewStatus, updatedAt: now() }));
      await notifyIfInvalidated(current, next);
      return next;
    },
    async confirmObjective(id) {
      const current = await requireObjective(id);
      await assertConfirmable(current);
      return repository.save(new LearningObjective({ ...current, reviewStatus: 'confirmed', reviewNote: null, updatedAt: now() }));
    },
    async requestRevision(id, reviewNote = null) {
      const current = await requireObjective(id);
      const next = await repository.save(new LearningObjective({ ...current, reviewStatus: 'candidate', reviewNote: reviewNote?.trim?.() || current.reviewNote || null, updatedAt: now() }));
      await notifyIfInvalidated(current, next);
      return next;
    },
    async archive(id) {
      const current = await requireObjective(id);
      const next = await repository.save(new LearningObjective({ ...current, reviewStatus: 'archived', updatedAt: now() }));
      await notifyIfInvalidated(current, next);
      return next;
    },
    async restore(id) {
      const current = await requireObjective(id, { includeArchived: true });
      if (current.reviewStatus !== 'archived') return current;
      return repository.save(new LearningObjective({ ...current, reviewStatus: 'candidate', updatedAt: now() }));
    },
    async invalidateByKnowledgeItemId(knowledgeItemId) {
      const objectives = await repository.list({
        knowledgeItemId,
        includeArchived: true
      });
      const changed = [];
      for (const current of objectives) {
        if (current.reviewStatus !== 'confirmed') continue;
        const next = await repository.save(new LearningObjective({
          ...current,
          reviewStatus: 'candidate',
          reviewNote: current.reviewNote || 'Parent KnowledgeItem requires review',
          updatedAt: now()
        }));
        changed.push(next);
        await notifyIfInvalidated(current, next);
      }
      return changed;
    },
    assertConfirmable
  };
}
