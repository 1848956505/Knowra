import { createKnowledgeWorkspaceQuery } from './knowledge-workspace-query-service.js';
import { createReviewQueueQuery } from './review-queue-query-service.js';
import { createTrainingWorkspaceQuery } from './training-workspace-query-service.js';
import { createWorkspaceSnapshotReader } from './workspace-query-snapshot.js';

export function createWorkspaceQueryService({ repositories } = {}) {
  const snapshotReader = createWorkspaceSnapshotReader({ repositories });
  const knowledgeQuery = createKnowledgeWorkspaceQuery({ snapshotReader });
  const trainingQuery = createTrainingWorkspaceQuery({ snapshotReader });
  const reviewQuery = createReviewQueueQuery({ snapshotReader });

  return {
    ...knowledgeQuery,
    ...trainingQuery,
    ...reviewQuery
  };
}
