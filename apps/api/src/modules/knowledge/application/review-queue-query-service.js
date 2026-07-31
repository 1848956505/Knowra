import { matchesText, paginateWorkspaceItems, parseWorkspaceQuery } from './workspace-query-utils.js';

export function createReviewQueueQuery({ snapshotReader } = {}) {
  if (!snapshotReader?.load) throw new TypeError('Review queue snapshot reader is required');

  return { listReviewQueue };

  async function listReviewQueue(input = {}) {
    const query = parseWorkspaceQuery(input);
    const snapshot = await snapshotReader.load();
    const itemById = new Map(snapshot.knowledgeItems.map((item) => [item.id, item]));
    const objectiveById = new Map(snapshot.objectives.map((objective) => [objective.id, objective]));
    const queue = [
      ...buildKnowledgeItemEntries(snapshot),
      ...buildEvidenceEntries(snapshot, itemById),
      ...buildObjectiveEntries(snapshot, itemById),
      ...buildQuestionEntries(snapshot, objectiveById)
    ]
      .filter((entry) => matchesQueueEntry(entry, query))
      .sort(compareUpdatedDesc);
    return paginateWorkspaceItems(queue, query);
  }
}

function buildKnowledgeItemEntries(snapshot) {
  return snapshot.knowledgeItems
    .filter((item) => !item.deletedAt && ['candidate', 'needsRevision'].includes(item.reviewStatus))
    .map((item) => ({
      kind: 'knowledgeItem',
      id: item.id,
      resourceType: 'knowledgeItem',
      resourceId: item.id,
      title: item.title || '未命名知识单元',
      summary: item.canonicalStatement,
      status: item.reviewStatus,
      reason: item.reviewStatus === 'candidate' ? '知识单元待确认' : '知识单元需要修订',
      updatedAt: item.updatedAt
    }));
}

function buildEvidenceEntries(snapshot, itemById) {
  return snapshot.evidence
    .filter((record) => ['stale', 'invalid', 'insufficient'].includes(record.status))
    .map((record) => {
      const item = itemById.get(record.knowledgeItemId);
      return {
        kind: 'knowledgeEvidence',
        id: record.id,
        resourceType: 'knowledgeItem',
        resourceId: record.knowledgeItemId,
        title: item?.title ?? '知识来源',
        summary: record.quoteText || '来源未提供引用文本',
        status: record.status,
        reason: `来源${evidenceStatusLabel(record.status)}`,
        updatedAt: record.updatedAt
      };
    });
}

function buildObjectiveEntries(snapshot, itemById) {
  return snapshot.objectives
    .filter((objective) => objective.reviewStatus === 'candidate')
    .map((objective) => ({
      kind: 'learningObjective',
      id: objective.id,
      resourceType: 'learningObjective',
      resourceId: objective.id,
      title: itemById.get(objective.knowledgeItemId)?.title ?? '学习目标',
      summary: objective.objective || '目标内容尚未填写',
      status: objective.reviewStatus,
      reason: '学习目标待确认',
      updatedAt: objective.updatedAt
    }));
}

function buildQuestionEntries(snapshot, objectiveById) {
  const linksByQuestion = new Map();
  snapshot.questionObjectives.forEach((link) => {
    const links = linksByQuestion.get(link.questionId) ?? [];
    links.push(link);
    linksByQuestion.set(link.questionId, links);
  });
  const sourcesByQuestion = new Map();
  snapshot.questionSources.forEach((source) => {
    const sources = sourcesByQuestion.get(source.questionId) ?? [];
    sources.push(source);
    sourcesByQuestion.set(source.questionId, sources);
  });
  return snapshot.questions
    .filter((question) => question.reviewStatus !== 'archived')
    .flatMap((question) => {
      const sources = sourcesByQuestion.get(question.id) ?? [];
      const staleSource = sources.find((source) => source.status === 'stale');
      const missingSource = sources.length === 0;
      if (!staleSource && !missingSource && question.reviewStatus !== 'candidate') return [];
      const objective = objectiveById.get(linksByQuestion.get(question.id)?.[0]?.learningObjectiveId);
      const reason = staleSource ? '题目来源待复核' : missingSource ? '题目缺少来源' : '题目待确认';
      return [{
        kind: 'question',
        id: question.id,
        resourceType: 'question',
        resourceId: question.id,
        title: question.stem || '未命名题目',
        summary: objective?.objective ?? question.explanation,
        status: staleSource ? 'stale' : question.reviewStatus,
        reason,
        updatedAt: question.updatedAt
      }];
    });
}

function matchesQueueEntry(entry, query) {
  if (query.kind && entry.kind !== query.kind) return false;
  if (query.reviewStatus && entry.status !== query.reviewStatus) return false;
  return matchesText([entry.title, entry.summary, entry.reason], query.query);
}

function evidenceStatusLabel(status) {
  return {
    stale: '待复核',
    invalid: '已失效',
    insufficient: '不足'
  }[status] ?? status;
}

function compareUpdatedDesc(left, right) {
  return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
    || String(left.id).localeCompare(String(right.id));
}
