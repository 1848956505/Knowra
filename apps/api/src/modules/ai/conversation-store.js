import { randomUUID } from 'node:crypto';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import schema from './contracts/ai-conversation-v2.schema.json' with { type: 'json' };
import { hashRecord } from './record-contract.js';

export const CONVERSATION_KINDS = Object.freeze({
  aiConversation: { collection: 'conversations', id: 'conversationId' },
  aiConversationTurn: { collection: 'conversationTurns', id: 'turnId' },
  aiConversationMessage: { collection: 'conversationMessages', id: 'messageId' },
  aiConversationToolCall: { collection: 'conversationToolCalls', id: 'callId' }
});
const collections = Object.values(CONVERSATION_KINDS).map(item => item.collection);
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addSchema(schema);
const validators = Object.fromEntries(Object.keys(CONVERSATION_KINDS).map(kind => [
  kind, ajv.compile({ $ref: `${schema.$id}#/$defs/${kind}` })
]));
export const emptyConversationState = () => Object.fromEntries(collections.map(name => [name, []]));

export function conversationError(code, message) {
  const error = new Error(message); error.code = code; throw error;
}

export function validateConversationRecord(kind, record) {
  if (!validators[kind]?.(record) || record.kind !== kind) {
    conversationError('AI_RECORD_INVALID', `AI ${kind} 会话记录无效。`);
  }
  if (kind === 'aiConversationTurn' && record.turnId !== record.jobId) {
    conversationError('AI_RECORD_INVALID', '会话轮次与任务 ID 不一致。');
  }
  if (kind === 'aiConversationTurn' && (
    record.status === 'running' !== Boolean(record.leaseExpiresAt)
    || record.status === 'running' && record.leaseGeneration < 1
    || ['succeeded', 'failed', 'cancelled'].includes(record.status) !== (record.phase === 'finished')
    || record.status === 'staged' && record.leaseGeneration !== 0
    || record.status === 'failed' !== Boolean(record.errorCode) && record.status !== 'cancelled'
  )) conversationError('AI_RECORD_INVALID', '任务状态、租约或错误码不一致。');
  if (kind === 'aiConversationMessage' && record.sourceRefs.some(ref => ref.end <= ref.start)) {
    conversationError('AI_RECORD_INVALID', '消息来源区间无效。');
  }
  if (kind === 'aiConversationMessage' && (record.role === 'user'
    ? record.sourceRefs.length || !record.sourceFree || record.provenanceManifestId || record.finishReason
    : record.finishReason !== 'stop' || record.sourceFree === Boolean(record.sourceRefs.length)
      || !record.sourceFree && !record.provenanceManifestId)) {
    conversationError('AI_RECORD_INVALID', '消息角色、终止状态或来源声明无效。');
  }
  if (kind === 'aiConversationToolCall' && (
    record.status === 'requested' && (record.resultJson || record.errorCode || record.sourceRefs.length || record.provenanceManifestId)
    || record.status === 'succeeded' && (!record.resultJson || record.errorCode)
    || record.status === 'failed' && (!record.errorCode || record.resultJson || record.sourceRefs.length || record.provenanceManifestId)
    || record.sourceRefs.some(ref => ref.end <= ref.start)
  )) conversationError('AI_RECORD_INVALID', '工具调用与结果状态不一致。');
  return structuredClone(record);
}

