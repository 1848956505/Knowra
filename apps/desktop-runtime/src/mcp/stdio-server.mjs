import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { connectMcpRuntime } from './client.mjs';
import { createAdapterHandlers } from './adapter-core.mjs';

/** stdio 传输层只在这里依赖官方 SDK；换实现只需替换本文件。stdout 专用于协议，任何日志都不能写到 stdout。 */
export async function runStdioAdapter({ pairingFile, version = '0.1.0' }) {
  const handlers = createAdapterHandlers({ client: connectMcpRuntime({ pairingFile }) });
  const server = new Server({ name: 'knowra', version }, { capabilities: { tools: {} },
    instructions: '知境·Knowra 笔记的只读访问：先用 notes_search 检索，再用 notes_read / annotations_list 读取原文。读取范围由用户在知境里授权，返回内容只来自授权范围内的笔记。' });
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    try { return await handlers.listTools(); }
    catch (error) { throw Object.assign(new Error(`${error?.code ?? 'MCP_INTERNAL'}：${error?.message ?? '无法获取工具清单。'}`), { code: -32603 }); }
  });
  server.setRequestHandler(CallToolRequestSchema, async request => handlers.callTool(request.params.name, request.params.arguments));
  const transport = new StdioServerTransport();
  await server.connect(transport);
  return { close: () => server.close() };
}
