import { AiGatewayError } from '../../gateway.js';

/** 可重复的离线适配器：每次调用消耗一个脚本步骤，不接触网络或密钥。 */
export function createMockAiAdapter({ steps = [] } = {}) {
  const pending = [...steps];
  const calls = [];
  return {
    provider: 'mock',
    calls,
    capabilities: () => ({ provider: 'mock', protocol: 'scripted', advertised: {
      text: true, streaming: true, toolCalls: true, jsonObject: true, cancel: true, usage: true
    }, verified: true }),
    async complete(request) {
      calls.push({ format: request.format, messages: request.messages, tools: request.tools });
      const step = take();
      if (step.error) throw new AiGatewayError(step.error, '模拟供应商失败。', { retryable: Boolean(step.retryable) });
      return step.response;
    },
    async *stream(request) {
      calls.push({ format: request.format, messages: request.messages, tools: request.tools });
      const step = take();
      if (step.error) throw new AiGatewayError(step.error, '模拟供应商失败。', { retryable: Boolean(step.retryable) });
      for (const content of step.deltas ?? []) {
        if (request.signal?.aborted) throw new AiGatewayError('AI_CANCELLED', '模型请求已取消。');
        yield { type: 'delta', content };
      }
      if (step.response) yield { type: 'result', result: step.response };
    }
  };

  function take() {
    const step = pending.shift();
    if (!step) throw new AiGatewayError('AI_MOCK_EXHAUSTED', '模拟响应已用尽。');
    return step;
  }
}