export function validateConversationState(input) {
  const state = structuredClone(input);
  for (const [kind, { collection, id }] of Object.entries(CONVERSATION_KINDS)) {
    if (!Array.isArray(state[collection])) conversationError('AI_RECORD_INVALID', `AI ${collection} 集合无效。`);
    const ids = new Set();
    for (const record of state[collection]) {
      validateConversationRecord(kind, record);
      if (ids.has(record[id])) conversationError('AI_RECORD_DUPLICATE', `AI ${collection} ID 重复。`);
      ids.add(record[id]);
    }
  }
  const conversations = new Map(state.conversations.map(row => [row.conversationId, row]));
  const turns = new Map(state.conversationTurns.map(row => [row.turnId, row]));
  const messages = new Map(state.conversationMessages.map(row => [row.messageId, row]));
  const boundary = (a, b) => ['ownerId', 'datasetId', 'datasetEpoch', 'spaceId']
    .every(key => a[key] === b[key]);
  const ordinals = new Set(), sequences = new Set(), callOrdinals = new Set(), keys = new Set();
  for (const turn of turns.values()) {
    const conversation = conversations.get(turn.conversationId);
    if (!conversation || !boundary(conversation, turn)) conversationError('AI_REFERENCE_INVALID', '会话任务引用无效。');
    const user = messages.get(turn.userMessageId);
    const assistant = turn.assistantMessageId ? messages.get(turn.assistantMessageId) : null;
    if (!user || user.role !== 'user' || user.turnId !== turn.turnId || !boundary(user, turn)
      || turn.assistantMessageId && (!assistant || assistant.role !== 'assistant' || assistant.turnId !== turn.turnId || !boundary(assistant, turn))
      || turn.status === 'succeeded' !== Boolean(assistant)
      || assistant && assistant.sequence <= user.sequence
      || turn.inputHash !== hashRecord({ conversationId: turn.conversationId, content: user.content,
        requestedPolicyId: turn.requestedPolicyId })) {
      conversationError('AI_REFERENCE_INVALID', '任务消息引用或终态不一致。');
    }
    const ordinalKey = `${turn.conversationId}:${turn.ordinal}`;
    const requestKey = `${turn.ownerId}:${turn.datasetId}:${turn.datasetEpoch}:${turn.spaceId}:${turn.idempotencyKey}`;
    if (ordinals.has(ordinalKey) || keys.has(requestKey)) conversationError('AI_RECORD_DUPLICATE', '会话任务序号或请求键重复。');
    ordinals.add(ordinalKey); keys.add(requestKey);
  }
  for (const message of messages.values()) {
    const conversation = conversations.get(message.conversationId), turn = turns.get(message.turnId);
    if (!conversation || !turn || turn.conversationId !== message.conversationId
      || !boundary(message, conversation) || !boundary(message, turn)
      || message.role === 'user' && turn.userMessageId !== message.messageId
      || message.role === 'assistant' && turn.assistantMessageId !== message.messageId) {
      conversationError('AI_REFERENCE_INVALID', '消息引用无效。');
    }
    const sequenceKey = `${message.conversationId}:${message.sequence}`;
    if (sequences.has(sequenceKey)) conversationError('AI_RECORD_DUPLICATE', '消息序号重复。');
    sequences.add(sequenceKey);
  }
  for (const call of state.conversationToolCalls) {
    const conversation = conversations.get(call.conversationId), turn = turns.get(call.turnId);
    if (!conversation || !turn || turn.conversationId !== call.conversationId
      || !boundary(call, conversation) || !boundary(call, turn)) conversationError('AI_REFERENCE_INVALID', '工具调用引用无效。');
    const key = `${call.turnId}:${call.ordinal}`;
    if (callOrdinals.has(key)) conversationError('AI_RECORD_DUPLICATE', '工具调用序号重复。');
    callOrdinals.add(key);
  }
  for (const conversation of conversations.values()) {
    const turnOrdinals = state.conversationTurns.filter(row => row.conversationId === conversation.conversationId)
      .map(row => row.ordinal).sort((a, b) => a - b);
    const messageSequences = state.conversationMessages.filter(row => row.conversationId === conversation.conversationId)
      .map(row => row.sequence).sort((a, b) => a - b);
    if (turnOrdinals.some((value, index) => value !== index + 1)
      || messageSequences.some((value, index) => value !== index + 1)) {
      conversationError('AI_REFERENCE_INVALID', '会话序号不连续。');
    }
  }
  for (const turn of turns.values()) {
    const ordinals = state.conversationToolCalls.filter(row => row.turnId === turn.turnId)
      .map(row => row.ordinal).sort((a, b) => a - b);
    if (ordinals.some((value, index) => value !== index + 1)) conversationError('AI_REFERENCE_INVALID', '工具调用序号不连续。');
  }
  return state;
}

