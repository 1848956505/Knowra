import { fields, uuid } from './contract.js';
import { applyWorkspaceMutation } from './workspace-mutations.js';
import { applyTaskMutation } from './task-lifecycle.js';
const configs = {
  createWorkspace: ['name', 'description'],
  archiveWorkspace: ['expectedRevision'],
  createDocument: ['title', 'markdown'],
  updateDocument: ['documentId', 'expectedRevision', 'title', 'markdown'],
  createTask: ['title'],
  publishTask: [
    'taskId',
    'expectedRevision',
    'description',
    'acceptanceCriteria',
    'inScope',
    'outOfScope',
  ],
  cancelTask: ['taskId', 'expectedRevision'],
  reviewSubmission: [
    'taskId',
    'expectedRevision',
    'submissionId',
    'decision',
    'comment',
  ],
  claimTask: ['taskId', 'expectedRevision'],
  renewTask: ['taskId', 'attemptId', 'generation'],
  reportProgress: ['taskId', 'attemptId', 'generation', 'message'],
  submitTask: ['taskId', 'attemptId', 'generation', 'summary', 'artifacts'],
  releaseTask: ['taskId', 'attemptId', 'generation', 'message'],
};
export const mutationNames = Object.keys(configs);
export function mutationFields(kind, input) {
  fields(
    input,
    ['operationId', 'workspaceId', ...configs[kind]],
    ['operationId', ...(kind === 'createWorkspace' ? [] : ['workspaceId'])],
  );
  uuid(input.operationId);
  if (input.workspaceId) uuid(input.workspaceId);
}

export function applyMutation(kind, tx, ctx, input, helpers) {
  return [
    'createWorkspace',
    'archiveWorkspace',
    'createDocument',
    'updateDocument',
  ].includes(kind)
    ? applyWorkspaceMutation(kind, tx, ctx, input, helpers)
    : applyTaskMutation(kind, tx, ctx, input, helpers);
}
