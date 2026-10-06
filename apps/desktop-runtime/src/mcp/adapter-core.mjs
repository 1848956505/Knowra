/**
 * 适配器的业务逻辑，与具体 MCP 库无关：把运行端的片段结果整理成 MCP 工具结果，把错误整理成工具错误（isError）。
 * 适配器没有自己的工具表，工具清单、参数结构与全部校验都来自运行端。
 */
export function createAdapterHandlers({ client }) {
  const textOf = result => JSON.stringify(result);
  const failure = error => {
    const retry = Number.isFinite(error?.retryAfterSeconds) ? `（约 ${error.retryAfterSeconds} 秒后可重试）` : '';
    const code = typeof error?.code === 'string' && /^MCP_[A-Z_]+$/.test(error.code) ? error.code : 'MCP_INTERNAL';
    return { isError: true, content: [{ type: 'text', text: `${code}：${typeof error?.message === 'string' ? error.message : '外部调用失败。'}${retry}` }] };
  };
  return {
    async listTools() {
      const tools = await client.listTools();
      return { tools: tools.map(tool => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema })) };
    },
    async callTool(name, args) {
      try {
        const result = await client.call(name, args ?? {});
        return { content: [{ type: 'text', text: textOf(result) }], structuredContent: result };
      } catch (error) { return failure(error); }
    }
  };
}
