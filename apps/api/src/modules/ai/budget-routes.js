import { parseBody } from '../../http/request.js';
import { sendJson } from '../../http/response.js';
import { createAppError } from '../../errors/app-error.js';

/** 云端是 Web 与 Mac 的唯一预算权威；所有请求仍受部署层 Basic Auth 保护。 */
export async function handleBudgetRoute({ request, response, url, authority }) {
  if (!url.pathname.startsWith('/api/ai/budget/')) return false;
  if (!authority) throw createAppError('AI_BUDGET_UNAVAILABLE', '预算权威不可用。', 503);
  response.setHeader('Cache-Control', 'no-store');
  if (request.headers['x-knowra-ai-budget'] !== '1') throw createAppError('AI_BUDGET_REQUEST_REJECTED', '预算请求无效。', 403);
  const accountRef = 'deepseek-primary';
  try {
    if (request.method === 'GET' && url.pathname === '/api/ai/budget/status') {
      sendJson(response, 200, { data: await authority.status(accountRef) }); return true;
    }
    if (request.method === 'POST' && url.pathname === '/api/ai/budget/reserve') {
      const input = await parseBody(request, { limitBytes: 2048 });
      sendJson(response, 200, { data: await authority.reserve({ ...input, day: undefined, accountRef }) }); return true;
    }
    if (request.method === 'POST' && url.pathname === '/api/ai/budget/settle') {
      const input = await parseBody(request, { limitBytes: 2048 });
      sendJson(response, 200, { data: await authority.settle({ ...input, accountRef }) }); return true;
    }
  } catch (error) {
    if (error.code?.startsWith('AI_BUDGET_') || error.code?.startsWith('AI_DAILY_') || error.code?.startsWith('AI_JOB_')) {
      throw createAppError(error.code, error.message, error.code.endsWith('EXCEEDED') || error.code.endsWith('CONFLICT') ? 409 : 422);
    }
    throw error;
  }
  return false;
}
