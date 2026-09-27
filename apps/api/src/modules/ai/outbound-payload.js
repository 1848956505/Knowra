import { createHash } from 'node:crypto';

/** 与 DeepSeek adapter 共用同一序列化入口，预算和 manifest 才能覆盖实际请求体。 */
export function deepSeekPayload(request, { stream = false } = {}) {
  return {
    model: request.modelId,
    messages: request.messages,
    max_tokens: request.maxTokens,
    stream,
    ...(request.format === 'json' ? { response_format: { type: 'json_object' } } : {}),
    ...(request.tools.length ? { tools: request.tools.map(tool => ({ type: 'function', function: tool })), tool_choice: 'auto' } : {}),
    ...(stream ? { stream_options: { include_usage: true } } : {})
  };
}

export function serializedDeepSeekPayload(request, options) {
  return JSON.stringify(deepSeekPayload(request, options));
}

export function outboundPayloadHash(request, options) {
  return createHash('sha256').update(serializedDeepSeekPayload(request, options), 'utf8').digest('hex');
}
