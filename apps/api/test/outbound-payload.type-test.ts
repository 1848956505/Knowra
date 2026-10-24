import {
  deepSeekPayload,
  serializedDeepSeekPayload,
  outboundPayloadHash,
  type OutboundPayloadRequest,
  type OutboundPayloadTools,
  type OutboundToolWrapper,
  type DeepSeekPayloadOptions,
  type DeepSeekPayload
} from '../src/modules/ai/outbound-payload.ts';
import {
  deepSeekPayload as bridgePayload,
  serializedDeepSeekPayload as bridgeSerialized,
  outboundPayloadHash as bridgeHash
} from '../src/modules/ai/outbound-payload.js';
import { normalizeAiRequest } from '../src/modules/ai/gateway.js';
import { prepareKnowledgeExtractionGateway } from '../src/modules/ai/knowledge-extraction-gateway.js';

declare const unknownValue: unknown;
const request: OutboundPayloadRequest = {
  modelId: unknownValue,
  messages: unknownValue,
  maxTokens: unknownValue,
  format: unknownValue,
  tools: Object.freeze([null, 'opaque', { name: 'tool' }])
};
const payload = deepSeekPayload(request, { stream: undefined });
const minimal = deepSeekPayload({ tools: [] });
const serialized: string = serializedDeepSeekPayload(request);
const hash: string = outboundPayloadHash(request, undefined);
const mutableTools = [{ name: 'notes_read', parameters: {} }];
const readonlyTools: readonly { name: string; parameters: object }[] = mutableTools;
deepSeekPayload({ tools: mutableTools });
deepSeekPayload({ tools: readonlyTools });
deepSeekPayload({ tools: [], modelId: undefined, messages: null, maxTokens: 1n, format: Symbol('opaque') });
const capabilities: OutboundPayloadTools = {
  length: 'truthy',
  map(callback) {
    const wrapped: OutboundToolWrapper = callback(42);
    void wrapped;
    return { opaque: 'custom map result' };
  }
};
deepSeekPayload({ tools: capabilities });
const normalized = normalizeAiRequest({ messages: [{ role: 'user', content: 'synthetic JSON' }], format: 'json' });
deepSeekPayload({ ...normalized, modelId: 'synthetic-model' });
declare const extracted: ReturnType<typeof prepareKnowledgeExtractionGateway>;
serializedDeepSeekPayload({ ...extracted.gatewayRequest, modelId: 'synthetic-model' });
// 两个分支依赖独立 getter 读取，合同不能假定 response_format 与 tools 互斥。
const both: DeepSeekPayload = {
  model: undefined,
  messages: null,
  max_tokens: 0n,
  stream: false,
  thinking: { type: 'disabled' },
  response_format: { type: 'json_object' },
  tools: { opaque: true },
  tool_choice: 'auto',
  stream_options: undefined
};
payload.model = unknownValue;
payload.messages = unknownValue;
payload.max_tokens = unknownValue;
payload.tools = unknownValue;
payload.stream = true;
payload.response_format = undefined;
payload.tool_choice = undefined;
payload.stream_options = { include_usage: true };
void [minimal, serialized, hash, both];
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
export type Request = Assert<
  Equal<
    Parameters<typeof deepSeekPayload>,
    [request: OutboundPayloadRequest, options?: DeepSeekPayloadOptions | undefined]
  >
>;
export type SerialRequest = Assert<
  Equal<Parameters<typeof serializedDeepSeekPayload>, Parameters<typeof deepSeekPayload>>
>;
export type HashRequest = Assert<Equal<Parameters<typeof outboundPayloadHash>, Parameters<typeof deepSeekPayload>>>;
export type Payload = Assert<Equal<ReturnType<typeof deepSeekPayload>, DeepSeekPayload>>;
export type Serialized = Assert<Equal<ReturnType<typeof serializedDeepSeekPayload>, string>>;
export type Hash = Assert<Equal<ReturnType<typeof outboundPayloadHash>, string>>;
export type RequestModel = Assert<Equal<OutboundPayloadRequest['modelId'], unknown>>;
export type RequestMessages = Assert<Equal<OutboundPayloadRequest['messages'], unknown>>;
export type RequestMax = Assert<Equal<OutboundPayloadRequest['maxTokens'], unknown>>;
export type RequestFormat = Assert<Equal<OutboundPayloadRequest['format'], unknown>>;
export type RequestTools = Assert<Equal<OutboundPayloadRequest['tools'], OutboundPayloadTools>>;
export type Length = Assert<Equal<OutboundPayloadTools['length'], unknown>>;
export type MapResult = Assert<Equal<ReturnType<OutboundPayloadTools['map']>, unknown>>;
export type MapArgument = Assert<
  Equal<Parameters<OutboundPayloadTools['map']>, [callback: (tool: unknown) => OutboundToolWrapper]>
>;
export type WrappedTool = Assert<Equal<OutboundToolWrapper['function'], unknown>>;
export type WrappedType = Assert<Equal<OutboundToolWrapper['type'], 'function'>>;
export type Model = Assert<Equal<DeepSeekPayload['model'], unknown>>;
export type Messages = Assert<Equal<DeepSeekPayload['messages'], unknown>>;
export type MaxTokens = Assert<Equal<DeepSeekPayload['max_tokens'], unknown>>;
export type Tools = Assert<Equal<DeepSeekPayload['tools'], unknown>>;
export type Stream = Assert<Equal<DeepSeekPayload['stream'], boolean>>;
export type StreamOption = Assert<Equal<DeepSeekPayloadOptions['stream'], boolean | undefined>>;
export type Thinking = Assert<Equal<DeepSeekPayload['thinking'], { type: 'disabled' }>>;
export type ResponseFormat = Assert<Equal<DeepSeekPayload['response_format'], { type: 'json_object' } | undefined>>;
export type ToolChoice = Assert<Equal<DeepSeekPayload['tool_choice'], 'auto' | undefined>>;
export type Usage = Assert<Equal<DeepSeekPayload['stream_options'], { include_usage: true } | undefined>>;
export type PayloadBridge = Assert<Equal<typeof bridgePayload, typeof deepSeekPayload>>;
export type SerializedBridge = Assert<Equal<typeof bridgeSerialized, typeof serializedDeepSeekPayload>>;
export type HashBridge = Assert<Equal<typeof bridgeHash, typeof outboundPayloadHash>>;
