import { URL } from 'node:url';
import http from 'node:http';
import { applyCorsHeaders, handleCorsPreflight } from './http/cors.js';
import { sendError, sendJson } from './http/response.js';
import { handleStorageRoute } from './http/storage-routes.js';
import { handleKnowledgeRoute } from './modules/knowledge/http/knowledge-routes.js';
import { AppError } from './errors/app-error.js';
import { handleSyncRoute } from './modules/sync/routes.js';
import { handleModelSettingsRoute } from './modules/ai/model-settings-routes.js';
import { handleBudgetRoute } from './modules/ai/budget-routes.js';
import { createAiAssistantService } from './modules/ai/assistant-service.js';
import { handleAssistantRoute } from './modules/ai/assistant-routes.js';
import { handleAiAccessRoute } from './modules/ai/access-routes.js';

export function createServer({ appContext, cors = {}, logger = console }) {
  const allowedOrigins = cors.allowedOrigins ?? [];
  const assistant = appContext.ai && appContext.aiOwnerId
    ? createAiAssistantService({ getRuntime: () => appContext.ai, ownerId: appContext.aiOwnerId,
      location: appContext.aiLocation ?? 'server', logger }) : null;
  const aiRecovery = appContext.aiLocation === 'local' ? Promise.resolve() : Promise.resolve()
    .then(() => appContext.ai?.worker?.recover?.())
    .catch(error => logger.warn?.('AI task recovery failed', { code: error.code ?? 'AI_RECOVERY_FAILED' }));

  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      const { knowledge, storage } = appContext.http;

      applyCorsHeaders(response, request, allowedOrigins);
      if (handleCorsPreflight({ request, response, allowedOrigins })) {
        return;
      }

      if (request.method === 'GET' && url.pathname === '/') {
        sendJson(response, 200, {
          data: {
            name: '知境·Knowra API',
            health: '/api/health'
          }
        });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/health') {
        sendJson(response, 200, {
          data: {
            status: 'ok'
          }
        });
        return;
      }

      if (await handleStorageRoute({ request, response, url, storage })) {
        return;
      }

      if (await handleSyncRoute({ request, response, url, sync: appContext.http.sync })) return;

      if (await handleModelSettingsRoute({ request, response, url, modelSettings: appContext.http.modelSettings })) return;
      if (await handleBudgetRoute({ request, response, url, authority: appContext.http.aiBudget })) return;
      if (await handleAiAccessRoute({ request, response, url, access: appContext.ai?.access })) return;
      if (url.pathname.startsWith('/api/ai/assistant')) await aiRecovery;
      if (await handleAssistantRoute({ request, response, url, assistant })) return;

      if (await handleKnowledgeRoute({ request, response, url, knowledge })) {
        return;
      }

      sendJson(response, 404, {
        error: {
          code: 'ROUTE_NOT_FOUND',
          message: 'Route not found'
        }
      });
    } catch (error) {
      if (error instanceof AppError) {
        sendError(response, error.statusCode, error.code, error.message);
        return;
      }

      if (request.url?.startsWith('/api/sync/')) logger.error?.('Sync request failed', { code: error.code ?? 'INTERNAL_SERVER_ERROR' });
      else logger.error?.('Unhandled request error', error);
      sendError(
        response,
        500,
        'INTERNAL_SERVER_ERROR',
        'Internal server error'
      );
    }
  });
}
