import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { connectMcpRuntime } from './client.mjs';
import { createAdapterHandlers } from './adapter-core.mjs';

/** stdio 传输层只在这里依赖官方 SDK；换实现只需替换本文件。stdout 专用于协议，任何日志都不能写到 stdout。 */
export async function runStdioAdapter({ pairingFile, version = '0.1.0' }) {
  const handlers = createAdapterHandlers({ client: connectMcpRuntime({ pairingFile }) });
  const server = new Server({ name: 'knowra', version }, { capabilities: { tools: {} },
    instructions: '知境·Knowra 授权知识库访问：先用 workspace_describe / notes_list 了解可读笔记范围，再用 notes_search / notes_read / annotations_list 读取原文。knowledge_search / knowledge_read 需要独立的全部知识读取授权；默认搜索 confirmed，其他审核状态须明确指定。只有单独获准的配对可以 knowledge_propose 提交待审核候选，用 proposals_get 查看状态；没有确认、直接修改或删除知识的工具。' });
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    try { return await handlers.listTools(); }
    catch (error) { throw Object.assign(new Error(`${error?.code ?? 'MCP_INTERNAL'}：${error?.message ?? '无法获取工具清单。'}`), { code: -32603 }); }
  });
  server.setRequestHandler(CallToolRequestSchema, async request => handlers.callTool(request.params.name, request.params.arguments));
  const transport = new StdioServerTransport();
  await server.connect(transport);
  return { close: () => server.close() };
}
