import { summarizeEvidenceStatus, summarizeSourceStatus } from './workspace-query-utils.js';

export function toKnowledgeItemWorkspaceDto(item, {
  evidence = [],
  objectives = [],
  questions = [],
  noteById = new Map()
} = {}) {
  const evidenceStatus = summarizeEvidenceStatus(evidence);
  return {
    id: item.id,
    title: item.title,
    canonicalStatement: item.canonicalStatement,
    userExplanation: item.userExplanation,
    knowledgeType: item.knowledgeType,
    importance: item.importance,
    reviewStatus: item.reviewStatus,
    sourceMode: item.sourceMode,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    evidenceStatus,
    sourceHealth: evidenceStatus,
    evidenceCount: evidence.length,
    evidenceSummary: evidence.map((record) => toEvidenceSummary(record, noteById)),
    objectiveCount: objectives.length,
    confirmedObjectiveCount: objectives.filter((objective) => objective.reviewStatus === 'confirmed').length,
    questionCount: questions.length,
    noteIds: [...new Set(evidence.map((record) => record.noteId).filter(Boolean))]
  };
}

export function toLearningObjectiveWorkspaceDto(objective, {
  knowledgeItem = null,
  questions = []
} = {}) {
  return {
    id: objective.id,
    knowledgeItemId: objective.knowledgeItemId,
    objective: objective.objective,
    actionVerb: objective.actionVerb,
    cognitiveLevel: objective.cognitiveLevel,
    difficultyHint: objective.difficultyHint,
    reviewStatus: objective.reviewStatus,
    reviewNote: objective.reviewNote,
    order: objective.order,
    createdAt: objective.createdAt,
    updatedAt: objective.updatedAt,
    knowledgeItem: knowledgeItem ? {
      id: knowledgeItem.id,
      title: knowledgeItem.title,
      reviewStatus: knowledgeItem.reviewStatus,
      evidenceStatus: knowledgeItem.evidenceStatus
    } : null,
    questionCount: questions.length,
    questionIds: questions.map((question) => question.id)
  };
}

export function toQuestionWorkspaceDto(question, {
  objectives = [],
  sources = [],
  sourceLabels = new Map()
} = {}) {
  const sourceStatus = summarizeSourceStatus(sources);
  const primaryObjective = objectives.find((objective) => objective.isPrimary) ?? objectives[0] ?? null;
  const orderedObjectives = [...objectives].sort((left, right) => left.order - right.order);
  return {
    id: question.id,
    questionType: question.questionType,
    stem: question.stem,
    options: question.options,
    referenceAnswer: question.referenceAnswer,
    rubric: question.rubric,
    explanation: question.explanation,
    difficulty: question.difficulty,
    reviewStatus: question.reviewStatus,
    sourceMode: question.sourceMode,
    version: question.version,
    createdAt: question.createdAt,
    updatedAt: question.updatedAt,
    sourceStatus,
    sourceHealth: sourceStatus,
    learningObjectiveIds: orderedObjectives
      .map((objective) => objective.learningObjectiveId),
    objectives: orderedObjectives
      .map((link) => ({
        id: link.learningObjectiveId,
        isPrimary: Boolean(link.isPrimary),
        order: link.order,
        objective: link.objective ?? '',
        actionVerb: link.actionVerb ?? '',
        cognitiveLevel: link.cognitiveLevel ?? '',
        reviewStatus: link.reviewStatus ?? null,
        knowledgeItemId: link.knowledgeItemId ?? null,
        knowledgeItemTitle: link.knowledgeItemTitle ?? ''
      })),
    primaryObjective: primaryObjective ? {
      id: primaryObjective.learningObjectiveId,
      objective: primaryObjective.objective ?? '',
      knowledgeItemId: primaryObjective.knowledgeItemId ?? null,
      knowledgeItemTitle: primaryObjective.knowledgeItemTitle ?? ''
    } : null,
    sources: sources.map((source) => toQuestionSourceSummary(source, sourceLabels))
  };
}

export function toExamProfileWorkspaceDto(profile, { focuses = [], objectiveById = new Map() } = {}) {
  return {
    id: profile.id,
    name: profile.name,
    description: profile.description,
    scope: profile.scope,
    language: profile.language,
    commonQuestionTypes: profile.commonQuestionTypes,
    difficultyProfile: profile.difficultyProfile,
    archivedAt: profile.archivedAt,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
    focusCount: focuses.length,
    confirmedFocusCount: focuses.filter((focus) => focus.reviewStatus === 'confirmed').length,
    focuses: focuses.map((focus) => toExamFocusSummary(focus, objectiveById.get(focus.learningObjectiveId)))
  };
}

export function toExamFocusSummary(focus, objective = null) {
  return {
    id: focus.id,
    examProfileId: focus.examProfileId,
    learningObjectiveId: focus.learningObjectiveId,
    description: focus.description,
    priority: focus.priority,
    difficultyHint: focus.difficultyHint,
    questionTypeSuggestions: focus.questionTypeSuggestions,
    sourceType: focus.sourceType,
    reviewStatus: focus.reviewStatus,
    createdAt: focus.createdAt,
    updatedAt: focus.updatedAt,
    learningObjective: objective ? {
      id: objective.id,
      objective: objective.objective,
      reviewStatus: objective.reviewStatus,
      knowledgeItemId: objective.knowledgeItemId
    } : null
  };
}

function toEvidenceSummary(record, noteById) {
  const note = record.noteId ? noteById.get(record.noteId) : null;
  return {
    id: record.id,
    sourceType: record.sourceType,
    sourceId: record.sourceId,
    noteId: record.noteId,
    noteTitle: note?.title ?? '',
    noteVersionId: record.noteVersionId,
    annotationId: record.annotationId,
    quoteText: record.quoteText,
    headingPath: record.headingPath,
    status: record.status
  };
}

function toQuestionSourceSummary(source, sourceLabels) {
  return {
    id: source.id,
    sourceType: source.sourceType,
    sourceId: source.sourceId,
    quote: source.quote,
    quoteText: source.quote,
    locator: source.locator,
    contentHash: source.contentHash,
    status: source.status,
    label: sourceLabels.get(`${source.sourceType}:${source.sourceId ?? ''}`) ?? source.sourceType
  };
}
