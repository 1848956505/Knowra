import { toolsForWriteIntent, toolsForAssistant } from './note-write-intent.js';
import { randomUUID } from 'node:crypto';
import { calculateContentHash } from '../knowledge/domain/note-version.js';
import { beijingDay } from './budget-ledger.js';
import { actualCostMicrounits, quoteWorstCase } from './worker.js';
import { hashRecord } from './record-contract.js';
import { createAuthorizedRetrieval } from './retrieval.js';
import { createAiRecoveryScope } from './recovery-scope.js';
import { emptyAgentCheckpoint } from './agent-checkpoint.js';
import { ANNOTATIONS_TOOL, listAnnotatedRanges } from './annotation-read-tool.js';
import { KNOWLEDGE_PROPOSE_TOOL, proposeKnowledge } from './knowledge-propose-tool.js';
import { ASSISTANT_GUIDANCE, WEB_SEARCH_TOOL, createAssistantWebSearch, searchAssistantNotes, requestsAssistantArtifact, requestsKnowledgeProposal, renderExternalSources } from './assistant-tools.js';

const MAX_ROUNDS = 4;
const MAX_TOOLS = 6;
// 仅明确要求提炼知识的回合使用：需要读取多处重点并分批提交候选。预算仍受 20 元日额度与 2 元单任务预留约束。
const PROPOSAL_ROUNDS = 8;
const PROPOSAL_TOOLS = 14;
// 推理模型的推理 token 计入完成量；1024 在真实验收中 5 次里有 3 次在写出回答前被截断。上限只在真正用到时才产生费用。
const MAX_OUTPUT_TOKENS = 4096;
// 提炼知识点回合的行为指引：把“读后提交候选”说清楚，避免模型只在回答里罗列或反复读取同一份重点。
const PROPOSAL_GUIDANCE = '\n这是提炼知识点请求：先用 annotations_list 取得重点（需要时用 notes_read 读上下文）；“已完成”说明会告诉你哪些步骤已成功、重点是否读完；不要用相同参数重复调用同一个工具；重点很多、sources 放不下时分批处理：读一页重点、提交一批候选，再用 offset 翻到下一页。随后调用 knowledge_propose 一次性提交候选，只有调用 knowledge_propose 才算提交，在回答里声称已提交或罗列知识点都无效。每条候选只依据所引原文；引文只需给 noteId 和逐字摘自 sources 的 quote，不要自己数字符偏移。提交成功后用一两句话说明已提交几条待用户审核的候选，不要重复列出内容。';
// 工具结果只以来源片段回到模型，看不到“已成功”。提炼回合另用一句话说明已完成的步骤，避免模型因看不到结果而反复调用、迟迟不提交。
// 说明只能描述“本轮真的会随请求发出的来源”：按当前 sources 窗口（sourceRefs，发送前会逐条重新核验权限与版本）过滤，
// 窗口外（被淘汰）的笔记不再提及；不含笔记标题，避免经说明文字绕过发送清单与授权复核。
// 重点数量可能超过 sources 窗口容量，所以按“批”推进：把重点分成 未读 / 已读待提交（在窗口内或已移出）/ 已提交 三类，
// 先提交窗口内待提交的，再翻页读下一批；只有被已保存候选引文实际覆盖的重点才算已提交，其余仍待处理。
function analyzeProposal(calls, sourceRefs = [], capacity = null) {
  const live = (noteId, start, end) => sourceRefs.some(ref => ref.noteId === noteId && ref.start <= start && end <= ref.end);
  const done = calls.filter(call => call.status === 'succeeded' && call.resultJson && typeof call.resultJson === 'object');
  const notes = new Map();
  const noteOf = id => notes.get(id) ?? notes.set(id, { total: 0, seen: new Map(), handled: new Set(), nextOffset: 0, read: false, listed: false }).get(id);
  let saved = 0; const cited = [];
  for (const call of done) {
    const result = call.resultJson;
    if (call.toolName === 'annotations_list' && typeof result.noteId === 'string' && Number.isSafeInteger(result.total)) {
      const note = noteOf(result.noteId);
      note.total = result.total; note.listed = true;
      (result.annotations ?? []).forEach((item, position) => note.seen.set(item.annotationId, { ...item, index: (Number.isSafeInteger(result.offset) ? result.offset : 0) + position }));
      if (Number.isSafeInteger(result.offset)) note.nextOffset = Math.max(note.nextOffset, result.offset + (result.annotations?.length ?? 0));
    } else if (call.toolName === 'notes_read' && typeof result.noteId === 'string'
      && (call.sourceRefs ?? []).some(ref => ref.noteId === result.noteId && live(ref.noteId, ref.start, ref.end))) noteOf(result.noteId).read = true;
    else if (call.toolName === 'knowledge_propose' && result.saved === true) {
      saved += result.candidates?.length ?? 0;
      for (const range of result.citedRanges ?? []) {
        if (typeof range?.noteId === 'string' && Number.isSafeInteger(range.start) && Number.isSafeInteger(range.end) && range.start < range.end) cited.push(range);
      }
    }
  }
  // 只把“被已保存候选的引文实际覆盖”的重点算作已提交：引文与重点原文相交，且引文不超过重点长度的 3 倍
  // （排除用整篇原文当引文而“顺带覆盖”所有重点的情形）。保存成功本身不代表此前读到的重点都已处理。
  for (const [noteId, note] of notes) {
    for (const item of note.seen.values()) {
      if (cited.some(range => range.noteId === noteId && range.start < item.end && item.start < range.end
        && range.end - range.start <= 3 * (item.end - item.start))) note.handled.add(item.annotationId);
    }
  }
  const steps = []; let needPropose = false, needPage = false, needReread = false;
  for (const [noteId, note] of notes) {
    const inWindow = [...note.seen.values()].filter(item => live(noteId, item.start, item.end));
    const pending = inWindow.filter(item => !note.handled.has(item.annotationId));
    const lost = [...note.seen.values()].filter(item => !live(noteId, item.start, item.end) && !note.handled.has(item.annotationId));
    const dropped = lost.length, lostFrom = Math.min(...lost.map(item => item.index));
    const unread = note.total - note.seen.size;
    if (note.total) {
      if (!inWindow.length && !note.read) continue; // 来源窗口已淘汰该笔记：不再提及，需要时模型可重新读取
      const counts = new Map();
      for (const item of pending) counts.set(item.importance, (counts.get(item.importance) ?? 0) + 1);
      const detail = [...counts].map(([level, count]) => `${level}×${count}`).join('、');
      // 明确“待提交的重点原文就是哪几个 source、各自重要度”：sources 的编号即其在 sourceRefs 中的顺序（与 prepareRequest 一致）。
      const labels = pending.map(item => ({ item, index: sourceRefs.findIndex(ref => ref.noteId === noteId && ref.start === item.start && ref.end === item.end) }))
        .filter(entry => entry.index >= 0).map(entry => `S${entry.index + 1}（${entry.item.importance}）`);
      if (pending.length) needPropose = true;
      if (unread > 0) needPage = true;
      if (dropped > 0) needReread = true;
      steps.push(`annotations_list 已读取一篇笔记 ${note.total} 处重点中的 ${note.seen.size} 处，其中 ${note.handled.size} 处已提交`
        + `${pending.length ? `；${pending.length} 处待提交且原文在当前 sources 中（${detail}），即 ${labels.join('、')}，其余 source 只是上下文` : ''}`
        + `${unread > 0 ? `；还有 ${unread} 处未读，可用 offset=${note.nextOffset} 继续翻页` : ''}`
        + `${dropped > 0 ? `；${dropped} 处已读但原文已移出 sources 且尚未提交（${capacity ? `sources 一次约容纳 ${capacity} 条，` : ''}可从 offset=${lostFrom} 起用 limit=${capacity ? Math.max(1, capacity) : '较小值'} 重新读取）` : ''}`);
    } else if (note.listed && !note.seen.size && sourceRefs.some(ref => ref.noteId === noteId)) steps.push('annotations_list 显示一篇笔记没有可用重点，可读取正文后提炼');
    if (note.read) steps.push('notes_read 已读取一篇笔记的原文片段，已在 sources 中');
  }
  if (saved) steps.push(`knowledge_propose 已保存 ${saved} 条待审核候选（同一陈述不要重复提交）`);
  if (!steps.length) return { text: '', needPropose };
  const batch = needPage ? '；提交后再翻页读取剩余重点，读一批提交一批' : needReread ? '；提交后再用 annotations_list 重新读取被移出的重点，读一批提交一批' : '';
  const next = needPropose ? `sources 放不下全部重点，不必等读完：现在就对上面待提交的重点调用 knowledge_propose${batch}。`
    : needPage ? '先别重复读取已读的页：继续用 annotations_list 翻页读取剩余重点，读到一批就提交一批。'
    : needReread ? '用 annotations_list 按上面给出的 offset 和 limit 重新读取被移出 sources 的重点（读一批提交一批；limit 不要超过 sources 的容量）。'
    : saved ? '重点已全部处理，请用一两句话告知用户。'
    : '这些步骤不要重复；信息已足够时现在调用 knowledge_propose 提交候选。';
  return { text: `\n已完成：${steps.join('；')}。${next}`, needPropose };
}
export const proposalProgress = (calls, sourceRefs = [], capacity = null) => analyzeProposal(calls, sourceRefs, capacity).text;
const MAX_ATTEMPTS = 8;
const MAX_RUN_MS = 10 * 60_000;
const deterministicWriteFailure = code => typeof code === 'string'
  && (/^AI_NOTE_(TOOL_INVALID|TARGET_INVALID|TARGET_CONFLICT|REFERENCE_DENIED|BASELINE_INVALID|ANCHOR_INVALID|PATCH_INVALID|NO_CHANGE|PLAN_LIMIT|TARGET_NOT_READ)$/.test(code)
    || ['AI_REQUEST_INVALID', 'AI_IDEMPOTENCY_CONFLICT', 'AI_DATASET_STALE', 'AI_SCOPE_FORBIDDEN',
      'AI_TOOL_ARGUMENTS_INVALID', 'AI_ACTION_GRANT_REVOKED', 'AI_ACTION_CONFLICT', 'AI_ACTION_EXPIRED',
      'AI_ACTION_PLAN_CHANGED', 'AI_ACTION_SOURCE_INVALID'].includes(code));
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
    parameters: { type: 'object', properties: { query: { type: 'string', maxLength: 300 }, limit: { type: 'integer', minimum: 1, maximum: 5 },
        createdFrom: { type: 'string', description: '按创建时间筛选，开始 ISO 时间；时间查询同时提供 createdBefore，query 可省略。' },
        createdBefore: { type: 'string', description: '不包含的结束 ISO 时间；明确用户时区，不能猜测周起止。' } }, additionalProperties: false } },
  { name: 'notes_read', description: '读取当前授权笔记的一个片段，最多 1000 个 UTF-16 单位；只能使用搜索所得或用户明确提供的笔记 ID。',
    parameters: { type: 'object', properties: { noteId: { type: 'string' }, start: { type: 'integer', minimum: 0 },
      end: { type: 'integer', minimum: 1 } }, required: ['noteId'], additionalProperties: false } }
]);

