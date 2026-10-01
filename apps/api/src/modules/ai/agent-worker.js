import { toolsForWriteIntent } from './note-write-intent.js';
import { randomUUID } from 'node:crypto';
import { calculateContentHash } from '../knowledge/domain/note-version.js';
import { beijingDay } from './budget-ledger.js';
import { quoteWorstCase } from './worker.js';
import { hashRecord } from './record-contract.js';
import { createAuthorizedRetrieval } from './retrieval.js';

const MAX_ROUNDS = 4;
const MAX_TOOLS = 6;
const MAX_ATTEMPTS = 8;
const MAX_RUN_MS = 10 * 60_000;
const fail = (code, message) => { const error = new Error(message); error.code = code; throw error; };
const safeCode = value => typeof value === 'string' && /^AI_[A-Z0-9_]{1,64}$/.test(value)
  ? value : 'AI_TASK_FAILED';
const refRange = ref => ({ noteId: ref.noteId, start: ref.start, end: ref.end });
const uniqueRefs = refs => [...new Map(refs.map(ref => [hashRecord(ref), ref])).values()];
const boundary = (content, position) => position <= 0 || position >= content.length
  || !(content.charCodeAt(position - 1) >= 0xD800 && content.charCodeAt(position - 1) <= 0xDBFF
    && content.charCodeAt(position) >= 0xDC00 && content.charCodeAt(position) <= 0xDFFF);

const TOOLS = Object.freeze([
  { name: 'notes_search', description: '检索当前授权笔记中的相关片段；索引无可用结果时使用关键词，可更换关键词再次搜索。',
    parameters: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 5 } },
      required: ['query'], additionalProperties: false } },
  { name: 'notes_read', description: '读取当前授权笔记的一个片段，最多 1000 个 UTF-16 单位；只能使用搜索所得或用户明确提供的笔记 ID。',
    parameters: { type: 'object', properties: { noteId: { type: 'string' }, start: { type: 'integer', minimum: 0 },
      end: { type: 'integer', minimum: 1 } }, required: ['noteId'], additionalProperties: false } }
]);

