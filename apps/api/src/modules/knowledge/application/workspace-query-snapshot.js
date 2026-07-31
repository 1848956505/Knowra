import { groupBy } from './workspace-query-utils.js';

export function createWorkspaceSnapshotReader({ repositories } = {}) {
  if (!repositories) throw new TypeError('Workspace query repositories are required');

  return { load };

  async function load() {
    const [
      notes,
      noteVersions,
      knowledgeItems,
      evidence,
      objectives,
      profiles,
      focuses,
      questions
    ] = await Promise.all([
      repositories.noteRepository.list({ includeDeleted: true }),
      repositories.noteVersionRepository.list(),
      repositories.knowledgeItemRepository.list({ includeArchived: true, includeDeleted: true }),
      repositories.knowledgeEvidenceRepository.list(),
      repositories.learningObjectiveRepository.list({ includeArchived: true }),
      repositories.examProfileRepository.list({ includeArchived: true }),
      repositories.examFocusRepository.list({ includeArchived: true }),
      repositories.questionRepository.list({ includeArchived: true })
    ]);

    const questionIds = questions.map((question) => question.id);
    const [questionObjectives, questionSources] = await Promise.all([
      repositories.questionObjectiveRepository.listByQuestionIds(questionIds),
      repositories.questionSourceRepository.list()
    ]);

    return {
      notes,
      noteVersions,
      knowledgeItems,
      evidence,
      objectives,
      profiles,
      focuses,
      questions,
      questionObjectives,
      questionSources,
      indexes: buildIndexes({
        notes,
        noteVersions,
        knowledgeItems,
        evidence,
        objectives,
        profiles,
        focuses,
        questions,
        questionObjectives,
        questionSources
      })
    };
  }
}

function buildIndexes(records) {
  const {
    notes,
    noteVersions,
    evidence,
    objectives,
    focuses,
    questions,
    questionObjectives,
    questionSources
  } = records;
  return {
    noteById: new Map(notes.map((note) => [note.id, note])),
    noteVersionById: new Map(noteVersions.map((version) => [version.id, version])),
    evidenceByItem: groupBy(evidence, (record) => record.knowledgeItemId),
    objectivesByItem: groupBy(objectives, (objective) => objective.knowledgeItemId),
    focusByProfile: groupBy(focuses, (focus) => focus.examProfileId),
    linksByQuestion: groupBy(questionObjectives, (link) => link.questionId),
    sourcesByQuestion: groupBy(questionSources, (source) => source.questionId),
    questionsByObjective: groupQuestionsByObjective(questions, questionObjectives)
  };
}

function groupQuestionsByObjective(questions, links) {
  const questionById = new Map(questions.map((question) => [question.id, question]));
  return links.reduce((groups, link) => {
    const question = questionById.get(link.questionId);
    if (!question) return groups;
    const group = groups.get(link.learningObjectiveId) ?? [];
    group.push(question);
    groups.set(link.learningObjectiveId, group);
    return groups;
  }, new Map());
}