/** 每次修改在私有存储事务中完成；适配器负责跨进程并发串行化。 */
export function createAiConversationStore(adapter, { now = () => new Date() } = {}) {
  const stamp = () => now().toISOString();
  const read = () => adapter.read();
  const write = action => adapter.write((state, identity) => {
    const result = action(state, identity);
    validateConversationState(state);
    return result;
  });
  const current = (record, identity) => record.datasetId === identity.datasetId
    && record.datasetEpoch === identity.datasetEpoch;
  const mustTurn = (state, turnId) => state.conversationTurns.find(row => row.turnId === turnId)
    ?? conversationError('AI_TURN_NOT_FOUND', '会话任务不存在。');
  const lease = (turn, identity, generation) => {
    if (!current(turn, identity) || turn.status !== 'running' || turn.leaseGeneration !== generation
      || Date.parse(turn.leaseExpiresAt) <= now().getTime()) {
      conversationError('AI_LEASE_STALE', '任务执行权已失效。');
    }
  };
  return {
    identity: () => adapter.identity(),
    async listConversations(filter) {
      const state = await read();
      return state.conversations.filter(row => Object.entries(filter).every(([key, value]) => row[key] === value));
    },
    async getConversation(id) { return (await read()).conversations.find(row => row.conversationId === id) ?? null; },
    async getTurn(id) { return (await read()).conversationTurns.find(row => row.turnId === id) ?? null; },
    async listTurns(conversationId) { return (await read()).conversationTurns.filter(row => row.conversationId === conversationId).sort((a,b) => a.ordinal-b.ordinal); },
    async listMessages(conversationId, afterSequence = 0, limit = 50) {
      return (await read()).conversationMessages.filter(row => row.conversationId === conversationId && row.sequence > afterSequence)
        .sort((a,b) => a.sequence-b.sequence).slice(0, limit);
    },
    async listToolCalls(turnId) { return (await read()).conversationToolCalls.filter(row => row.turnId === turnId).sort((a,b) => a.ordinal-b.ordinal); },
    async createConversation({ ownerId, spaceId, actorId, conversationId = randomUUID() }) {
      return write((state, identity) => {
        const existing = state.conversations.find(row => row.conversationId === conversationId);
        if (existing) {
          if (existing.ownerId === ownerId && existing.spaceId === spaceId && current(existing, identity)) return existing;
          conversationError('AI_IDEMPOTENCY_CONFLICT', '会话 ID 已被其他请求使用。');
        }
        const time = stamp();
        const record = validateConversationRecord('aiConversation', { kind: 'aiConversation', contractVersion: 2,
          ownerId, ...identity, spaceId, actorId, conversationId, createdAt: time, updatedAt: time, archivedAt: null });
        state.conversations.push(record); return record;
      });
    },
    async submitTurn({ ownerId, conversationId, content, idempotencyKey, requestedPolicyId = null }) {
      return write((state, identity) => {
        const conversation = state.conversations.find(row => row.conversationId === conversationId);
        if (!conversation || conversation.ownerId !== ownerId) conversationError('AI_CONVERSATION_NOT_FOUND', '会话不存在。');
        if (!current(conversation, identity) || conversation.archivedAt) conversationError('AI_DATASET_STALE', '会话资料集已切换或已归档。');
        if (typeof content !== 'string' || !content.trim() || content.length > 120000
          || !/^[a-zA-Z0-9-]{8,80}$/.test(idempotencyKey)
          || requestedPolicyId !== null && (typeof requestedPolicyId !== 'string' || !requestedPolicyId || requestedPolicyId.length > 128)) {
          conversationError('AI_REQUEST_INVALID', '消息或请求键无效。');
        }
        const inputHash = hashRecord({ conversationId, content, requestedPolicyId });
        const prior = state.conversationTurns.find(row => row.ownerId === ownerId && current(row, identity)
          && row.spaceId === conversation.spaceId && row.idempotencyKey === idempotencyKey);
        if (prior) {
          if (prior.inputHash !== inputHash) conversationError('AI_IDEMPOTENCY_CONFLICT', '同一请求键的消息内容不一致。');
          return prior;
        }
        if (state.conversationTurns.some(row => row.conversationId === conversationId
          && ['staged', 'running', 'interrupted'].includes(row.status))) {
          conversationError('AI_TURN_ACTIVE', '请先完成或取消上一轮任务。');
        }
        const time = stamp(), turnId = randomUUID(), messageId = randomUUID();
        const common = { contractVersion: 2, ownerId, datasetId: conversation.datasetId,
          datasetEpoch: conversation.datasetEpoch, spaceId: conversation.spaceId, conversationId };
        const sequence = Math.max(0, ...state.conversationMessages.filter(row => row.conversationId === conversationId).map(row => row.sequence)) + 1;
        const message = validateConversationRecord('aiConversationMessage', { ...common, kind: 'aiConversationMessage',
          messageId, turnId, sequence, role: 'user', content, sourceRefs: [], provenanceManifestId: null,
          sourceFree: true, finishReason: null, createdAt: time });
        const turn = validateConversationRecord('aiConversationTurn', { ...common, kind: 'aiConversationTurn',
          turnId, jobId: turnId, ordinal: Math.max(0, ...state.conversationTurns.filter(row => row.conversationId === conversationId).map(row => row.ordinal)) + 1,
          idempotencyKey, inputHash, userMessageId: messageId, assistantMessageId: null, requestedPolicyId,
          status: 'staged', phase: 'waiting', leaseGeneration: 0, leaseExpiresAt: null, errorCode: null,
          createdAt: time, updatedAt: time });
        state.conversationMessages.push(message); state.conversationTurns.push(turn);
        conversation.updatedAt = time;
        return turn;
      });
    },
    async claimTurn(turnId, leaseMs = 60_000) {
      return write((state, identity) => {
        const turn = mustTurn(state, turnId);
        if (!current(turn, identity) || !['staged', 'interrupted'].includes(turn.status)) conversationError('AI_TURN_CONFLICT', '任务不可领取。');
        if (!Number.isSafeInteger(leaseMs) || leaseMs < 1000 || leaseMs > 300000) conversationError('AI_REQUEST_INVALID', '执行租期无效。');
        turn.status = 'running'; turn.leaseGeneration += 1;
        turn.leaseExpiresAt = new Date(now().getTime() + leaseMs).toISOString(); turn.updatedAt = stamp();
        return turn;
      });
    },
    async setPhase(turnId, generation, phase) {
      return write((state, identity) => {
        const turn = mustTurn(state, turnId); lease(turn, identity, generation);
        if (!['retrieving', 'generating', 'validating'].includes(phase)) conversationError('AI_REQUEST_INVALID', '任务阶段无效。');
        turn.phase = phase; turn.updatedAt = stamp(); return turn;
      });
    },
    async appendToolCall(turnId, generation, { callId, toolName, argumentsJson }) {
      return write((state, identity) => {
        const turn = mustTurn(state, turnId); lease(turn, identity, generation);
        const existing = state.conversationToolCalls.find(row => row.callId === callId);
        if (existing) {
          if (existing.turnId === turnId && existing.toolName === toolName && hashRecord(existing.argumentsJson) === hashRecord(argumentsJson)) return existing;
          conversationError('AI_IDEMPOTENCY_CONFLICT', '工具调用 ID 已被其他请求使用。');
        }
        const time = stamp();
        const record = validateConversationRecord('aiConversationToolCall', { kind: 'aiConversationToolCall',
          contractVersion: 2, ownerId: turn.ownerId, datasetId: turn.datasetId, datasetEpoch: turn.datasetEpoch,
          spaceId: turn.spaceId, conversationId: turn.conversationId, turnId, callId,
          ordinal: Math.max(0, ...state.conversationToolCalls.filter(row => row.turnId === turnId).map(row => row.ordinal)) + 1,
          toolName, argumentsJson, resultJson: null, provenanceManifestId: null,
          status: 'requested', sourceRefs: [], errorCode: null,
          createdAt: time, updatedAt: time });
        state.conversationToolCalls.push(record); return record;
      });
    },
    async settleToolCall(turnId, generation, callId, { resultJson = null, sourceRefs = [], errorCode = null }) {
      return write((state, identity) => {
        const turn = mustTurn(state, turnId); lease(turn, identity, generation);
        const call = state.conversationToolCalls.find(row => row.callId === callId && row.turnId === turnId);
        if (!call || call.status !== 'requested') conversationError('AI_TOOL_CONFLICT', '工具调用不可结算。');
        if ((resultJson === null) === (errorCode === null)) conversationError('AI_REQUEST_INVALID', '工具结果或错误码无效。');
        call.resultJson = resultJson; call.sourceRefs = sourceRefs; call.errorCode = errorCode;
        call.status = errorCode ? 'failed' : 'succeeded'; call.updatedAt = stamp();
        validateConversationRecord('aiConversationToolCall', call); return call;
      });
    },
    async bindToolResultManifest(turnId, generation, callId, manifestId) {
      return write((state, identity) => {
        const turn = mustTurn(state, turnId); lease(turn, identity, generation);
        const call = state.conversationToolCalls.find(row => row.callId === callId && row.turnId === turnId);
        if (!call || call.status !== 'succeeded' || !call.sourceRefs.length) {
          conversationError('AI_TOOL_CONFLICT', '工具结果没有待发送的来源。');
        }
        if (typeof manifestId !== 'string' || !manifestId || manifestId.length > 128) {
          conversationError('AI_REQUEST_INVALID', '发送清单 ID 无效。');
        }
        if (call.provenanceManifestId && call.provenanceManifestId !== manifestId) {
          conversationError('AI_IDEMPOTENCY_CONFLICT', '工具结果已绑定其他发送清单。');
        }
        call.provenanceManifestId = manifestId; call.updatedAt = stamp(); return call;
      });
    },
    async completeTurn(turnId, generation, { content, sourceRefs = [], provenanceManifestId = null, sourceFree = false,
      finishReason = 'stop' }) {
      return write((state, identity) => {
        const turn = mustTurn(state, turnId); lease(turn, identity, generation);
        if (state.conversationToolCalls.some(row => row.turnId === turnId && row.status === 'requested')) {
          conversationError('AI_TOOL_CONFLICT', '仍有未结算的工具调用。');
        }
        if (!sourceFree && (!sourceRefs.length || !provenanceManifestId)
          || sourceFree && (sourceRefs.length || provenanceManifestId)) {
          conversationError('AI_SOURCE_REQUIRED', '回答来源与发送清单不匹配。');
        }
        const time = stamp(), messageId = randomUUID();
        const sequence = Math.max(0, ...state.conversationMessages.filter(row => row.conversationId === turn.conversationId).map(row => row.sequence)) + 1;
        const message = validateConversationRecord('aiConversationMessage', { kind: 'aiConversationMessage',
          contractVersion: 2, ownerId: turn.ownerId, datasetId: turn.datasetId, datasetEpoch: turn.datasetEpoch,
          spaceId: turn.spaceId, conversationId: turn.conversationId, turnId, messageId, sequence, role: 'assistant',
          content, sourceRefs, provenanceManifestId, sourceFree, finishReason, createdAt: time });
        state.conversationMessages.push(message); turn.assistantMessageId = messageId;
        turn.status = 'succeeded'; turn.phase = 'finished'; turn.leaseExpiresAt = null; turn.updatedAt = time;
        state.conversations.find(row => row.conversationId === turn.conversationId).updatedAt = time;
        return { turn, message };
      });
    },
    async failTurn(turnId, generation, errorCode) {
      return write((state, identity) => {
        const turn = mustTurn(state, turnId); lease(turn, identity, generation);
        turn.status = 'failed'; turn.phase = 'finished'; turn.leaseExpiresAt = null;
        turn.errorCode = errorCode; turn.updatedAt = stamp();
        validateConversationRecord('aiConversationTurn', turn); return turn;
      });
    },
    async cancelTurn(turnId) {
      return write((state, identity) => {
        const turn = mustTurn(state, turnId);
        if (!current(turn, identity)) conversationError('AI_DATASET_STALE', '历史任务不可操作。');
        if (['succeeded', 'failed', 'cancelled'].includes(turn.status)) return turn;
        turn.status = 'cancelled'; turn.phase = 'finished'; turn.leaseExpiresAt = null;
        turn.errorCode = 'AI_CANCELLED'; turn.updatedAt = stamp(); return turn;
      });
    },
    async recoverInterrupted() {
      return write((state, identity) => {
        const recovered = [];
        for (const turn of state.conversationTurns) {
          if (current(turn, identity) && turn.status === 'running' && Date.parse(turn.leaseExpiresAt) <= now().getTime()) {
            turn.status = 'interrupted'; turn.leaseExpiresAt = null; turn.updatedAt = stamp(); recovered.push(turn.turnId);
          }
        }
        return recovered;
      });
    }
  };
}

export function createJsonAiConversationStore({ getState, runTransaction, onChange }, options) {
  const read = () => validateConversationState(getState());
  const signature = () => JSON.stringify(Object.fromEntries(Object.values(CONVERSATION_KINDS)
    .map(({ collection }) => [collection, getState()[collection]])));
  return createAiConversationStore({
    identity: () => ({ datasetId: getState().datasetId, datasetEpoch: getState().datasetEpoch }),
    read,
    write: action => runTransaction(() => {
      const before = signature();
      const result = action(getState(), { datasetId: getState().datasetId, datasetEpoch: getState().datasetEpoch });
      if (signature() !== before) onChange();
      return structuredClone(result);
    })
  }, options);
}
