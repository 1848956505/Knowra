import { createAiGateway } from './gateway.js';
import { createDeepSeekAdapter } from './infrastructure/providers/deepseek-adapter.js';
import { createAiWorker } from './worker.js';
import { createAiReadContextService } from './read-context-service.js';

/** 生成入口由 AI-01-04 的预算服务注入 authorizePaidCall 后才可启用。 */
export function createAiRuntime({ modelSettings, repository = null, budgetAuthority = null, priceProfile = null,
  authorizePaidCall, fetchImpl, allowExternal = false, contextSources = null,
  verifySources = null, validateResult = null } = {}) {
  if (!modelSettings || typeof modelSettings.resolveCredential !== 'function') throw new TypeError('Model settings service is required');
  const activeAttempts = new Set();
  const gateway = createAiGateway({
    adapter: createDeepSeekAdapter({ fetchImpl }),
    resolveCredential: reference => modelSettings.resolveCredential(reference),
    authorizePaidCall: authorizePaidCall ?? (request => activeAttempts.delete(request.budgetAttemptId))
  });
  const readContext = repository && contextSources ? createAiReadContextService({ repository, ...contextSources }) : null;
  return {
    repository,
    budgetAuthority,
    gateway,
    readContext,
    worker: repository && budgetAuthority ? createAiWorker({ repository, budget: budgetAuthority, gateway, priceProfile,
      allowExternal, verifySources: verifySources ?? (readContext ? (job, request) => readContext.verifyJobSources(job, request) : null),
      validateResult: validateResult ?? (readContext ? (job, result) => readContext.validateAnswer({ jobId: job.jobId, result }) : null),
      authorizeAttempt: id => activeAttempts.add(id), revokeAttempt: id => activeAttempts.delete(id) }) : null,
    credentialReference: () => modelSettings.credentialReference()
  };
}
