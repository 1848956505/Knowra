import { wrapHandlersWithMaintenanceGate } from '../../infrastructure/maintenance-gate.js';
import { createNoteActionService } from './action-service.js';
import { createAiGateway } from './gateway.js';
import { createDeepSeekAdapter } from './infrastructure/providers/deepseek-adapter.js';
import { createIsolatedDeepSeekAdapter } from './isolated-provider.js';
import { createAiWorker } from './worker.js';
import { createIsolatedAiWorker } from './isolated-worker.js';
import { createAiReadContextService } from './read-context-service.js';
import { createAiAccessService } from './access-service.js';
import { createAiConversationService } from './conversation-service.js';
import { createAiAgentWorker } from './agent-worker.js';
import { createAgentKnowledgeCommitService } from './agent-knowledge-commit.js';
import { createConversationAttachmentService } from './conversation-attachments.js';

/** 生成入口由 AI-01-04 的预算服务注入 authorizePaidCall 后才可启用。 */
export function createAiRuntime({ modelSettings, repository = null, accessStore = null, conversationStore = null, budgetAuthority = null, priceProfile = null,
  actionStore = null, coreOperationStore = null, knowledge = null, asyncDomain = false, maintenanceGate = null,
  authorizePaidCall, fetchImpl, allowExternal = false, contextSources = null,
  verifySources = null, knowledgeProposals = false, validateResult = null, providerAdapter = null, retrievalCandidates = null, webSearchAdapter = null,
  uploadsDir = null } = {}) {
  if (!modelSettings || typeof modelSettings.resolveCredential !== 'function') throw new TypeError('Model settings service is required');
  const activeAttempts = new Set();
  const gateway = createAiGateway({
    adapter: providerAdapter ?? (fetchImpl ? createDeepSeekAdapter({ fetchImpl }) : createIsolatedDeepSeekAdapter()),
    resolveCredential: reference => modelSettings.resolveCredential(reference),
    authorizePaidCall: authorizePaidCall ?? (request => activeAttempts.delete(request.budgetAttemptId))
  });
  const readContext = repository && contextSources ? createAiReadContextService({ repository, ...contextSources }) : null;
  const access = accessStore && contextSources ? createAiAccessService({ store: accessStore, ...contextSources }) : null;
  const actionService = actionStore && coreOperationStore && knowledge ? createNoteActionService({ store: actionStore, core: coreOperationStore, knowledge,
    ownerId: contextSources.ownerId, conversationStore, accessStore, access, asyncDomain }) : null;
  const actions = actionService && maintenanceGate ? wrapHandlersWithMaintenanceGate(actionService, maintenanceGate, { getAccess: () => 'read' }) : actionService;
  const knowledgeCommit = knowledgeProposals && coreOperationStore && knowledge
    ? createAgentKnowledgeCommitService({ core: coreOperationStore, knowledge, ownerId: contextSources?.ownerId, asyncDomain }) : null;
  const agent = conversationStore && access && budgetAuthority && priceProfile
    ? createAiAgentWorker({ store: conversationStore, access, modelSettings, budget: budgetAuthority,
      gateway, priceProfile, allowExternal, retrievalCandidates, actions, webSearchAdapter,
      annotations: knowledge?.repositories?.contentAnnotationRepository ?? null, knowledgeProposals: Boolean(knowledgeCommit), knowledgeCommit,
      authorizeAttempt: id => activeAttempts.add(id), revokeAttempt: id => activeAttempts.delete(id) }) : null;
  const conversation = conversationStore && repository && contextSources
    ? createAiConversationService({ store: conversationStore, legacyRepository: repository,
      accessStore, spaceRepository: contextSources.spaceRepository, ownerId: contextSources.ownerId,
      agent }) : null;
  const attachmentService = conversation && uploadsDir ? createConversationAttachmentService({
    conversationStore, uploadsDir, ownerId: contextSources.ownerId,
    assertConversation: id => conversation.get(id)
  }) : null;
  const attachments = attachmentService && maintenanceGate ? {
    ...wrapHandlersWithMaintenanceGate(attachmentService, maintenanceGate, {
      getAccess: name => ['upload', 'remove'].includes(name) ? 'mutation' : 'read'
    }), close: attachmentService.close
  } : attachmentService;
  return {
    actions, actionStore, attachments,
    generationAvailable: modelId => Boolean(allowExternal && priceProfile?.version
      && priceProfile.modelId === modelId && Date.parse(priceProfile.expiresAt) > Date.now()),
    priceProfile,
    repository,
    accessStore,
    budgetAuthority,
    gateway,
    readContext,
    access,
    conversationStore,
    conversation,
    agent,
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
  return { actions: null, attachments: null, unavailableReason: reason, generationAvailable: () => false,
    credentialReference: async () => null, repository: null, budgetAuthority: null,
    readContext: null, accessStore: null, access: null, conversationStore: null, conversation: null,
    agent: null, worker: null, gateway: null, priceProfile: null };
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
