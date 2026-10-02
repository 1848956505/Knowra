import { EXTRACTION_MOCK_PROFILE as profile, taskError, taskId } from './knowledge-extraction-task-contract.js';
import { verifyTaskRequest } from './knowledge-extraction-task-context.js';
import { extractionPageInput } from './knowledge-extraction-task-page.js';
import { extractionSafeError } from './knowledge-extraction-http-errors.js';

const retryRejections = new Set(['KNOWLEDGE_EXTRACTION_GRANT_INVALID', 'KNOWLEDGE_EXTRACTION_SCOPE_FORBIDDEN',
  'KNOWLEDGE_EXTRACTION_SOURCE_UNAVAILABLE', 'KNOWLEDGE_EXTRACTION_INPUT_TOO_LARGE', 'KNOWLEDGE_EXTRACTION_GATEWAY_INPUT_TOO_LARGE']);

function summary(job, descriptor) {
  return { contractVersion: 1, kind: 'knowledgeExtraction', jobId: job.jobId, scopeId: descriptor.scopeId,
    spaceId: job.spaceId, executionMode: 'mock', status: job.status, phase: job.phase,
    createdAt: job.createdAt, updatedAt: job.updatedAt };
}

/** 只读协议投影；操作仍由原生命周期在写事务中复核。 */
export function createExtractionTaskQueries({ read, load, view, store, ownerId, clock, canUse }) {
  return {
    async ready() {
      if (!canUse()) return false;
      return read(function* (context) {
        const identity = yield context.aiRepository.identity();
        return taskId(identity?.datasetId) && taskId(identity?.datasetEpoch) && typeof store.listPage === 'function';
      });
    },
    list(input) {
      return read(function* (context) {
        const identity = yield context.aiRepository.identity();
        const { page, cursor } = extractionPageInput(input, identity, ownerId);
        const space = yield context.repositories.knowledgeSpaceRepository.findById(page.spaceId);
        if (!space || space.userId !== ownerId) throw taskError('KNOWLEDGE_EXTRACTION_TASK_NOT_FOUND', '提炼空间不可用。', 404);
        const rows = yield store.listPage(page, context.transaction);
        const items = [];
        for (const row of rows.slice(0, page.limit)) {
          const task = yield* load(context, row.jobId);
          if (task.job.spaceId !== page.spaceId || task.job.createdAt !== row.createdAt) {
            throw taskError('KNOWLEDGE_EXTRACTION_TASK_INVALID', '提炼列表与任务边界不一致。', 422);
          }
          items.push(summary(task.job, task.descriptor));
        }
        return { items, nextCursor: rows.length > page.limit ? cursor(rows[page.limit - 1]) : null };
      });
    },
    async inspect(jobId) {
      const detail = await read(function* (context) {
        const { job, descriptor } = yield* load(context, jobId);
        const base = yield* view(context, jobId);
        let retryCode = null;
        if (job.status === 'failed') {
          const attempts = yield context.aiRepository.list('aiJobAttempt', { jobId });
          if (attempts.length >= profile.maxAttempts) retryCode = 'KNOWLEDGE_EXTRACTION_ATTEMPT_LIMIT';
        }
        const events = job.status === 'failed' ? yield context.aiRepository.listEvents(jobId) : [];
        const failure = [...events].reverse().find(event => ['attemptFailed', 'recoveryRequired'].includes(event.eventKind));
        return { ...summary(job, descriptor), candidateIds: base.candidateIds,
          error: job.status === 'failed' ? extractionSafeError(failure?.safePayload?.code) : null,
          actions: { canCancel: canUse() && ['pending', 'running', 'retrying', 'cancelling'].includes(job.status),
            canRetry: false, retryUnavailableReason: retryCode ? extractionSafeError(retryCode) : null } };
      }, jobId);
      if (detail.status === 'failed' && !detail.actions.retryUnavailableReason) {
        // 重新打开短事务：同步与异步驱动的校验错误在此统一处理，不吞掉存储损坏。
        try {
          await read(function* (context) {
            const task = yield* load(context, jobId);
            if (task.job.status !== 'failed') throw taskError('KNOWLEDGE_EXTRACTION_NOT_RETRYABLE', '任务状态已变化。');
            yield* verifyTaskRequest(context, ownerId, task, clock);
          }, jobId);
          detail.actions.canRetry = canUse();
          if (!detail.actions.canRetry) detail.actions.retryUnavailableReason = extractionSafeError('KNOWLEDGE_EXTRACTION_UNAVAILABLE');
        } catch (error) {
          if (!retryRejections.has(error.code) && error.code !== 'KNOWLEDGE_EXTRACTION_NOT_RETRYABLE') throw error;
          detail.actions.retryUnavailableReason = extractionSafeError(error.code);
        }
      }
      return detail;
    }
  };
}
