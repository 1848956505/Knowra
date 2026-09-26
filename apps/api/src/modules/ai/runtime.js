import { createAiGateway } from './gateway.js';
import { createDeepSeekAdapter } from './infrastructure/providers/deepseek-adapter.js';
import { createAiWorker } from './worker.js';

/** 生成入口由 AI-01-04 的预算服务注入 authorizePaidCall 后才可启用。 */
export function createAiRuntime({ modelSettings, repository = null, budgetAuthority = null, priceProfile = null,
  authorizePaidCall, fetchImpl, allowExternal = false } = {}) {
  if (!modelSettings || typeof modelSettings.resolveCredential !== 'function') throw new TypeError('Model settings service is required');
  const activeAttempts = new Set();
  const gateway = createAiGateway({
    adapter: createDeepSeekAdapter({ fetchImpl }),
    resolveCredential: reference => modelSettings.resolveCredential(reference),
    authorizePaidCall: authorizePaidCall ?? (request => activeAttempts.delete(request.budgetAttemptId))
  });
  return {
    repository,
    budgetAuthority,
    gateway,
    worker: repository && budgetAuthority ? createAiWorker({ repository, budget: budgetAuthority, gateway, priceProfile,
      allowExternal, authorizeAttempt: id => activeAttempts.add(id), revokeAttempt: id => activeAttempts.delete(id) }) : null,
    credentialReference: () => modelSettings.credentialReference()
  };
}
