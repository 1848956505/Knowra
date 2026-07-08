import { URL } from 'node:url';
import http from 'node:http';
import { applyCorsHeaders, handleCorsPreflight } from './http/cors.js';
import { sendError, sendJson } from './http/response.js';
import { handleStorageRoute } from './http/storage-routes.js';
import { handleKnowledgeRoute } from './modules/knowledge/http/knowledge-routes.js';

export function createServer({ appContext, cors = {} }) {
  const allowedOrigins = cors.allowedOrigins ?? [];

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
      sendError(
        response,
        error.statusCode ?? 400,
        error.code ?? 'REQUEST_ERROR',
        error.message ?? 'Request failed'
      );
    }
  });
}
