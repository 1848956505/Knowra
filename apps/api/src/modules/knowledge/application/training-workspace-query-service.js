import {
  toExamProfileWorkspaceDto,
  toQuestionWorkspaceDto
} from './workspace-query-dto.js';
import {
  countBy,
  matchesText,
  paginateWorkspaceItems,
  parseWorkspaceQuery
} from './workspace-query-utils.js';

export function createTrainingWorkspaceQuery({ snapshotReader } = {}) {
  if (!snapshotReader?.load) throw new TypeError('Training workspace snapshot reader is required');

  return {
    listQuestions,
    listExamProfiles,
    getTrainingOverview
  };

  async function listQuestions(input = {}) {
    const query = parseWorkspaceQuery(input);
    const snapshot = await snapshotReader.load();
    const questions = snapshot.questions
      .filter((question) => query.includeArchived || question.reviewStatus !== 'archived')
      .map((question) => buildQuestionDto(snapshot, question))
      .filter((question) => matchesQuestion(question, query));
    return paginateWorkspaceItems(questions, query);
  }

  async function listExamProfiles(input = {}) {
    const query = parseWorkspaceQuery(input);
    const snapshot = await snapshotReader.load();
    const objectiveById = new Map(snapshot.objectives.map((objective) => [objective.id, objective]));
    const profiles = snapshot.profiles
      .filter((profile) => query.includeArchived || !profile.archivedAt)
      .map((profile) => toExamProfileWorkspaceDto(profile, {
        focuses: (snapshot.indexes.focusByProfile.get(profile.id) ?? [])
          .filter((focus) => query.includeArchived || focus.reviewStatus !== 'archived'),
        objectiveById
      }))
      .filter((profile) => matchesText([profile.name, profile.description, ...profile.scope], query.query));
    return paginateWorkspaceItems(profiles, query);
  }

  async function getTrainingOverview() {
    const snapshot = await snapshotReader.load();
    const questions = snapshot.questions
      .filter((question) => question.reviewStatus !== 'archived')
      .map((question) => buildQuestionDto(snapshot, question));
    const profiles = snapshot.profiles.filter((profile) => !profile.archivedAt);
    return {
      generatedAt: new Date().toISOString(),
      questions: {
        total: questions.length,
        byReviewStatus: countBy(questions, (question) => question.reviewStatus),
        byQuestionType: countBy(questions, (question) => question.questionType),
        byDifficulty: countBy(questions, (question) => question.difficulty ?? 'unset')
      },
      review: {
        pendingValidation: questions.filter((question) => ['draft', 'validating'].includes(question.reviewStatus)).length,
        pendingConfirmation: questions.filter((question) => question.reviewStatus === 'candidate').length,
        staleSources: questions.filter((question) => question.sourceStatus === 'stale').length,
        insufficientSources: questions.filter((question) => question.sourceStatus === 'insufficient').length
      },
      examProfiles: {
        total: profiles.length,
        updatedRecently: profiles
          .sort(compareUpdatedDesc)
          .slice(0, 5)
          .map((profile) => ({ id: profile.id, name: profile.name, updatedAt: profile.updatedAt }))
      },
      recentQuestions: questions
        .sort(compareUpdatedDesc)
        .slice(0, 5)
        .map((question) => ({
          id: question.id,
          stem: question.stem,
          questionType: question.questionType,
          reviewStatus: question.reviewStatus,
          sourceStatus: question.sourceStatus,
          updatedAt: question.updatedAt
        }))
    };
  }
}

function buildQuestionDto(snapshot, question) {
  const objectiveById = new Map(snapshot.objectives.map((objective) => [objective.id, objective]));
  const itemById = new Map(snapshot.knowledgeItems.map((item) => [item.id, item]));
  const links = (snapshot.indexes.linksByQuestion.get(question.id) ?? []).map((link) => {
    const objective = objectiveById.get(link.learningObjectiveId);
    const item = objective ? itemById.get(objective.knowledgeItemId) : null;
    return {
      ...link,
      objective: objective?.objective ?? '',
      actionVerb: objective?.actionVerb ?? '',
      cognitiveLevel: objective?.cognitiveLevel ?? '',
      reviewStatus: objective?.reviewStatus ?? null,
      knowledgeItemId: item?.id ?? objective?.knowledgeItemId ?? null,
      knowledgeItemTitle: item?.title ?? ''
    };
  });
  const sources = snapshot.indexes.sourcesByQuestion.get(question.id) ?? [];
  return toQuestionWorkspaceDto(question, {
    objectives: links,
    sources,
    sourceLabels: buildSourceLabels(snapshot)
  });
}

function matchesQuestion(question, query) {
  if (query.questionType && question.questionType !== query.questionType) return false;
  if (query.reviewStatus && question.reviewStatus !== query.reviewStatus) return false;
  if (query.difficulty && question.difficulty !== query.difficulty) return false;
  if (query.learningObjectiveId && !question.learningObjectiveIds.includes(query.learningObjectiveId)) return false;
  if (query.evidenceStatus && question.sourceStatus !== query.evidenceStatus) return false;
  return matchesText([
    question.stem,
    question.explanation,
    question.primaryObjective?.objective,
    ...question.sources.map((source) => source.quoteText)
  ], query.query);
}

function buildSourceLabels(snapshot) {
  const labels = new Map();
  snapshot.knowledgeItems.forEach((item) => labels.set(`knowledgeItem:${item.id}`, item.title));
  snapshot.objectives.forEach((objective) => labels.set(`learningObjective:${objective.id}`, objective.objective));
  snapshot.noteVersions.forEach((version) => labels.set(
    `noteVersion:${version.id}`,
    snapshot.indexes.noteById.get(version.noteId)?.title ?? '笔记版本'
  ));
  snapshot.evidence.forEach((evidence) => labels.set(
    `knowledgeEvidence:${evidence.id}`,
    evidence.quoteText || '知识证据'
  ));
  return labels;
}

function compareUpdatedDesc(left, right) {
  return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
    || String(left.id).localeCompare(String(right.id));
}
