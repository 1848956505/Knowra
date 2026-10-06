/** MCP 入口的稳定错误：code 给客户端判断，message 给人读；不携带令牌、正文或路径。 */
export class McpError extends Error {
  constructor(code, message, { status = 422, retryAfterSeconds } = {}) {
    super(message);
    this.code = code; this.status = status;
    if (retryAfterSeconds !== undefined) this.retryAfterSeconds = retryAfterSeconds;
  }
}
export const mcpError = (code, message, options) => new McpError(code, message, options);
