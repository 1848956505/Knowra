import { parseBody } from '../../http/request.js';
import { sendJson } from '../../http/response.js';
import { AppError, createAppError } from '../../errors/app-error.js';

export async function handleAssistantRoute({ request, response, url, assistant }) {
  if (!url.pathname.startsWith('/api/ai/assistant')) return false;
  if (!assistant) throw createAppError('AI_ASSISTANT_UNAVAILABLE', '助手服务不可用。', 503);
  response.setHeader('Cache-Control', 'no-store');
  const root = '/api/ai/assistant';
  const jobMatch = url.pathname.match(/^\/api\/ai\/assistant\/jobs\/([^/]+)(\/cancel)?$/);
  try {
    if (request.method === 'GET' && url.pathname === `${root}/status`) {
      sendJson(response, 200, { data: await assistant.status() }); return true;
    }
    if (request.method === 'GET' && url.pathname === `${root}/usage`) {
      sendJson(response, 200, { data: await assistant.usage() }); return true;
    }
    if (request.method === 'GET' && url.pathname === `${root}/budget-settings`) {
      sendJson(response, 200, { data: await assistant.budgetSettings() }); return true;
    }
    if (request.method === 'GET' && url.pathname === `${root}/balance`) {
      sendJson(response, 200, { data: await assistant.balance() }); return true;
    }
    if (request.method === 'GET' && url.pathname === `${root}/jobs`) {
      sendJson(response, 200, { data: await assistant.list(url.searchParams.get('spaceId')) }); return true;
    }
    if (request.method === 'GET' && jobMatch && !jobMatch[2]) {
      sendJson(response, 200, { data: await assistant.get(decodeURIComponent(jobMatch[1])) }); return true;
    }
    if (request.method === 'POST') {
      if (request.headers['x-knowra-ai-assistant'] !== '1') {
        throw createAppError('AI_REQUEST_REJECTED', '助手请求无效。', 403);
      }
      if (url.pathname === `${root}/budget-settings`) {
        sendJson(response, 200, { data: await assistant.saveBudgetSettings(await parseBody(request, { limitBytes: 2048 })) }); return true;
      }
      if (url.pathname === `${root}/balance/refresh`) {
        sendJson(response, 200, { data: await assistant.balance({ refresh: true }) }); return true;
      }
      if (url.pathname === `${root}/preview`) {
        sendJson(response, 200, { data: await assistant.preview(await parseBody(request, { limitBytes: 8192 })) }); return true;
      }
      if (url.pathname === `${root}/jobs`) {
        sendJson(response, 202, { data: await assistant.start(await parseBody(request, { limitBytes: 2048 })) }); return true;
      }
      if (jobMatch?.[2] === '/cancel') {
        sendJson(response, 200, { data: await assistant.cancel(decodeURIComponent(jobMatch[1])) }); return true;
      }
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error.code?.startsWith('AI_')) {
      const status = ['AI_JOB_NOT_FOUND'].includes(error.code) ? 404
        : error.code === 'AI_PRIVATE_STORAGE_UNAVAILABLE' ? 503
        : ['AI_GENERATION_UNAVAILABLE', 'AI_PREVIEW_EXPIRED', 'AI_APPROVAL_STALE', 'AI_CREDENTIAL_STALE',
          'AI_SOURCE_STALE', 'AI_NOT_CONFIGURED'].includes(error.code) ? 409 : ['AI_BUDGET_UNAVAILABLE', 'AI_BALANCE_UNAVAILABLE', 'AI_BUDGET_SETTINGS_UNAVAILABLE'].includes(error.code) ? 503 : error.code === 'AI_BALANCE_STORAGE_INVALID' ? 500 : 422;
      throw createAppError(error.code, error.message, status);
    }
    throw error;
  }
  return false;
}
