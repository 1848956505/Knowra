import { ApiRequestError, type RequestJson } from './client.js';
import { getData, isRecord } from './response.js';
import type {
  Workspace,
  DocumentDTO,
  DocumentMutationData,
  TaskSummary,
  TaskDetail,
  TaskStatus,
  TaskEvent,
  Review,
  MutationResult,
  Page,
  TaskWorkspaceCapabilities,
  DocumentReference,
  UploadAttachmentResult,
} from '../task-workspaces/types.js';
export type * from '../task-workspaces/types.js';
import { isTaskDocumentPage } from '../task-workspaces/validation.js';
export function createTaskWorkspaceApi(
  requestJson: RequestJson,
  options: { datasetEpoch?: () => string | null } = {},
) {
  const root = '/api/task-workspaces';
  const path = (workspaceId: string, suffix = '') =>
    `${root}/${encodeURIComponent(workspaceId)}${suffix}`;
  const query = (input: Record<string, unknown>) => {
    const parts = Object.entries(input)
      .filter(([, v]) => v !== undefined)
      .map(
        ([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`,
      );
    return parts.length ? `?${parts.join('&')}` : '';
  };
  async function request<T>(
    url: string,
    method = 'GET',
    body?: unknown,
  ): Promise<T> {
    let value: unknown;
    try {
      value = getData(
        await requestJson(url, {
          method,
          ...(method === 'GET'
            ? {}
            : {
                headers: {
                  'X-Task-Workspace-Epoch': options.datasetEpoch?.() ?? '',
                },
              }),
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        }),
      );
    } catch (error) {
      throw new ApiRequestError('任务工作区请求未完成，请刷新后重试。', {
        status: error instanceof ApiRequestError ? error.status : 0,
        code: error instanceof ApiRequestError ? error.code : null,
      });
    }
    if (!isRecord(value))
      throw new ApiRequestError('任务工作区响应无效。', {
        status: 502,
        code: 'TASK_WORKSPACE_INVALID_RESPONSE',
      });
    return value as T;
  }
  const getDocumentPage = async (input: {
    workspaceId: string;
    documentId: string;
    versionId?: string;
    start?: number;
  }): Promise<DocumentDTO> => {
    const value = await request<unknown>(
      path(
        input.workspaceId,
        `/documents/${encodeURIComponent(input.documentId)}`,
      ) + query({ versionId: input.versionId, start: input.start }),
    );
    if (!isTaskDocumentPage(value, input))
      throw new ApiRequestError('文档响应无效，请重新打开。', {
        status: 502,
        code: 'TASK_WORKSPACE_INVALID_RESPONSE',
      });
    return value;
  };
  const api = {
    getCapabilities: () =>
      request<TaskWorkspaceCapabilities>(`${root}/capabilities`),
    listWorkspaces: (input: { limit?: number; cursor?: string } = {}) =>
      request<Page<Workspace>>(root + query(input)),
    getWorkspace: (input: { workspaceId: string }) =>
      request<Workspace>(path(input.workspaceId)),
    createWorkspace: (input: {
      operationId: string;
      name: string;
      description?: string;
    }) =>
      request<MutationResult<{ workspace: Workspace }>>(root, 'POST', input),
    archiveWorkspace: (input: {
      workspaceId: string;
      operationId: string;
      expectedRevision: number;
    }) => {
      const { workspaceId, ...body } = input;
      return request<MutationResult<{ workspace: Workspace }>>(
        path(workspaceId, '/archive'),
        'POST',
        body,
      );
    },
    listDocuments: (input: {
      workspaceId: string;
      limit?: number;
      cursor?: string;
    }) => {
      const { workspaceId, ...q } = input;
      return request<Page<DocumentDTO>>(
        path(workspaceId, '/documents') + query(q),
      );
    },
    getDocument: getDocumentPage,
    async getFullDocument(input: {
      workspaceId: string;
      documentId: string;
      versionId?: string;
    }): Promise<DocumentDTO> {
      const first = await getDocumentPage(input);
      let markdown = first.markdown,
        part = first;
      while (part.hasMore) {
        part = await getDocumentPage({
          ...input,
          versionId: first.version.id,
          start: part.end,
        });
        if (
          part.version.contentHash !== first.version.contentHash ||
          part.revision !== first.revision
        )
          throw new ApiRequestError('文档已变化，请重新打开。', {
            status: 409,
            code: 'TASK_WORKSPACE_CONFLICT',
          });
        markdown += part.markdown;
        if (markdown.length > 256 * 1024)
          throw new ApiRequestError('文档超过读取限制。', {
            status: 413,
            code: 'TASK_WORKSPACE_LIMIT',
          });
      }
      return {
        ...first,
        markdown,
        start: 0,
        end: markdown.length,
        hasMore: false,
      };
    },
    createDocument: (input: {
      workspaceId: string;
      operationId: string;
      title: string;
      markdown: string;
    }) => {
      const { workspaceId, ...body } = input;
      return request<MutationResult<DocumentMutationData>>(
        path(workspaceId, '/documents'),
        'POST',
        body,
      );
    },
    updateDocument: (input: {
      workspaceId: string;
      documentId: string;
      operationId: string;
      expectedRevision: number;
      title?: string;
      markdown?: string;
    }) => {
      const { workspaceId, documentId, ...body } = input;
      return request<MutationResult<DocumentMutationData>>(
        path(workspaceId, `/documents/${encodeURIComponent(documentId)}`),
        'PATCH',
        body,
      );
    },
    listTasks: (input: {
      workspaceId: string;
      status?: TaskStatus;
      limit?: number;
      cursor?: string;
    }) => {
      const { workspaceId, ...q } = input;
      return request<Page<TaskSummary>>(path(workspaceId, '/tasks') + query(q));
    },
    getTask: (input: { workspaceId: string; taskId: string }) =>
      request<TaskDetail>(
        path(input.workspaceId, `/tasks/${encodeURIComponent(input.taskId)}`),
      ),
    listTaskEvents: (input: {
      workspaceId: string;
      taskId: string;
      afterSequence?: number;
      limit?: number;
    }) => {
      const { workspaceId, taskId, ...q } = input;
      return request<{ items: TaskEvent[]; nextAfterSequence: number | null }>(
        path(workspaceId, `/tasks/${encodeURIComponent(taskId)}/events`) +
          query(q),
      );
    },
    createTask: (input: {
      workspaceId: string;
      operationId: string;
      title: string;
    }) => {
      const { workspaceId, ...body } = input;
      return request<MutationResult<{ task: TaskSummary }>>(
        path(workspaceId, '/tasks'),
        'POST',
        body,
      );
    },
    publishTask: (input: {
      workspaceId: string;
      taskId: string;
      operationId: string;
      expectedRevision: number;
      description: DocumentReference;
      acceptanceCriteria: string[];
      inScope: string;
      outOfScope: string;
    }) => {
      const { workspaceId, taskId, ...body } = input;
      return request<MutationResult<{ task: TaskSummary }>>(
        path(workspaceId, `/tasks/${encodeURIComponent(taskId)}/publish`),
        'POST',
        body,
      );
    },
    cancelTask: (input: {
      workspaceId: string;
      taskId: string;
      operationId: string;
      expectedRevision: number;
    }) => {
      const { workspaceId, taskId, ...body } = input;
      return request<MutationResult<{ task: TaskSummary }>>(
        path(workspaceId, `/tasks/${encodeURIComponent(taskId)}/cancel`),
        'POST',
        body,
      );
    },
    reviewSubmission: (input: {
      workspaceId: string;
      taskId: string;
      operationId: string;
      expectedRevision: number;
      submissionId: string;
      decision: 'accepted' | 'returned';
      comment?: string;
    }) => {
      const { workspaceId, taskId, ...body } = input;
      return request<MutationResult<{ task: TaskSummary; review: Review }>>(
        path(workspaceId, `/tasks/${encodeURIComponent(taskId)}/review`),
        'POST',
        body,
      );
    },
  };
  return api;
}
export type TaskWorkspaceApi = ReturnType<typeof createTaskWorkspaceApi>;
/** Binary transport supplied by the host; web-core has no DOM/FormData dependency. */
export type TaskWorkspaceUpload = (input: {
  workspaceId: string;
  documentId: string;
  operationId: string;
  expectedRevision: number;
  file: unknown;
}) => Promise<MutationResult<UploadAttachmentResult>>;