/** R04 只读 Agent：供应商网络调用由现有隔离 adapter 执行，宿主仅处理授权、持久任务和预算。 */
export function createAiAgentWorker({ store, access, modelSettings, budget, gateway, priceProfile,
  allowExternal = false, authorizeAttempt = () => {}, revokeAttempt = () => {},
  accountRef = 'deepseek-primary', now = () => new Date(), logger = console,
  retrievalCandidates = null, actions = null } = {}) {
  if (!store || !modelSettings || !budget || !gateway || !priceProfile) {
    throw new TypeError('AI Agent needs conversation store, model settings, budget and gateway');
  }
  const active = new Map();
  let closed = false;
  const search = access ? createAuthorizedRetrieval({ access, candidateSource: retrievalCandidates }) : null;
  const provider = gateway.capabilities?.().provider;

  async function currentTurn(turnId, generation, signal) {
    const turn = await store.getTurn(turnId);
    if (signal?.aborted || !turn || turn.status !== 'running' || turn.leaseGeneration !== generation
      || Date.parse(turn.leaseExpiresAt) <= now().getTime()) fail('AI_CANCELLED', '任务已取消或租约失效。');
    return turn;
  }

  async function settleOnFailure(attemptId, reserved, sent, error) {
    if (!reserved) return;
    const disposition = sent ? 'unknown' : 'released';
    try { await budget.settle({ accountRef, attemptId, disposition }); }
    catch (fault) { logger.warn?.('Agent budget settlement deferred', { code: safeCode(fault?.code) }); return; }
    try { await store.advanceModelAttempt(attemptId, disposition, { errorCode: safeCode(error?.code) }); }
    catch (fault) { logger.warn?.('Agent attempt settlement deferred', { code: safeCode(fault?.code) }); }
  }

  async function paidCall(turn, generation, request, manifest, grantId, credentialRef, signal) {
    if (provider !== 'mock' && !allowExternal) fail('AI_EGRESS_NOT_READY', '当前运行端未启用模型外发。');
    if ((await store.listModelAttempts(turn.turnId)).length >= MAX_ATTEMPTS) fail('AI_ATTEMPT_LIMIT', '模型调用次数已达到上限。');
    const quote = quoteWorstCase({ request, priceProfile, now: now(), writeToolName: turn.writeIntent?.toolName ?? null });
    if (manifest && manifest.payloadHash !== quote.payloadHash) fail('AI_PAYLOAD_STALE', '实际请求与发送清单不一致。');
    const attemptId = randomUUID(), day = beijingDay(now());
    await store.createModelAttempt(turn.turnId, generation, { attemptId, modelId: request.modelId,
      payloadHash: quote.payloadHash, manifestId: manifest?.manifestId ?? null,
      grantId: grantId ?? null, reservedMicrounits: quote.reservedMicrounits });
    let reserved = false, sent = false, settled = false;
    try {
      const reservation = await budget.reserve({ accountRef, jobId: turn.turnId, attemptId,
        priceVersion: priceProfile.version, reservedMicrounits: quote.reservedMicrounits, day });
      reserved = true;
      if (reservation?.accountRef !== accountRef || reservation.jobId !== turn.turnId
        || reservation.attemptId !== attemptId || reservation.priceVersion !== priceProfile.version
        || reservation.day !== day || reservation.reservedMicrounits !== quote.reservedMicrounits) {
        fail('AI_BUDGET_INVALID', '预算回执与模型尝试不一致。');
      }
      await store.advanceModelAttempt(attemptId, 'reserved', { generation });
      await currentTurn(turn.turnId, generation, signal);
      if (beijingDay(now()) !== day) fail('AI_BUDGET_DAY_CHANGED', '预算日期已切换。');
      if (manifest) await access.assertRequest({ grantId, manifestId: manifest.manifestId, request, recipient: 'deepseek' });
      quoteWorstCase({ request, priceProfile, now: now(), writeToolName: turn.writeIntent?.toolName ?? null });
      await store.advanceModelAttempt(attemptId, 'sent', { generation });
      sent = true;
      authorizeAttempt(attemptId);
      const result = await gateway.complete({ ...request, credentialRef, signal, budgetAttemptId: attemptId });
      const usage = result.usage;
      const actual = usage?.unknown === false && Number.isSafeInteger(usage.inputTokens) && usage.inputTokens >= 0
        && Number.isSafeInteger(usage.outputTokens) && usage.outputTokens >= 0
        ? Math.ceil((usage.inputTokens * priceProfile.inputMicrounitsPerMillion
          + usage.outputTokens * priceProfile.outputMicrounitsPerMillion) / 1_000_000) : null;
      if (actual !== null && (actual > quote.reservedMicrounits || usage.inputTokens > 100_000
        || usage.outputTokens > 20_000)) fail('AI_USAGE_LIMIT', '模型用量超过预留或单次上限。');
      const disposition = actual === null ? 'unknown' : 'settled';
      await budget.settle({ accountRef, attemptId, disposition, actualMicrounits: actual });
      settled = true;
      await store.advanceModelAttempt(attemptId, disposition, { actualMicrounits: actual });
      await currentTurn(turn.turnId, generation, signal);
      return result;
    } catch (error) {
      if (!settled) await settleOnFailure(attemptId, reserved, sent, error);
      throw error;
    } finally { revokeAttempt(attemptId); }
  }

  async function historyFor(turn) {
    const messages = await store.listMessages(turn.conversationId, 0, 100_000);
    const current = messages.find(row => row.messageId === turn.userMessageId);
    if (!current) fail('AI_INPUT_INVALID', '当前提问未找到。');
    const prior = messages.filter(item => item.sequence < current.sequence);
    return prior.slice(-12);
  }

  function plainHistory(prior) {
    const safe = prior.filter(row => row.sourceFree && row.sourceRefs.length === 0 && row.content.length <= 4000);
    return safe.slice(-8).map(row => ({ role: row.role, content: row.content }));
  }

  function authorizedHistory(prior) {
    const entries = [], plainContext = [];
    for (const row of prior.slice(-8)) {
      if (row.role === 'assistant' && !row.provenanceManifestId) {
        if (row.sourceFree && !row.sourceRefs.length) plainContext.push(`助手：${row.content.slice(0, 500)}`);
        continue;
      }
      if (row.role === 'user' && !row.provenanceManifestId) {
        // 用户消息可以由 R02 验证为无来源历史。
      }
      if (row.content.length > 12000) continue;
      const item = { role: row.role, content: row.content, sourceRefs: row.sourceRefs,
        sourceFree: row.sourceFree, provenanceManifestId: row.provenanceManifestId };
      item.provenanceHash = hashRecord({ role: item.role, content: item.content,
        sourceRefs: item.sourceRefs, sourceFree: item.sourceFree,
        provenanceManifestId: item.provenanceManifestId });
      entries.push(item);
    }
    return { entries, plainContext: plainContext.slice(-4).join('\n').slice(0, 1600) };
  }

  async function readTool(grantId, args) {
    if (!args || Object.keys(args).some(key => !['noteId', 'start', 'end'].includes(key))
      || typeof args.noteId !== 'string' || !args.noteId || args.noteId.length > 128) {
      fail('AI_TOOL_ARGUMENTS_INVALID', '阅读参数无效。');
    }
    const { note, version, contentHash } = await access.verifyRead({ grantId, noteId: args.noteId });
    const content = version.content;
    const start = args.start ?? 0, requestedEnd = args.end ?? start + 1000;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start < 0
      || requestedEnd <= start || start >= content.length || !boundary(content, start)) {
      fail('AI_TOOL_ARGUMENTS_INVALID', '阅读范围无效。');
    }
    let end = Math.min(requestedEnd, start + 1000, content.length);
    while (!boundary(content, end)) end--;
    if (end <= start) fail('AI_TOOL_ARGUMENTS_INVALID', '阅读范围无效。');
    const text = content.slice(start, end);
    const ref = { noteId: note.id, noteVersionId: version.id, contentHash,
      start, end, quoteHash: calculateContentHash(text) };
    return { resultJson: { noteId: note.id, title: note.title, text }, sourceRefs: [ref] };
  }

  async function executeTool(turn, generation, grantId, call, signal) {
    await currentTurn(turn.turnId, generation, signal);
    const writeCall = turn.writeIntent && call.name === turn.writeIntent.toolName;
    if (!writeCall && (!grantId || !access)) fail('AI_SCOPE_FORBIDDEN', '当前会话没有笔记读取授权。');
    if (typeof call.id !== 'string' || !call.id || call.id.length > 128) fail('AI_TOOL_INVALID', '模型工具调用 ID 无效。');
    const callId = hashRecord({ turnId: turn.turnId, providerCallId: call.id });
    await store.appendToolCall(turn.turnId, generation, { callId,
      toolName: call.name, argumentsJson: call.arguments });
    try {
      let outcome;
      if (writeCall) {
        if (grantId && turn.writeIntent.noteId) await access.verifyRead({ grantId, noteId: turn.writeIntent.noteId });
        if (!actions) fail('AI_ACTION_UNAVAILABLE', '写入计划服务不可用。');
        const action = await actions.planForTurn(turn, turn.writeIntent, call);
        outcome = { resultJson: { actionId: action.actionId, planHash: action.plan.planHash, status: action.status }, sourceRefs: [] };
      } else if (call.name === 'notes_search') {
        const args = call.arguments;
        if (!args || Object.keys(args).some(key => !['query', 'limit'].includes(key))) {
          fail('AI_TOOL_ARGUMENTS_INVALID', '检索参数无效。');
        }
        const found = await search.search({ grantId, query: args.query, limit: args.limit ?? 5 });
        outcome = { resultJson: { hits: found.hits.map(hit => ({ noteId: hit.noteId, title: hit.title,
          ref: hit.ref, text: hit.text })), inspected: found.inspected, truncated: found.truncated,
          mode: found.mode, ...(found.fallbackReason ? { fallbackReason: found.fallbackReason } : {}) },
        sourceRefs: found.hits.map(hit => hit.ref) };
      } else if (call.name === 'notes_read') outcome = await readTool(grantId, call.arguments);
      else fail('AI_TOOL_INVALID', '模型请求了未开放的工具。');
      await currentTurn(turn.turnId, generation, signal);
      await store.settleToolCall(turn.turnId, generation, callId, outcome);
      return { sourceRefs: outcome.sourceRefs,
        truncated: outcome.resultJson?.truncated === true,
        fallback: outcome.resultJson?.mode === 'keyword_fallback',
        inspected: outcome.resultJson?.inspected ?? 0, actionId: outcome.resultJson?.actionId };
    } catch (error) {
      await store.settleToolCall(turn.turnId, generation, callId,
        { errorCode: safeCode(error?.code) }).catch(() => undefined);
      if (['AI_TOOL_ARGUMENTS_INVALID', 'AI_SEARCH_INVALID', 'AI_SCOPE_FORBIDDEN'].includes(error?.code)) {
        return { sourceRefs: [], truncated: false, fallback: false, inspected: 0 };
      }
      throw error;
    }
  }

  function citedResult(result, request, manifest) {
    const payload = result.json;
    if (!payload || typeof payload.answer !== 'string' || !payload.answer.trim()
      || payload.answer.length > 120000 || !Array.isArray(payload.citations) || payload.citations.length > 32) {
      fail('AI_OUTPUT_INVALID', '模型回答结构无效。');
    }
    const sources = JSON.parse(request.messages.at(-1).content).sources;
    const citations = [];
    for (const item of payload.citations) {
      if (!item || !/^S\d{1,3}$/.test(item.sourceId) || typeof item.quote !== 'string' || !item.quote
        || item.quote.length > 1000) fail('AI_CITATION_INVALID', '模型引用格式无效。');
      const source = sources[Number(item.sourceId.slice(1)) - 1];
      const offset = source?.text.indexOf(item.quote) ?? -1;
      if (!source || offset < 0) fail('AI_CITATION_INVALID', '模型引用不在已发送的来源中。');
      citations.push({ noteId: source.noteId, noteVersionId: source.noteVersionId,
        contentHash: source.contentHash, start: source.start + offset,
        end: source.start + offset + item.quote.length, quoteHash: calculateContentHash(item.quote) });
    }
    const sourceRefs = uniqueRefs([...manifest.sources, ...manifest.historySources]);
    return { content: payload.answer.trim(), sourceRefs, citations,
      provenanceManifestId: manifest.manifestId, sourceFree: sourceRefs.length === 0 };
  }

  async function runClaimed(turn, signal) {
    const generation = turn.leaseGeneration;
    const conversation = await store.getConversation(turn.conversationId);
    if (!conversation || conversation.ownerId !== turn.ownerId) fail('AI_CONVERSATION_NOT_FOUND', '会话不存在。');
    const user = (await store.listMessages(turn.conversationId, 0, 100_000)).find(row => row.messageId === turn.userMessageId);
    if (!user || user.content.length > 4000) fail('AI_INPUT_TOO_LARGE', '单次提问不能超过 4000 字符。');
    const reference = await modelSettings.credentialReference();
    if (!reference || reference.modelId !== priceProfile.modelId) fail('AI_NOT_CONFIGURED', '请先配置已核价的 deepseek-flash 模型。');
    if (provider !== 'mock' && !allowExternal) fail('AI_GENERATION_UNAVAILABLE', '当前运行端未启用模型外发。');
    const prior = await historyFor(turn);
    const grant = turn.requestedPolicyId
      ? await access?.createRunGrant({ policyId: turn.requestedPolicyId, conversationId: turn.conversationId }) : null;
    if (turn.writeIntent && !actions) fail('AI_ACTION_UNAVAILABLE', '当前写入计划服务不可用。');
    if (turn.writeIntent?.noteId) {
      if (!grant) fail('AI_SCOPE_FORBIDDEN', '已有笔记写入需要读取授权。');
      await access.verifyRead({ grantId: grant.grantId, noteId: turn.writeIntent.noteId });
    }
    if (turn.requestedPolicyId && !grant) fail('AI_ACCESS_REVOKED', '读取授权不可用。');
    const { entries: history, plainContext } = grant ? authorizedHistory(prior) : { entries: [], plainContext: '' };
    for (const call of await store.listToolCalls(turn.turnId)) {
      if (call.status === 'requested') {
        await store.settleToolCall(turn.turnId, generation, call.callId,
          { errorCode: 'AI_DELIVERY_UNCERTAIN' });
      }
    }
    let sourceRefs = grant ? uniqueRefs(prior.filter(row => row.role === 'assistant')
      .flatMap(row => row.citations?.length ? row.citations : row.sourceRefs)).slice(-8) : [];
    let searchTruncated = false;
    let searchFallback = false;
    if (grant && /(我的|我记|笔记|资料|文档|记录|之前|根据|比较|总结|引用)/.test(user.content)) {
      const callId = hashRecord({ turnId: turn.turnId, generation, initialSearch: true });
      await store.appendToolCall(turn.turnId, generation, { callId, toolName: 'notes_search',
        argumentsJson: { query: user.content, limit: 3, origin: 'automatic' } });
      try {
        const initial = await search.search({ grantId: grant.grantId, query: user.content, limit: 3 });
        await currentTurn(turn.turnId, generation, signal);
        await store.settleToolCall(turn.turnId, generation, callId, { resultJson: {
          hits: initial.hits.map(hit => ({ noteId: hit.noteId, title: hit.title, ref: hit.ref, text: hit.text })),
          inspected: initial.inspected, truncated: initial.truncated, mode: initial.mode,
          ...(initial.fallbackReason ? { fallbackReason: initial.fallbackReason } : {})
        }, sourceRefs: initial.hits.map(hit => hit.ref) });
        sourceRefs = uniqueRefs([...sourceRefs, ...initial.hits.map(hit => hit.ref)]).slice(-12);
        searchTruncated = initial.truncated;
        searchFallback = initial.mode === 'keyword_fallback';
      } catch (error) {
        await store.settleToolCall(turn.turnId, generation, callId,
          { errorCode: safeCode(error?.code) }).catch(() => undefined);
        throw error;
      }
    }
    let totalTools = 0;
    let forceAnswer = false;
    let noProgressRounds = 0;
    for (let round = 0; round < MAX_ROUNDS; round++) {
      await store.renewLease(turn.turnId, generation);
      await store.setPhase(turn.turnId, generation, sourceRefs.length ? 'retrieving' : 'generating');
      let request, manifest = null;
      if (grant) {
        const finalOnly = forceAnswer || round === MAX_ROUNDS - 1 || totalTools >= 4;
        const guidance = round ? finalOnly
            ? '\n工具结果已写入当前 sources。请直接依据这些来源作答；不足之处明确说明。'
            : '\n工具结果已写入当前 sources。若已足够，请直接回答；只有缺少关键来源时才继续搜索或阅读。' : '';
        const coverage = `${searchFallback ? '\n候选索引未提供可用结果，已使用关键词检索；关键词未命中不等于授权资料没有答案。' : ''}${searchTruncated ? '\n检索受到候选数量或单篇长度上限限制，不得声称已检查完整授权范围。' : ''}`;
        const contextRoom = 4000 - user.content.length - guidance.length - coverage.length;
        if (contextRoom < 0) fail('AI_INPUT_TOO_LARGE', '提问与必要的检索说明超过上限。');
        const context = plainContext && contextRoom >= 8
          ? `先前普通聊天：${plainContext}\n`.slice(0, contextRoom) : '';
        const boundedQuestion = `${context}${user.content}${guidance}${coverage}`;
        const prepared = await access.prepareRequest({ grantId: grant.grantId, recipient: 'deepseek',
          modelId: reference.modelId, credentialRef: reference.credentialRef,
          userMessage: boundedQuestion, history, sourceRanges: sourceRefs.map(refRange),
          omissions: [...(sourceRefs.length ? [] : ['no_source_match']), ...(searchTruncated ? ['candidate_cap'] : []),
            ...(searchFallback ? ['retrieval_fallback'] : [])], maxTokens: 1024,
          writeToolName: turn.writeIntent?.toolName ?? null, tools: finalOnly ? [] : [...TOOLS, ...(turn.writeIntent && actions ? toolsForWriteIntent(turn.writeIntent) : [])], format: 'json' });
        request = prepared.request; manifest = prepared.manifest;
        for (const call of await store.listToolCalls(turn.turnId)) {
          if (call.status === 'succeeded' && call.sourceRefs.length && !call.provenanceManifestId
            && call.sourceRefs.every(ref => manifest.sources.some(source => hashRecord(source) === hashRecord(ref)))) {
            await store.bindToolResultManifest(turn.turnId, generation, call.callId, manifest.manifestId);
          }
        }
      } else {
        request = { credentialRef: reference.credentialRef, modelId: reference.modelId,
          messages: [{ role: 'system', content: '你是知境助手。回答普通学习问题，允许追问。此会话没有笔记读取授权；不得声称读过用户资料或编造笔记引用。' },
            ...plainHistory(prior), { role: 'user', content: user.content }], maxTokens: 1024,
          format: 'text', tools: turn.writeIntent && actions ? toolsForWriteIntent(turn.writeIntent) : [] };
        if (turn.writeIntent) request.messages[0].content += '用户已明确请求生成笔记计划，只调用所开放的写入计划工具；不得宣称已保存。';
      }
      const result = await paidCall(turn, generation, request, manifest, grant?.grantId ?? null,
        reference.credentialRef, signal);
      if (result.finishReason === 'tool_calls') {
        if ((!grant && !turn.writeIntent) || !result.toolCalls.length || result.toolCalls.length > 2
          || totalTools + result.toolCalls.length > MAX_TOOLS || round === MAX_ROUNDS - 1) {
          fail('AI_AGENT_LIMIT', '工具轮次达到上限。');
        }
        if (result.toolCalls.some(call => call.name === turn.writeIntent?.toolName) && result.toolCalls.length !== 1) fail('AI_TOOL_INVALID', '一轮只可提出一个明确的写入计划。');
        totalTools += result.toolCalls.length;
        const before = new Set(sourceRefs.map(hashRecord));
        for (const call of result.toolCalls) {
          const outcome = await executeTool(turn, generation, grant?.grantId ?? null, call, signal);
          if (outcome.actionId) {
            await currentTurn(turn.turnId, generation, signal);
            await store.completeTurn(turn.turnId, generation, { content: '已生成笔记计划，尚未写入。请在执行记录中查看差异并确认。', sourceRefs: [], citations: [], provenanceManifestId: null, sourceFree: true });
            return;
          }
          sourceRefs = uniqueRefs([...sourceRefs, ...outcome.sourceRefs]).slice(-12);
          searchTruncated ||= outcome.truncated;
          searchFallback ||= outcome.fallback;
        }
        if (sourceRefs.every(ref => before.has(hashRecord(ref)))) {
          noProgressRounds++;
          forceAnswer = sourceRefs.length > 0 || noProgressRounds >= 2;
        } else noProgressRounds = 0;
        continue;
      }
      if (result.finishReason !== 'stop' || result.truncated || result.refused) {
        fail(result.truncated ? 'AI_OUTPUT_TRUNCATED' : result.refused ? 'AI_PROVIDER_REFUSED' : 'AI_OUTPUT_INVALID',
          '模型未返回完整可用回答。');
      }
      await store.setPhase(turn.turnId, generation, 'validating');
      const answer = grant ? citedResult(result, request, manifest)
        : { content: result.content.trim(), sourceRefs: [], citations: [], provenanceManifestId: null, sourceFree: true };
      if (!answer.content) fail('AI_OUTPUT_INVALID', '模型返回空回答。');
      await currentTurn(turn.turnId, generation, signal);
      await store.completeTurn(turn.turnId, generation, answer);
      return;
    }
    fail('AI_AGENT_LIMIT', '模型轮次达到上限。');
  }

  async function run(turnId) {
    if (closed) fail('AI_GENERATION_UNAVAILABLE', 'AI 执行端已关闭。');
    if (active.has(turnId)) return active.get(turnId).promise;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), MAX_RUN_MS);
    timer.unref?.();
    const promise = (async () => {
      let turn;
      try {
        turn = await store.claimTurn(turnId, 300_000);
        await runClaimed(turn, controller.signal);
      } catch (error) {
        if (turn) await store.failTurn(turnId, turn.leaseGeneration, safeCode(error?.code)).catch(() => undefined);
        throw error;
      } finally { clearTimeout(timer); active.delete(turnId); }
    })();
    active.set(turnId, { controller, promise });
    return promise;
  }

  async function recover() {
    await store.recoverInterrupted();
    const attempts = await store.listModelAttempts();
    const turns = new Map((await store.listTurns()).map(turn => [turn.turnId, turn]));
    let uncertain = 0;
    for (const attempt of attempts) {
      if (!['prepared', 'reserved', 'sent'].includes(attempt.status)) continue;
      const turn = turns.get(attempt.turnId);
      if (!turn || turn.status === 'running' && Date.parse(turn.leaseExpiresAt) > now().getTime()) continue;
      try {
        await budget.settle({ accountRef, attemptId: attempt.attemptId, disposition: 'unknown' });
      } catch (error) {
        if (error.code !== 'AI_BUDGET_NOT_FOUND' && error.code !== 'AI_BUDGET_CONFLICT') {
          logger.warn?.('Agent budget recovery deferred', { code: safeCode(error?.code) });
          continue;
        }
      }
      await store.advanceModelAttempt(attempt.attemptId, 'unknown', { errorCode: 'AI_DELIVERY_UNCERTAIN' }).catch(() => undefined);
      uncertain++;
    }
    return uncertain;
  }

  function cancel(turnId) { active.get(turnId)?.controller.abort(); }
  async function retry(turnId) {
    const previous = active.get(turnId);
    if (previous) {
      previous.controller.abort();
      await previous.promise.catch(() => undefined);
    }
    return run(turnId);
  }
  async function close() {
    closed = true;
    const running = [...active.values()];
    for (const entry of running) entry.controller.abort();
    await Promise.allSettled(running.map(entry => entry.promise));
  }
  return { run, retry, cancel, recover, close };
}