/** 有界自主助手：读取受授权约束，写工具只生成待审稿，网络仍由隔离 adapter 处理。 */
export function createAiAgentWorker({ store, access, modelSettings, budget, gateway, priceProfile: baseProfile, policy = null,
  allowExternal = false, authorizeAttempt = () => {}, revokeAttempt = () => {},
  accountRef = 'deepseek-primary', now = () => new Date(), logger = console,
  retrievalCandidates = null, actions = null, webSearchAdapter = null, annotations = null, knowledgeProposals = false, knowledgeCommit = null } = {}) {
  const priceProfile = baseProfile; // 外层只用于模型名等不随自定义单价变化的字段
  if (!store || !modelSettings || !budget || !gateway || !priceProfile) {
    throw new TypeError('AI Agent needs conversation store, model settings, budget and gateway');
  }
  const active = new Map();
  let closed = false, priceStaleWarned = false;
  const recovery = createAiRecoveryScope();
  const search = access ? createAuthorizedRetrieval({ access, candidateSource: retrievalCandidates }) : null;
  const provider = gateway.capabilities?.().provider;
  const webSearch = createAssistantWebSearch(webSearchAdapter);
  const proposalNames = new Set(['notes_create', 'notes_append', 'notes_propose_patch', 'notes_propose_organize']);
  const availableTools = (turn, canRead, finalOnly = false, artifactRequested = false, proposalRequested = false) => finalOnly ? [] : [
    ...(canRead ? TOOLS : []), ...(canRead && annotations && !turn.writeIntent ? [ANNOTATIONS_TOOL] : []),
    ...(canRead && proposalRequested ? [KNOWLEDGE_PROPOSE_TOOL] : []), ...(actions ? turn.writeIntent ? toolsForWriteIntent(turn.writeIntent) : artifactRequested ? toolsForAssistant({ canRead }) : [] : []),
    ...(webSearch.enabled ? [WEB_SEARCH_TOOL] : [])];

  async function currentTurn(turnId, generation, signal) {
    const turn = await store.getTurn(turnId);
    if (signal?.aborted || !turn || turn.status !== 'running' || turn.leaseGeneration !== generation
      || Date.parse(turn.leaseExpiresAt) <= now().getTime()) fail('AI_CANCELLED', '任务已取消或租约失效。');
    return turn;
  }

  // 用量明细只含模型名、token 数和对话 ID；结果未知时 token 为空，仍记录这次请求发生过。
  const usageDetail = (turn, request, usage) => ({ modelId: request.modelId, conversationId: turn.conversationId,
    ...(usage?.unknown === false ? { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens,
      cacheHitTokens: usage.cacheHitTokens ?? null } : {}) });

  async function settleOnFailure(attemptId, reserved, sent, error, detail) {
    if (!reserved) return;
    const disposition = sent ? 'unknown' : 'released';
    try { await budget.settle({ accountRef, attemptId, disposition, ...(sent ? { usage: detail } : {}) }); }
    catch (fault) { logger.warn?.('Agent budget settlement deferred', { code: safeCode(fault?.code) }); return; }
    try { await store.advanceModelAttempt(attemptId, disposition, { errorCode: safeCode(error?.code) }); }
    catch (fault) { logger.warn?.('Agent attempt settlement deferred', { code: safeCode(fault?.code) }); }
  }

  async function paidCall(turn, generation, request, manifest, grantId, credentialRef, signal) {
    if (provider !== 'mock' && !allowExternal) fail('AI_EGRESS_NOT_READY', '当前运行端未启用模型外发。');
    if ((await store.listModelAttempts(turn.turnId)).length >= MAX_ATTEMPTS) fail('AI_ATTEMPT_LIMIT', '模型调用次数已达到上限。');
    const plan = policy ? await policy.snapshot() : null;
    const priceProfile = plan?.profile ?? baseProfile;
    const quote = quoteWorstCase({ request, priceProfile, now: now(), writeToolName: turn.writeIntent?.toolName ?? null, assistantTools: !turn.writeIntent });
    if (quote.priceStale && !priceStaleWarned) {
      priceStaleWarned = true;
      logger.warn?.('AI price profile is past its review date; costs are estimates', { version: priceProfile.version });
    }
    if (manifest && manifest.payloadHash !== quote.payloadHash) fail('AI_PAYLOAD_STALE', '实际请求与发送清单不一致。');
    const attemptId = randomUUID(), day = beijingDay(now());
    const attempt = await store.createModelAttempt(turn.turnId, generation, { attemptId, modelId: request.modelId,
      payloadHash: quote.payloadHash, manifestId: manifest?.manifestId ?? null,
      grantId: grantId ?? null, reservedMicrounits: quote.reservedMicrounits });
    let reserved = false, sent = false, settled = false;
    try {
      const reservation = await budget.reserve({ accountRef, jobId: turn.turnId, attemptId,
        priceVersion: priceProfile.version, reservedMicrounits: quote.reservedMicrounits, day,
        ...(plan ? { limits: plan.limits } : {}) });
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
      quoteWorstCase({ request, priceProfile, now: now(), writeToolName: turn.writeIntent?.toolName ?? null, assistantTools: !turn.writeIntent });
      await store.advanceModelAttempt(attemptId, 'sent', { generation });
      sent = true;
      authorizeAttempt(attemptId);
      const result = await gateway.complete({ ...request, credentialRef, signal, budgetAttemptId: attemptId,
        verifyBeforeSend: async () => {
          await currentTurn(turn.turnId, generation, signal);
          if (manifest) await access.assertRequest({ grantId, manifestId: manifest.manifestId, request, recipient: 'deepseek' });
        } });
      const usage = result.usage;
      const actual = usage?.unknown === false && Number.isSafeInteger(usage.inputTokens) && usage.inputTokens >= 0
        && Number.isSafeInteger(usage.outputTokens) && usage.outputTokens >= 0
        ? actualCostMicrounits(usage, priceProfile) : null;
      if (actual !== null && (actual > quote.reservedMicrounits || usage.inputTokens > 100_000
        || usage.outputTokens > 20_000)) fail('AI_USAGE_LIMIT', '模型用量超过预留或单次上限。');
      const disposition = actual === null ? 'unknown' : 'settled';
      await budget.settle({ accountRef, attemptId, disposition, actualMicrounits: actual, usage: usageDetail(turn, request, usage) });
      settled = true;
      try { await currentTurn(turn.turnId, generation, signal); }
      catch (error) {
        await store.advanceModelAttempt(attemptId, disposition, { actualMicrounits: actual });
        throw error;
      }
      await store.advanceModelAttempt(attemptId, disposition, { generation, actualMicrounits: actual, modelResult: result });
      return { result, attemptOrdinal: attempt.ordinal };
    } catch (error) {
      if (!settled) await settleOnFailure(attemptId, reserved, sent, error, usageDetail(turn, request, null));
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

  const proposalsEnabled = async () => {
    try { return Boolean(typeof knowledgeProposals === 'function' ? await knowledgeProposals() : knowledgeProposals); } catch { return false; }
  };

  async function executeTool(turn, generation, grantId, call, signal, sourceRefs, userMessage, modelId = null, proposalsOn = false) {
    await currentTurn(turn.turnId, generation, signal);
    const writeCall = proposalNames.has(call.name) && (!turn.writeIntent || call.name === turn.writeIntent.toolName);
    if (!writeCall && call.name !== 'web_search' && (!grantId || !access)) fail('AI_SCOPE_FORBIDDEN', '当前会话没有笔记读取授权。');
    if (typeof call.id !== 'string' || !call.id || call.id.length > 128) fail('AI_TOOL_INVALID', '模型工具调用 ID 无效。');
    const callId = hashRecord({ turnId: turn.turnId, providerCallId: call.id });
    const persisted = await store.appendToolCall(turn.turnId, generation, { callId,
      toolName: call.name, argumentsJson: call.arguments,
      maxCalls: proposalsOn && !turn.writeIntent && requestsKnowledgeProposal(userMessage) ? PROPOSAL_TOOLS : 6 });
    if (persisted.status !== 'requested') {
      for (const ref of persisted.sourceRefs) await verifyRef(grantId, ref);
      if (persisted.resultJson?.actionId) await actions.resumeForTurn(persisted.resultJson.actionId, turn, { grantId, sourceRefs });
      return toolOutcome(persisted);
    }
    let receiptPending = false;
    try {
      let outcome;
      if (writeCall) {
        if (call.name !== 'notes_create') {
          if (!grantId || !access) fail('AI_SCOPE_FORBIDDEN', '修改已有笔记需要当前读取授权。');
          const targets = call.name === 'notes_propose_organize' ? call.arguments?.changes?.map(change => change?.noteId) : [call.arguments?.noteId];
          if (!Array.isArray(targets) || !targets.length || targets.length > 20) fail('AI_TOOL_ARGUMENTS_INVALID', '修改目标无效。');
          for (const noteId of targets) await access.verifyRead({ grantId, noteId });
          if (!turn.writeIntent && targets.some(noteId => !sourceRefs.some(ref => ref.noteId === noteId))) {
            fail('AI_NOTE_TARGET_NOT_READ', '请先读取目标笔记，再提出对应原文的差异稿。');
          }
        }
        if (!actions) fail('AI_ACTION_UNAVAILABLE', '写入计划服务不可用。');
        const action = turn.writeIntent ? await actions.planForTurn(turn, turn.writeIntent, call, { sourceRefs, grantId })
          : await actions.planForAssistantTurn(turn, call, { sourceRefs, grantId });
        receiptPending = true;
        await actions.resumeForTurn(action.actionId, turn, { sourceRefs, grantId });
        outcome = { resultJson: { actionId: action.actionId, planHash: action.plan.planHash, status: action.status }, sourceRefs: [] };
      } else if (call.name === 'notes_search') {
        const found = await searchAssistantNotes({ search, access, grantId, args: call.arguments });
        outcome = { resultJson: { hits: found.hits.map(hit => ({ noteId: hit.noteId, title: hit.title,
          ref: hit.ref, text: hit.text })), inspected: found.inspected, truncated: found.truncated,
          mode: found.mode, ...(found.fallbackReason ? { fallbackReason: found.fallbackReason } : {}) },
        sourceRefs: found.hits.map(hit => hit.ref) };
      } else if (call.name === 'notes_read') outcome = await readTool(grantId, call.arguments);
      else if (call.name === 'annotations_list' && annotations && !turn.writeIntent) {
        outcome = await listAnnotatedRanges({ access, repository: annotations, grantId, args: call.arguments });
      } else if (call.name === 'knowledge_propose' && proposalsOn && !turn.writeIntent && requestsKnowledgeProposal(userMessage)) {
        outcome = await proposeKnowledge({ access, grantId, args: call.arguments, sourceRefs, turnId: turn.turnId, callId,
          commit: knowledgeCommit ? (() => {
            const origin = { conversationId: turn.conversationId, turnId: turn.turnId, toolCallId: callId };
            const identity = { datasetId: turn.datasetId, datasetEpoch: turn.datasetEpoch };
            return {
              find: () => knowledgeCommit.findCommitted({ origin, identity }),
              // 模拟适配器不是真实供应商，来源摘要以 simulated 标明，契约不允许 agent 记录使用 mock。
              save: plan => knowledgeCommit.commit({ plan, modelId, origin, identity, grantId, generation,
                provider: provider === 'mock' ? 'simulated' : provider })
            };
          })() : null });
      }
      else if (call.name === 'web_search') outcome = await webSearch.search(call.arguments, userMessage, signal);
      else fail('AI_TOOL_INVALID', '模型请求了未开放的工具。');
      receiptPending = true;
      await currentTurn(turn.turnId, generation, signal);
      await store.settleToolCall(turn.turnId, generation, callId, outcome);
      return toolOutcome(outcome);
    } catch (error) {
      if (!receiptPending && (!writeCall || deterministicWriteFailure(error?.code))) await store.settleToolCall(turn.turnId, generation, callId,
        { errorCode: safeCode(error?.code) }).catch(() => undefined);
      if (['AI_TOOL_ARGUMENTS_INVALID', 'AI_SEARCH_INVALID', 'AI_SCOPE_FORBIDDEN', 'AI_WEB_QUERY_REQUIRES_CLARIFICATION', 'AI_NOTE_TARGET_NOT_READ',
        'AI_PROPOSAL_NOT_READ', 'AI_PROPOSAL_SOURCE_STALE', 'AI_PROPOSAL_CITATION_INVALID', 'AI_PROPOSAL_INVALID', 'AI_PROPOSAL_DUPLICATE'].includes(error?.code)) {
        return { sourceRefs: [], truncated: false, fallback: false, inspected: 0, errorCode: safeCode(error?.code),
          ...(typeof error?.hint === 'string' ? { hint: error.hint.slice(0, 300) } : {}) };
      }
      throw error;
    }
  }


  async function verifyRef(grantId, ref) {
    if (!grantId || !access) fail('AI_SCOPE_FORBIDDEN', '来源需要当前读取授权。');
    const { version, contentHash } = await access.verifyRead({ grantId, noteId: ref.noteId });
    if (version.id !== ref.noteVersionId || contentHash !== ref.contentHash
      || calculateContentHash(version.content.slice(ref.start, ref.end)) !== ref.quoteHash) {
      fail('AI_SOURCE_STALE', '恢复或草稿来源已经变化，请重新生成。');
    }
  }

  function toolOutcome(outcome) {
    return { sourceRefs: outcome.sourceRefs ?? [], truncated: outcome.resultJson?.truncated === true,
      fallback: outcome.resultJson?.mode === 'keyword_fallback', inspected: outcome.resultJson?.inspected ?? 0,
      actionId: outcome.resultJson?.actionId, progress: outcome.resultJson?.status === 'saved', external: outcome.resultJson?.sourceType === 'external' ? outcome.resultJson : null,
      ...(outcome.errorCode ? { errorCode: outcome.errorCode } : {}), ...(outcome.hint ? { hint: outcome.hint } : {}) };
  }

  async function draftForContinuation(turn, prior, grantId, content) {
    if (!actions || !/(短|长|精简|扩写|补充|继续|再|改|调整|删|加|润色|这份|这个|它)/.test(content)) return '';
    const last = prior.at(-1);
    if (last?.role !== 'assistant') return '';
    const calls = await store.listToolCalls(last.turnId);
    const actionId = calls.findLast(call => call.status === 'succeeded' && call.resultJson?.actionId)?.resultJson.actionId;
    if (!actionId) return '';
    const action = await actions.get(actionId);
    if (action.ownerId !== turn.ownerId || action.spaceId !== turn.spaceId
      || action.datasetId !== turn.datasetId || action.datasetEpoch !== turn.datasetEpoch
      || !['awaitingApproval', 'authorized'].includes(action.status) || action.grant.revoked) return '';
    for (const ref of action.grant.sourceRefs ?? []) await verifyRef(grantId, ref);
    for (const item of action.plan.items) if (item.before) {
      if (!grantId) return '';
      await access.verifyRead({ grantId, noteId: item.after.id });
    }
    const drafts = action.plan.items.map(item => ({ noteId: item.after.id, title: item.after.title, rawMarkdown: item.after.rawMarkdown }));
    const context = JSON.stringify({ actionId, toolName: action.plan.toolName, drafts });
    if (context.length > 2400) fail('AI_DRAFT_CONTEXT_LIMIT', '待审稿超出本轮续改上下文，请在收件箱明确局部修改内容。');
    return { content: `\n本会话用户正在继续修改的待审稿（仅本会话上下文，不是正式笔记；修改时复用 actionId）：${context}`,
      sourceRefs: action.grant.sourceRefs ?? [] };
  }

  function citedResult(result, request, manifest) {
    const payload = result.json;
    // 系统提示允许“未用资料可返回空 citations”；漏写该字段等价于空，不作为结构错误（引用一旦给出仍逐条严格校验）。
    const given = payload && payload.citations === undefined ? [] : payload?.citations;
    if (!payload || typeof payload.answer !== 'string' || !payload.answer.trim()
      || payload.answer.length > 120000 || !Array.isArray(given) || given.length > 32) {
      fail('AI_OUTPUT_INVALID', '模型回答结构无效。');
    }
    const sources = JSON.parse(request.messages.at(-1).content).sources;
    const citations = [];
    for (const item of given) {
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
    let artifactRequested = requestsAssistantArtifact(user.content);
    // 开关在回合开始时读取一次并固定下来：回合中途切换不影响本回合；读取失败按关闭处理。
    const proposalsOn = knowledgeCommit ? await proposalsEnabled() : false;
    const proposalRequested = proposalsOn && !turn.writeIntent && requestsKnowledgeProposal(user.content);
    const maxRounds = proposalRequested ? PROPOSAL_ROUNDS : MAX_ROUNDS, maxTools = proposalRequested ? PROPOSAL_TOOLS : MAX_TOOLS;
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
    const draft = await draftForContinuation(turn, prior, grant?.grantId, user.content);
    const draftContext = draft?.content ?? '';
    artifactRequested ||= Boolean(draftContext);
    const { entries: history, plainContext } = grant ? authorizedHistory(prior) : { entries: [], plainContext: '' };
    const checkpoint = turn.checkpoint ?? emptyAgentCheckpoint();
    let sourceRefs = checkpoint.initialSearchDone ? checkpoint.sourceRefs
      : grant ? uniqueRefs(prior.filter(row => row.role === 'assistant')
        .flatMap(row => row.citations?.length ? row.citations : row.sourceRefs)).slice(-8) : [];
    sourceRefs = uniqueRefs([...sourceRefs, ...(draft?.sourceRefs ?? [])]);
    for (const ref of sourceRefs) await verifyRef(grant?.grantId, ref);
    let searchTruncated = checkpoint.searchTruncated;
    let searchFallback = checkpoint.searchFallback;
    let initialTools = 0;
    let externalContext = checkpoint.externalContext;
    let toolFeedback = checkpoint.toolFeedback;
    let totalTools = Math.max(checkpoint.totalTools, (await store.listToolCalls(turn.turnId)).length);
    let forceAnswer = checkpoint.forceAnswer;
    let budgetCapacity = null, proposalNudges = 0, proposalNudge = ''; // 本轮运行内的临时状态：请求预算容量、已提醒次数、一次性提醒
    let noProgressRounds = checkpoint.noProgressRounds;
    let handledAttemptOrdinal = checkpoint.handledAttemptOrdinal;
    let nextRound = checkpoint.nextRound;
    let initialSearchDone = checkpoint.initialSearchDone;
    const save = async () => store.saveCheckpoint(turn.turnId, generation, {
      version: 1, nextRound, totalTools, initialSearchDone, sourceRefs, searchTruncated, searchFallback,
      forceAnswer, noProgressRounds, handledAttemptOrdinal, externalContext, toolFeedback });
    if (!initialSearchDone && grant && /(我的|我记|笔记|资料|文档|记录|之前|根据|比较|总结|引用)/.test(user.content)) {
      initialTools++;
      const callId = hashRecord({ turnId: turn.turnId, initialSearch: true });
      const initialCall = await store.appendToolCall(turn.turnId, generation, { callId, toolName: 'notes_search',
        argumentsJson: { query: user.content, limit: 3, origin: 'automatic' }, maxCalls: maxTools });
      try {
        const initial = initialCall.status === 'succeeded' ? { ...initialCall.resultJson, hits: initialCall.resultJson.hits }
          : await search.search({ grantId: grant.grantId, query: user.content, limit: 3 });
        await currentTurn(turn.turnId, generation, signal);
        if (initialCall.status === 'requested') await store.settleToolCall(turn.turnId, generation, callId, { resultJson: {
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
    initialSearchDone = true;
    totalTools = Math.max(totalTools, (await store.listToolCalls(turn.turnId)).length);
    await save();
    for (let round = nextRound; round < maxRounds; round++) {
      await store.renewLease(turn.turnId, generation);
      await store.setPhase(turn.turnId, generation, sourceRefs.length ? 'retrieving' : 'generating');
      let request, manifest = null;
      if (grant) {
        const finalOnly = forceAnswer || round === maxRounds - 1 || totalTools >= maxTools;
        const roundGuidance = round ? finalOnly
            ? '\n工具结果已写入当前 sources。请直接依据这些来源作答；不足之处明确说明。'
            : '\n工具结果已写入当前 sources。若已足够，请直接回答；只有缺少关键来源时才继续搜索或阅读。' : '';
        const guidance = proposalRequested && !finalOnly ? `${roundGuidance}${PROPOSAL_GUIDANCE}` : roundGuidance;
        let prepared;
        for (;;) {
          const progress = proposalRequested ? proposalProgress(await store.listToolCalls(turn.turnId), sourceRefs, budgetCapacity) : '';
          const coverage = `${draftContext}${toolFeedback}${progress}${proposalNudge}${externalContext}${webSearch.enabled ? '\n联网工具仅返回合成验收资料。' : '\n真实联网尚未配置，核实时不能假称已联网。'}${searchFallback ? '\n候选索引未提供可用结果，已使用关键词检索；关键词未命中不等于授权资料没有答案。' : ''}${searchTruncated ? '\n检索受到本次处理上限限制，不得声称已检查完整授权范围。' : ''}`;
          const contextRoom = 4000 - user.content.length - guidance.length - coverage.length;
          if (contextRoom < 0) fail('AI_INPUT_TOO_LARGE', '提问与必要的检索说明超过上限。');
          const context = plainContext && contextRoom >= 8
            ? `先前普通聊天：${plainContext}\n`.slice(0, contextRoom) : '';
          const boundedQuestion = `${context}${user.content}${guidance}${coverage}`;
          try {
            prepared = await access.prepareRequest({ grantId: grant.grantId, recipient: 'deepseek',
              modelId: reference.modelId, credentialRef: reference.credentialRef,
              userMessage: boundedQuestion, history, sourceRanges: sourceRefs.map(refRange),
              omissions: [...(sourceRefs.length ? [] : ['no_source_match']), ...(searchTruncated ? ['candidate_cap'] : []),
                ...(searchFallback ? ['retrieval_fallback'] : [])], maxTokens: MAX_OUTPUT_TOKENS,
              writeToolName: turn.writeIntent?.toolName ?? null, assistantTools: !turn.writeIntent,
              tools: availableTools(turn, true, finalOnly, artifactRequested, proposalRequested), format: 'json' });
            break;
          } catch (error) {
            // 提炼回合：来源体积超过请求预算（固定开销约 7KB，每条来源再加数百字节）时不让回合失败，
            // 从最旧的来源起移出窗口直到装得下；说明文字随后按移出后的真实窗口重算，并提示被移出重点的重新读取位置。
            if (!proposalRequested || error?.code !== 'AI_CONTEXT_BUDGET' || sourceRefs.length <= 1) throw error;
            sourceRefs = sourceRefs.slice(1);
            budgetCapacity = Math.min(budgetCapacity ?? Infinity, sourceRefs.length);
          }
        }
        proposalNudge = '';
        request = prepared.request; manifest = prepared.manifest;
        for (const call of await store.listToolCalls(turn.turnId)) {
          if (call.status === 'succeeded' && call.sourceRefs.length && !call.provenanceManifestId
            && call.sourceRefs.every(ref => manifest.sources.some(source => hashRecord(source) === hashRecord(ref)))) {
            await store.bindToolResultManifest(turn.turnId, generation, call.callId, manifest.manifestId);
          }
        }
      } else {
        request = { credentialRef: reference.credentialRef, modelId: reference.modelId,
          messages: [{ role: 'system', content: `${ASSISTANT_GUIDANCE} 此会话没有笔记读取授权；不得声称读过用户资料或编造笔记引用。${webSearch.enabled ? '联网工具仅返回合成验收资料。' : '真实联网尚未配置；需要最新信息或核实时明确说明不可用，不能假称已联网。'}` },
            ...plainHistory(prior), { role: 'user', content: `${user.content}${draftContext}${toolFeedback}${externalContext}` }], maxTokens: MAX_OUTPUT_TOKENS,
          format: 'text', tools: availableTools(turn, false, forceAnswer || round === maxRounds - 1 || totalTools >= maxTools, artifactRequested, proposalRequested) };
        if (turn.writeIntent) request.messages[0].content += '用户已明确请求生成笔记计划，只调用所开放的写入计划工具；不得宣称已保存。';
      }
      await save();
      const pending = (await store.listModelAttempts(turn.turnId)).find(attempt => attempt.ordinal > handledAttemptOrdinal && attempt.modelResult);
      if (pending?.modelId && pending.modelId !== reference.modelId) fail('AI_MODEL_CHANGED', '恢复前模型配置已变化。');
      const delivery = pending ? { result: pending.modelResult, attemptOrdinal: pending.ordinal }
        : await paidCall(turn, generation, request, manifest, grant?.grantId ?? null, reference.credentialRef, signal);
      const { result, attemptOrdinal } = delivery;
      const permittedTools = pending ? availableTools(turn, Boolean(grant), false, artifactRequested, proposalRequested) : request.tools;
      if (result.toolCalls.some(call => !permittedTools.some(tool => tool.name === call.name))) {
        await store.rejectModelResult(turn.turnId, generation, attemptOrdinal, 'AI_TOOL_INVALID');
        fail('AI_TOOL_INVALID', '恢复的工具请求不在当前授权工具范围内。');
      }
      if (result.finishReason === 'tool_calls') {
        const persistedCalls = await store.listToolCalls(turn.turnId);
        if (!result.toolCalls.length || result.toolCalls.length > 2
          || totalTools + result.toolCalls.filter(call => !persistedCalls.some(item => item.callId === hashRecord({ turnId: turn.turnId, providerCallId: call.id }))).length > maxTools || round === maxRounds - 1) {
          fail('AI_AGENT_LIMIT', '工具轮次达到上限。');
        }
        if (result.toolCalls.some(call => proposalNames.has(call.name)) && result.toolCalls.length !== 1) {
          await store.rejectModelResult(turn.turnId, generation, attemptOrdinal, 'AI_TOOL_INVALID');
          fail('AI_TOOL_INVALID', '一轮只可提出一个明确的写入计划。');
        }

        const before = new Set(sourceRefs.map(hashRecord));
        let proposalSaved = false;
        for (const call of result.toolCalls) {
          const planSources = uniqueRefs([...sourceRefs, ...(manifest?.historySources ?? [])]);
          const outcome = await executeTool(turn, generation, grant?.grantId ?? null, call, signal, planSources, user.content, reference.modelId, proposalsOn);
          totalTools = (await store.listToolCalls(turn.turnId)).length;
          proposalSaved ||= outcome.progress === true;
          if (outcome.actionId) {
            await currentTurn(turn.turnId, generation, signal);
            await store.completeTurn(turn.turnId, generation, { content: turn.writeIntent
              ? '已生成笔记计划，尚未写入。请在执行记录中查看差异并确认。'
              : '已生成待审成果。请在 AI 成果收件箱继续修改或确认采纳。', sourceRefs: [], citations: [], provenanceManifestId: null, sourceFree: true });
            return;
          }
          if (outcome.external) externalContext = `\n外部来源（合成验收，非真实联网；不得当作个人笔记引用）：${JSON.stringify(outcome.external.hits)}`;
          if (outcome.errorCode?.startsWith('AI_PROPOSAL_')) toolFeedback = `\n最近工具结果：${outcome.errorCode}。${outcome.hint ?? '知识候选的引文必须与本次已读原文逐字一致并落在已读范围内；请先读取原文再修正，或向用户说明无法提议。'}`;
          else if (outcome.errorCode) toolFeedback = `\n最近工具结果：${outcome.errorCode}。请调整参数，缺少公开关键词时只问关键问题。`;
          sourceRefs = uniqueRefs([...sourceRefs, ...outcome.sourceRefs]).slice(-12);
          searchTruncated ||= outcome.truncated;
          searchFallback ||= outcome.fallback;
          await save();
        }
        // 成功保存候选也算进展：初始检索可能已覆盖全文，之后不再产生新来源。
        if (!proposalSaved && sourceRefs.every(ref => before.has(hashRecord(ref)))) {
          noProgressRounds++;
          forceAnswer = (!actions && sourceRefs.length > 0 && !externalContext) || noProgressRounds >= 2;
        } else noProgressRounds = 0;
        nextRound = round + 1;
        handledAttemptOrdinal = attemptOrdinal;
        await save();
        continue;
      }
      if (result.finishReason !== 'stop' || result.truncated || result.refused) {
        const code = result.truncated ? 'AI_OUTPUT_TRUNCATED' : result.refused ? 'AI_PROVIDER_REFUSED' : 'AI_OUTPUT_INVALID';
        await store.rejectModelResult(turn.turnId, generation, attemptOrdinal, code);
        fail(code, '模型未返回完整可用回答。');
      }
      // 提炼回合：仍有待提交的重点却直接作答（常见于把“最终回答”误当作提交方式、声称已提交）时，先提醒一次再决定，
      // 而不是接受一句虚假的完成声明；最多提醒 2 次，之后按模型回答照常收尾（已保存的候选不受影响）。
      if (proposalRequested && grant && proposalNudges < 2 && request.tools.some(tool => tool.name === 'knowledge_propose')
        && analyzeProposal(await store.listToolCalls(turn.turnId), sourceRefs, budgetCapacity).needPropose) {
        proposalNudges++;
        proposalNudge = '\n注意：上一条回答没有调用 knowledge_propose，但仍有待提交的重点。只有调用该工具才算提交，在回答里声称已提交无效；请现在调用 knowledge_propose 提交上面待提交的重点。';
        nextRound = round + 1;
        handledAttemptOrdinal = attemptOrdinal;
        await save();
        continue;
      }
      await store.setPhase(turn.turnId, generation, 'validating');
      let answer;
      try {
        answer = grant ? citedResult(result, request, manifest)
          : { content: result.content.trim(), sourceRefs: [], citations: [], provenanceManifestId: null, sourceFree: true };
        if (!answer.content) fail('AI_OUTPUT_INVALID', '模型返回空回答。');
      } catch (error) {
        if (['AI_CITATION_INVALID', 'AI_OUTPUT_INVALID'].includes(error.code)) await store.rejectModelResult(turn.turnId, generation, attemptOrdinal, error.code);
        throw error;
      }
      if (externalContext) answer.content += '\n\n外部检索来源（合成验收，非真实联网）：' + renderExternalSources(externalContext);
      await currentTurn(turn.turnId, generation, signal);
      await store.completeTurn(turn.turnId, generation, answer);
      return;
    }
    fail('AI_AGENT_LIMIT', '模型轮次达到上限。');
  }

  async function run(turnId, mode = 'resume') {
    if (closed) fail('AI_GENERATION_UNAVAILABLE', 'AI 执行端已关闭。');
    if (active.has(turnId)) return active.get(turnId).promise;
    const controller = new AbortController();
    let timer;
    const promise = (async () => {
      let turn;
      try {
        const previous = await store.getTurn(turnId);
        const remainingMs = previous?.executionStartedAt
          ? MAX_RUN_MS - (now().getTime() - Date.parse(previous.executionStartedAt)) : MAX_RUN_MS;
        timer = setTimeout(() => controller.abort(), Math.max(1, remainingMs));
        timer.unref?.();
        turn = await store.claimTurn(turnId, 300_000, { mode });
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
    return run(turnId, 'retry');
  }
  function close() {
    closed = true;
    return recovery.close(async () => {
      const running = [...active.values()];
      for (const entry of running) entry.controller.abort();
      await Promise.allSettled(running.map(entry => entry.promise));
    });
  }
  return { run, retry, cancel, recover: () => recovery.run(recover), close };
}
