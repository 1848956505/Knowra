import { createAiGateway } from './gateway.js';
import { createDeepSeekAdapter } from './infrastructure/providers/deepseek-adapter.js';
import { createIsolatedDeepSeekAdapter } from './isolated-provider.js';
import { createAiWorker } from './worker.js';
import { createIsolatedAiWorker } from './isolated-worker.js';
import { createAiReadContextService } from './read-context-service.js';

/** 生成入口由 AI-01-04 的预算服务注入 authorizePaidCall 后才可启用。 */
export function createAiRuntime({ modelSettings, repository = null, budgetAuthority = null, priceProfile = null,
  authorizePaidCall, fetchImpl, allowExternal = false, contextSources = null,
  verifySources = null, validateResult = null, providerAdapter = null } = {}) {
  if (!modelSettings || typeof modelSettings.resolveCredential !== 'function') throw new TypeError('Model settings service is required');
  const activeAttempts = new Set();
  const gateway = createAiGateway({
    adapter: providerAdapter ?? (fetchImpl ? createDeepSeekAdapter({ fetchImpl }) : createIsolatedDeepSeekAdapter()),
    resolveCredential: reference => modelSettings.resolveCredential(reference),
    authorizePaidCall: authorizePaidCall ?? (request => activeAttempts.delete(request.budgetAttemptId))
  });
  const readContext = repository && contextSources ? createAiReadContextService({ repository, ...contextSources }) : null;
  return {
    generationAvailable: modelId => Boolean(allowExternal && priceProfile?.version
      && priceProfile.modelId === modelId && Date.parse(priceProfile.expiresAt) > Date.now()),
    priceProfile,
    repository,
    budgetAuthority,
    gateway,
    readContext,
    worker: repository && budgetAuthority ? (fetchImpl || providerAdapter
      ? createAiWorker({ repository, budget: budgetAuthority, gateway, priceProfile,
        allowExternal, verifySources: verifySources ?? (readContext ? (job, request) => readContext.verifyJobSources(job, request) : null),
        validateResult: validateResult ?? (readContext ? (job, result) => readContext.validateAnswer({ jobId: job.jobId, result }) : null),
        authorizeAttempt: id => activeAttempts.add(id), revokeAttempt: id => activeAttempts.delete(id) })
      : createIsolatedAiWorker({ repository, budget: budgetAuthority, gateway, modelSettings,
        readContext, priceProfile, allowExternal })) : null,
    credentialReference: () => modelSettings.credentialReference()
  };
}

export function createUnavailableAiRuntime(reason = 'AI 功能当前不可用。') {
  return { unavailableReason: reason, generationAvailable: () => false,
    credentialReference: async () => null, repository: null, budgetAuthority: null,
    readContext: null, worker: null, gateway: null, priceProfile: null };
}

export function createOptionalAiRuntime(options, { enabled = process.env.KNOWRA_AI_ENABLED !== '0',
  unavailableReason = 'AI 功能已关闭。', logger = console } = {}) {
  if (!enabled) return createUnavailableAiRuntime(unavailableReason);
  try { return createAiRuntime(options); }
  catch (error) {
    logger.warn?.('AI plugin assembly failed', { code: error?.code ?? 'AI_ASSEMBLY_FAILED' });
    return createUnavailableAiRuntime('AI 组件装配失败，核心功能仍可使用。');
  }
}
