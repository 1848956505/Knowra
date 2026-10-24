import { createHash } from 'node:crypto';

/** 未校验的投影输入；这些字段不承诺 provider 合法性或 JSON 安全性。 */
export interface OutboundPayloadRequest {
  modelId?: unknown;
  messages?: unknown;
  maxTokens?: unknown;
  format?: unknown;
  tools: OutboundPayloadTools;
}
/** 保留原 map 的接收者与返回值，不假定它是标准数组方法。 */
export interface OutboundPayloadTools {
  readonly length: unknown;
  map(callback: (tool: unknown) => OutboundToolWrapper): unknown;
}
export interface OutboundToolWrapper {
  type: 'function';
  function: unknown;
}
export interface DeepSeekPayloadOptions {
  stream?: boolean | undefined;
}
export interface DeepSeekPayload {
  model: unknown;
  messages: unknown;
  max_tokens: unknown;
  stream: boolean;
  thinking: { type: 'disabled' };
  response_format?: { type: 'json_object' } | undefined;
  tools?: unknown;
  tool_choice?: 'auto' | undefined;
  stream_options?: { include_usage: true } | undefined;
}

/** 与 DeepSeek adapter 共用同一序列化入口，预算和 manifest 才能覆盖实际请求体。 */
export function deepSeekPayload(
  request: OutboundPayloadRequest,
  { stream = false }: DeepSeekPayloadOptions = {}
): DeepSeekPayload {
  return {
    model: request.modelId,
    messages: request.messages,
    max_tokens: request.maxTokens,
    stream,
    // V4 默认开启思考，推理 token 会占用 max_tokens，导致 JSON/工具回合被截断；知境的回合不依赖推理内容。
    thinking: { type: 'disabled' },
    // 强制 JSON 输出时 DeepSeek 不会发起工具调用（只在 JSON 回答里口头说要调用），所以带工具的请求靠提示词约束 JSON，由网关兜底解析。
    ...(request.format === 'json' && !request.tools.length ? { response_format: { type: 'json_object' } } : {}),
    ...(request.tools.length
      ? {
          tools: request.tools.map((tool): OutboundToolWrapper => ({ type: 'function', function: tool })),
          tool_choice: 'auto'
        }
      : {}),
    ...(stream ? { stream_options: { include_usage: true } } : {})
  };
}

/** 标准 JSON.stringify 且无 Object.prototype.toJSON 改写时，顶层普通对象只能返回字符串或抛错。 */
export function serializedDeepSeekPayload(
  request: OutboundPayloadRequest,
  options?: DeepSeekPayloadOptions | undefined
): string {
  return JSON.stringify(deepSeekPayload(request, options));
}

export function outboundPayloadHash(
  request: OutboundPayloadRequest,
  options?: DeepSeekPayloadOptions | undefined
): string {
  return createHash('sha256').update(serializedDeepSeekPayload(request, options), 'utf8').digest('hex');
}
