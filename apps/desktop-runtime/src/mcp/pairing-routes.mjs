import { McpError } from './mcp-error.mjs';

function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}

/** 设置页入口（浏览器会话保护）：创建/列出/撤销配对与查看最近调用。响应里没有令牌，只有配对文件路径。 */
export async function handleMcpPairingRoute({ request, response, url, mcp, parseBody }) {
  const fail = error => json(response, error.status ?? 422, { error: { code: error.code ?? 'MCP_FAILED', message: error.message } });
  if (!mcp) { fail(new McpError('MCP_UNAVAILABLE', '外部客户端入口当前不可用。', { status: 503 })); return true; }
  const service = mcp.service;
  try {
    if (request.method !== 'GET' && request.headers['x-knowra-mcp-pairing'] !== '1') {
      throw new McpError('MCP_REQUEST_REJECTED', '配对请求无效。', { status: 403 });
    }
    if (request.method === 'GET' && url.pathname === '/api/local-runtime/mcp/pairings') {
      json(response, 200, { data: { items: service.list(), ...(await service.status()) } }); return true;
    }
    if (request.method === 'GET' && url.pathname === '/api/local-runtime/mcp/audit') {
      json(response, 200, { data: { items: service.recentAudit({ pairingId: url.searchParams.get('pairingId') || undefined,
        limit: Number(url.searchParams.get('limit')) || 50 }) } }); return true;
    }
    if (request.method === 'POST' && url.pathname === '/api/local-runtime/mcp/pairings') {
      json(response, 201, { data: await service.create(await parseBody(request, { limitBytes: 8192 })) }); return true;
    }
    const knowledgeRead = url.pathname.match(/^\/api\/local-runtime\/mcp\/pairings\/([^/]+)\/knowledge-read$/);
    if (request.method === 'POST' && knowledgeRead) {
      json(response, 200, { data: await service.setKnowledgeRead(decodeURIComponent(knowledgeRead[1]), await parseBody(request, { limitBytes: 8192 })) }); return true;
    }
    const revoke = url.pathname.match(/^\/api\/local-runtime\/mcp\/pairings\/([^/]+)\/revoke$/);
    if (request.method === 'POST' && revoke) { json(response, 200, { data: await service.revoke(decodeURIComponent(revoke[1])) }); return true; }
  } catch (error) {
    fail(error instanceof McpError ? error : Object.assign(new McpError('MCP_REQUEST_INVALID', '请求无效。', { status: error?.statusCode ?? 400 })));
    return true;
  }
  return false;
}
