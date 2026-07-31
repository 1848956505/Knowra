import { toKnowledgeItemWorkspaceDto, toLearningObjectiveWorkspaceDto } from './workspace-query-dto.js';
import {
  countBy,
  matchesText,
  paginateWorkspaceItems,
  parseWorkspaceQuery
} from './workspace-query-utils.js';

export function createKnowledgeWorkspaceQuery({ snapshotReader } = {}) {
  if (!snapshotReader?.load) throw new TypeError('Knowledge workspace snapshot reader is required');

  return {
    listKnowledgeItems,
    listLearningObjectives,
    getKnowledgeOverview
  };

  async function listKnowledgeItems(input = {}) {
    const query = parseWorkspaceQuery(input);
    const snapshot = await snapshotReader.load();
    const items = snapshot.knowledgeItems
      .filter((item) => !item.deletedAt)
      .filter((item) => query.includeArchived || item.reviewStatus !== 'archived')
      .map((item) => buildKnowledgeItemDto(snapshot, item))
      .filter((item) => matchesKnowledgeItem(item, query));
    return paginateWorkspaceItems(items, query);
  }

  async function listLearningObjectives(input = {}) {
    const query = parseWorkspaceQuery(input);
    const snapshot = await snapshotReader.load();
    const itemById = new Map(snapshot.knowledgeItems.map((item) => [item.id, buildKnowledgeItemDto(snapshot, item)]));
    const objectives = snapshot.objectives
      .filter((objective) => query.includeArchived || objective.reviewStatus !== 'archived')
      .map((objective) => toLearningObjectiveWorkspaceDto(objective, {
        knowledgeItem: itemById.get(objective.knowledgeItemId) ?? null,
        questions: activeQuestions(snapshot.indexes.questionsByObjective.get(objective.id) ?? [], query.includeArchived)
      }))
      .filter((objective) => matchesObjective(objective, query));
    return paginateWorkspaceItems(objectives, query);
  }

  async function getKnowledgeOverview() {
    const snapshot = await snapshotReader.load();
    const items = snapshot.knowledgeItems.filter((item) => !item.deletedAt);
    const itemDtos = items.map((item) => buildKnowledgeItemDto(snapshot, item));
    const objectives = snapshot.objectives.filter((objective) => objective.reviewStatus !== 'archived');
    return {
      generatedAt: new Date().toISOString(),
      knowledgeItems: {
        total: itemDtos.length,
        byReviewStatus: countBy(itemDtos, (item) => item.reviewStatus),
        byKnowledgeType: countBy(itemDtos, (item) => item.knowledgeType)
      },
      evidence: {
        byStatus: countBy(snapshot.evidence, (record) => record.status),
        byHealth: countBy(itemDtos, (item) => item.evidenceStatus)
      },
      learningObjectives: {
        total: objectives.length,
        byReviewStatus: countBy(objectives, (objective) => objective.reviewStatus),
        withoutConfirmedObjective: itemDtos.filter((item) => item.confirmedObjectiveCount === 0).length
      },
      coverage: {
        itemsWithoutConfirmedObjective: itemDtos.filter((item) => item.confirmedObjectiveCount === 0).length,
        itemsWithoutQuestions: itemDtos.filter((item) => item.questionCount === 0).length
      },
      recentItems: itemDtos
        .sort(compareUpdatedDesc)
        .slice(0, 5)
        .map((item) => ({
          id: item.id,
          title: item.title,
          reviewStatus: item.reviewStatus,
          evidenceStatus: item.evidenceStatus,
          updatedAt: item.updatedAt
        }))
    };
  }
}

function buildKnowledgeItemDto(snapshot, item) {
  const evidence = snapshot.indexes.evidenceByItem.get(item.id) ?? [];
  const objectives = snapshot.indexes.objectivesByItem.get(item.id) ?? [];
  const questions = questionsForItem(snapshot, item.id, true);
  return toKnowledgeItemWorkspaceDto(item, {
    evidence,
    objectives: objectives.filter((objective) => objective.reviewStatus !== 'archived'),
    questions,
    noteById: snapshot.indexes.noteById
  });
}

function questionsForItem(snapshot, knowledgeItemId, includeArchived) {
  const objectiveIds = (snapshot.indexes.objectivesByItem.get(knowledgeItemId) ?? [])
    .filter((objective) => includeArchived || objective.reviewStatus !== 'archived')
    .map((objective) => objective.id);
  const questions = new Map();
  objectiveIds.forEach((objectiveId) => {
    for (const question of snapshot.indexes.questionsByObjective.get(objectiveId) ?? []) {
      if (includeArchived || question.reviewStatus !== 'archived') questions.set(question.id, question);
    }
  });
  return [...questions.values()];
}

function matchesKnowledgeItem(item, query) {
  if (query.reviewStatus && item.reviewStatus !== query.reviewStatus) return false;
  if (query.knowledgeType && item.knowledgeType !== query.knowledgeType) return false;
  if (query.evidenceStatus && item.evidenceStatus !== query.evidenceStatus) return false;
  if (query.missingObjectives && item.confirmedObjectiveCount > 0) return false;
  if (query.missingQuestions && item.questionCount > 0) return false;
  return matchesText([item.title, item.canonicalStatement, item.userExplanation], query.query);
}

function matchesObjective(objective, query) {
  if (query.reviewStatus && objective.reviewStatus !== query.reviewStatus) return false;
  if (query.actionVerb && objective.actionVerb !== query.actionVerb) return false;
  if (query.cognitiveLevel && objective.cognitiveLevel !== query.cognitiveLevel) return false;
  if (query.knowledgeItemId && objective.knowledgeItemId !== query.knowledgeItemId) return false;
  if (query.hasQuestions !== null && (objective.questionCount > 0) !== query.hasQuestions) return false;
  return matchesText([
    objective.objective,
    objective.knowledgeItem?.title,
    objective.knowledgeItem?.canonicalStatement
  ], query.query);
}

function activeQuestions(questions, includeArchived) {
  return questions.filter((question) => includeArchived || question.reviewStatus !== 'archived');
}

function compareUpdatedDesc(left, right) {
  return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
    || String(left.id).localeCompare(String(right.id));
}
