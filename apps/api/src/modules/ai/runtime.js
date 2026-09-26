import { createAiGateway } from './gateway.js';
import { createDeepSeekAdapter } from './infrastructure/providers/deepseek-adapter.js';

/** 生成入口由 AI-01-04 的预算服务注入 authorizePaidCall 后才可启用。 */
export function createAiRuntime({ modelSettings, authorizePaidCall, fetchImpl } = {}) {
  if (!modelSettings || typeof modelSettings.resolveCredential !== 'function') throw new TypeError('Model settings service is required');
  return {
    gateway: createAiGateway({
      adapter: createDeepSeekAdapter({ fetchImpl }),
      resolveCredential: reference => modelSettings.resolveCredential(reference),
      authorizePaidCall
    }),
    credentialReference: () => modelSettings.credentialReference()
  };
}
