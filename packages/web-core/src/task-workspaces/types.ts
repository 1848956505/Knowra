export interface Actor {
  kind: 'user' | 'mcp';
  id: string;
}
export interface Workspace {
  id: string;
  name: string;
  description: string;
  archivedAt: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
}
export interface WorkspaceAttachment {
  id: string;
  documentId: string;
  fileName: string;
  mimeType: string;
  size: number;
  sha256: string;
  status: 'ready';
  createdAt: string;
}
export interface DocumentDTO {
  id: string;
  workspaceId: string;
  title: string;
  revision: number;
  currentVersionId: string;
  version: {
    id: string;
    ordinal: number;
    contentHash: string;
    createdAt: string;
    actor: Actor;
  };
  markdown: string;
  start: number;
  end: number;
  hasMore: boolean;
  attachments: WorkspaceAttachment[];
}
export interface DocumentReference {
  documentId: string;
  versionId: string;
}
export type TaskStatus =
  'draft' | 'ready' | 'running' | 'review' | 'accepted' | 'cancelled';
export interface TaskSummary {
  id: string;
  workspaceId: string;
  title: string;
  status: TaskStatus;
  revision: number;
  currentRequirementId: string | null;
  activeAttemptId: string | null;
  leaseExpiresAt: string | null;
  currentExecutor: { kind: 'mcp'; id: string; label: string } | null;
  latestProgress: { message: string; updatedAt: string } | null;
  claimable: boolean;
  leaseExpired: boolean;
  updatedAt: string;
}
export interface RequirementRevision {
  id: string;
  ordinal: number;
  description: DocumentReference;
  acceptanceCriteria: string[];
  inScope: string;
  outOfScope: string;
  createdAt: string;
  actor: Actor;
}
export interface Submission {
  id: string;
  requirementId: string;
  summary: string;
  artifacts: DocumentReference[];
  createdAt: string;
}
export interface AttemptDTO {
  id: string;
  taskId: string;
  workspaceId: string;
  requirementId: string;
  generation: number;
  actor: Actor;
  status:
    | 'running'
    | 'submitted'
    | 'released'
    | 'expired'
    | 'superseded'
    | 'cancelled';
  leaseExpiresAt: string | null;
  progress: { message: string; updatedAt: string } | null;
  submission: Submission | null;
  startedAt: string;
  finishedAt: string | null;
}
export interface Review {
  id: string;
  submissionId: string;
  requirementId: string;
  decision: 'accepted' | 'returned';
  comment: string;
  createdAt: string;
  actor: Actor;
}
export interface TaskEvent {
  sequence: number;
  type: string;
  actor: Actor;
  createdAt: string;
  data: Record<string, unknown>;
}
export interface TaskDetail extends TaskSummary {
  currentRequirement: RequirementRevision | null;
  currentAttempt: AttemptDTO | null;
  latestReview: Review | null;
  events: { afterSequence: number };
}
export interface MutationResult<T> {
  operationId: string;
  reused: boolean;
  data: T;
}
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}
export interface TaskWorkspaceCapabilities {
  available: boolean;
  contractVersion: 1;
  datasetId: string | null;
  datasetEpoch: string | null;
  images: boolean;
  reasonCode: string | null;
}
export interface UploadAttachmentResult {
  attachment: WorkspaceAttachment;
  documentRevision: number;
  imageUri: string;
}

export type DocumentMutationData = Record<'document', DocumentDTO>;
