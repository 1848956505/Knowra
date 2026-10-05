import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { calculateContentHash } from '@study-accelerator/content-anchor';
import { createPersistentAppContext } from '../src/app.factory.js';
import { createOptionalAiRuntime } from '../src/modules/ai/runtime.js';
import { buildKnowledgeProposalPlan } from '../src/modules/ai/knowledge-propose-tool.js';
import { createAgentKnowledgeCommitService } from '../src/modules/ai/agent-knowledge-commit.js';
import { createCoreOperationReceipt, validateCoreOperationReceipt } from '../src/infrastructure/core-operation-contract.js';

const priceProfile = { version: 'propose-synthetic-v1', modelId: 'deepseek-flash', expiresAt: '2030-01-01T00:00:00Z',
  inputMicrounitsPerMillion: 2000000, outputMicrounitsPerMillion: 8000000 };
const tool = (name, args, id = name) => ({ choices: [{ finish_reason: 'tool_calls', message: { content: null,
  tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }], usage: { prompt_tokens: 10, completion_tokens: 10 } });
const answer = (content, citations = null) => ({ choices: [{ finish_reason: 'stop', message: {
  content: citations === null ? content : JSON.stringify({ answer: content, citations }) } }], usage: { prompt_tokens: 10, completion_tokens: 10 } });

const MARKDOWN = '数据增强通过变换样本增加训练变化。\n\n过拟合指模型在训练集表现好而泛化差。';
const Q1 = '数据增强通过变换样本增加训练变化。', Q2 = '过拟合指模型在训练集表现好而泛化差。';
const at = quote => MARKDOWN.indexOf(quote);
const proposal = (noteId, overrides = {}) => ({ candidates: [{ title: '数据增强', canonicalStatement: Q1, knowledgeType: 'concept',
  citations: [{ noteId, start: at(Q1), end: at(Q1) + Q1.length, quote: Q1 }], ...overrides }] });

async function fixture(run, { knowledgeProposals = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'knowra-knowledge-propose-'));
  let runtime;
  try {
    const app = createPersistentAppContext({ storageRootDir: root, ownerId: 'test' });
    const space = app.http.knowledge.createDefaultKnowledgeSpace();
    const requests = [];
    let respond = () => answer('完成');
    const providerAdapter = { provider: 'mock', capabilities: () => ({ provider: 'mock' }), async *stream() {},
      async complete(request) { requests.push(request); return respond(request); } };
    runtime = createOptionalAiRuntime({ modelSettings: { credentialReference: async () => ({ modelId: 'deepseek-flash', credentialRef: 'synthetic' }),
      resolveCredential: async () => { throw new Error('Synthetic scenarios must not resolve real credentials'); } }, providerAdapter,
    repository: app.dataStore.aiRepository, accessStore: app.dataStore.aiAccessStore, conversationStore: app.dataStore.aiConversationStore,
    actionStore: app.dataStore.aiActionStore, coreOperationStore: app.coreOperationStore, knowledge: app.modules.knowledge,
    budgetAuthority: app.dataStore.aiBudgetAuthority, priceProfile, knowledgeProposals,
    contextSources: { ...app.modules.knowledge.repositories, spaceRepository: app.modules.knowledge.repositories.knowledgeSpaceRepository, ownerId: 'test' } });
    const conversation = await runtime.conversation.create({ spaceId: space.id });
    const submit = (content, key, requestedPolicyId = null) => runtime.conversationStore.submitTurn({
      ownerId: 'test', conversationId: conversation.conversationId, content, idempotencyKey: `propose-${key}`, requestedPolicyId });
    const policy = () => runtime.access.createPolicy({ spaceId: space.id, scope: { kind: 'library' }, excludedNoteIds: [],
      includeAttachments: false, read: true, egress: true, recipients: ['deepseek'], expiresAt: new Date(Date.now() + 86400000).toISOString() });
    const items = () => app.modules.knowledge.repositories.knowledgeItemRepository.list();
    await run({ app, runtime, space, requests, submit, policy, items, respond: next => { respond = next; } });
  } finally { await runtime?.agent?.close(); fs.rmSync(root, { recursive: true, force: true }); }
}
const toolCalls = async (runtime, turn, name) => (await runtime.conversationStore.listToolCalls(turn.turnId)).filter(item => item.toolName === name);

const hashOf = content => calculateContentHash(content);
function fakeAccess(content, { noteId = 'n1', versionId = 'v1', spaceId = 's' } = {}) {
  return { async verifyRead({ noteId: requested }) {
    return { note: { id: requested, spaceId }, version: { id: versionId, content }, contentHash: hashOf(content) };
  } };
}
const refFor = (content, start, end, extra = {}) => ({ noteId: 'n1', noteVersionId: 'v1', contentHash: hashOf(content), start, end,
  quoteHash: hashOf(content.slice(start, end)), ...extra });
const args = (start, end, quote, noteId = 'n1') => ({ candidates: [{ title: '标题', canonicalStatement: '陈述', knowledgeType: 'concept',
  citations: [{ noteId, start, end, quote }] }] });
const plan = (content, input, refs, access = fakeAccess(content)) => buildKnowledgeProposalPlan({ access, grantId: 'g',
  args: input, sourceRefs: refs, turnId: 't', callId: 'c' });


const TWO = '数据增强通过变换样本增加训练变化。\n\n过拟合指模型在训练集表现好而泛化差。';
async function commitPlan(app, note, requestSuffix = 'main') {
  const content = note.rawMarkdown, version = app.modules.knowledge.repositories.noteVersionRepository
    .findByNoteIdAndContentHash(note.id, calculateContentHash(content));
  const access = { async verifyRead() { return { note, version, contentHash: version.contentHash }; } };
  const ref = { noteId: note.id, noteVersionId: version.id, contentHash: version.contentHash, start: 0, end: content.length,
    quoteHash: calculateContentHash(content) };
  const cite = quote => [{ noteId: note.id, start: content.indexOf(quote), end: content.indexOf(quote) + quote.length, quote }];
  return buildKnowledgeProposalPlan({ access, grantId: 'g', sourceRefs: [ref], turnId: `turn-${requestSuffix}`, callId: 'call-1',
    args: { candidates: [{ title: '数据增强', canonicalStatement: Q1, knowledgeType: 'concept', citations: cite(Q1) },
      { title: '过拟合', canonicalStatement: Q2, knowledgeType: 'concept', citations: cite(Q2) }] } });
}
async function commitFixture(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'knowra-knowledge-commit-'));
  try {
    const app = createPersistentAppContext({ storageRootDir: root, ownerId: 'test' });
    const space = app.http.knowledge.createDefaultKnowledgeSpace();
    const note = app.modules.knowledge.noteService.createNote({ spaceId: space.id, title: '笔记', rawMarkdown: TWO });
    const service = createAgentKnowledgeCommitService({ core: app.coreOperationStore, knowledge: app.modules.knowledge, ownerId: 'test' });
    await run({ app, space, note, service, build: () => commitPlan(app, note), origin: { conversationId: 'conversation-1', turnId: 'turn-main', toolCallId: 'call-1' },
      identity: { datasetId: 'dataset-1', datasetEpoch: 'epoch-1' } });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

export const aiKnowledgePropose = [
  { name: '知识提议：读后提交原子保存为候选，附 agent 来源摘要，不产生正式知识', run: () => fixture(async ({ app, runtime, space, requests, submit, policy, items, respond }) => {
    const note = app.modules.knowledge.noteService.createNote({ spaceId: space.id, title: '笔记', rawMarkdown: MARKDOWN });
    const p = await policy(); let round = 0;
    respond(() => ++round === 1 ? tool('notes_read', { noteId: note.id }) : round === 2 ? tool('knowledge_propose', proposal(note.id))
      : answer('已提交一条候选。', [{ sourceId: 'S1', quote: Q1 }]));
    const turn = await submit('提炼这篇笔记的知识点', 'ok', p.policyId);
    await runtime.agent.run(turn.turnId);
    assert(requests[0].tools.some(item => item.name === 'knowledge_propose'));
    const [call] = await toolCalls(runtime, turn, 'knowledge_propose');
    assert.equal(call.status, 'succeeded'); assert.equal(call.resultJson.status, 'saved'); assert.equal(call.resultJson.saved, true);
    assert.equal(call.resultJson.candidates.length, 1); assert.equal(call.resultJson.candidates[0].title, '数据增强');
    const [saved] = items();
    assert.equal(saved.id, call.resultJson.candidates[0].candidateId); assert.equal(saved.reviewStatus, 'candidate'); assert.equal(saved.sourceMode, 'ai');
    assert.equal(items().filter(item => item.reviewStatus === 'confirmed').length, 0);
    const provenance = app.modules.knowledge.repositories.knowledgeArtifactProvenanceRepository.findByArtifactId(saved.id);
    assert.equal(provenance.executionMode, 'agent'); assert.equal(provenance.provider, 'simulated');
    assert.equal(provenance.origin.turnId, turn.turnId); assert.equal(provenance.sources[0].quoteText, Q1);
    const evidence = app.modules.knowledge.repositories.knowledgeEvidenceRepository.list({ knowledgeItemId: saved.id });
    assert.equal(evidence.length, 1); assert.equal(evidence[0].quoteText, Q1);
  }) },
  { name: '知识提议：默认不开放该工具', run: () => fixture(async ({ app, runtime, space, requests, submit, policy, respond }) => {
    const note = app.modules.knowledge.noteService.createNote({ spaceId: space.id, title: '笔记', rawMarkdown: MARKDOWN });
    const p = await policy(); respond(() => answer('普通回答', []));
    const turn = await submit(`读读 ${note.title}`, 'off', p.policyId);
    await runtime.agent.run(turn.turnId);
    assert(requests.every(request => !request.tools.some(item => item.name === 'knowledge_propose')));
  }, { knowledgeProposals: false }) },
  { name: '知识提议：伪造引文被拒绝并反馈给模型，模型可更正后通过', run: () => fixture(async ({ app, runtime, space, submit, policy, items, respond }) => {
    const note = app.modules.knowledge.noteService.createNote({ spaceId: space.id, title: '笔记', rawMarkdown: MARKDOWN });
    const p = await policy(); let round = 0;
    const forged = proposal(note.id); forged.candidates[0].citations[0].quote = '伪造的原文';
    respond(() => ++round === 1 ? tool('knowledge_propose', forged, 'bad')
      : round === 2 ? tool('knowledge_propose', proposal(note.id), 'good') : answer('已更正并提交。', [{ sourceId: 'S1', quote: Q1 }]));
    const turn = await submit('提炼这篇笔记的知识点', 'forged', p.policyId);
    await runtime.agent.run(turn.turnId);
    const calls = await toolCalls(runtime, turn, 'knowledge_propose');
    assert.equal(calls.length, 2);
    assert.equal(calls[0].status, 'failed'); assert.equal(calls[0].errorCode, 'AI_PROPOSAL_CITATION_INVALID');
    assert.equal(calls[1].resultJson.status, 'saved'); assert.equal(items().length, 1);
  }) },
  { name: '知识提议：未读先提交被拒绝，不创建任何知识', run: () => fixture(async ({ app, runtime, space, submit, policy, items, respond }) => {
    const note = app.modules.knowledge.noteService.createNote({ spaceId: space.id, title: '笔记', rawMarkdown: MARKDOWN });
    const p = await policy(); let round = 0;
    respond(() => ++round === 1 ? tool('knowledge_propose', proposal(note.id)) : answer('需要先读取原文。', []));
    const turn = await submit('今天天气怎么样', 'unread', p.policyId);
    await runtime.agent.run(turn.turnId);
    const [call] = await toolCalls(runtime, turn, 'knowledge_propose');
    assert.equal(call.errorCode, 'AI_PROPOSAL_NOT_READ'); assert.equal(items().length, 0);
  }) },
  { name: '知识提议：引文必须落在已读片段内，读过的片段之外的原文不可引', async run() {
    const content = `${'甲'.repeat(20)}${Q2}${'乙'.repeat(20)}`;
    const start = 20, ref = refFor(content, 0, 20);
    await assert.rejects(plan(content, args(start, start + Q2.length, Q2), [ref]), { code: 'AI_PROPOSAL_CITATION_INVALID' });
    const ok = await plan(content, args(start, start + Q2.length, Q2), [ref, refFor(content, 20, 20 + Q2.length)]);
    assert.equal(ok.candidates.length, 1);
    assert.equal(ok.candidates[0].provenance[0].start, start); assert.equal(ok.candidates[0].reviewStatus, 'candidate');
    assert.equal(ok.candidates[0].candidateInput.sourceMode, 'ai');
  } },
  { name: '知识提议：笔记版本已变化时拒绝，且不同空间的来源不可混用', async run() {
    const content = Q2;
    const stale = refFor(content, 0, content.length, { contentHash: 'old' });
    await assert.rejects(plan(content, args(0, 2, content.slice(0, 2)), [stale]), { code: 'AI_PROPOSAL_SOURCE_STALE' });
    const spaces = { async verifyRead({ noteId }) { return { note: { id: noteId, spaceId: noteId === 'n1' ? 's1' : 's2' },
      version: { id: 'v1', content }, contentHash: hashOf(content) }; } };
    await assert.rejects(plan(content, args(0, 2, content.slice(0, 2)), [refFor(content, 0, content.length), refFor(content, 0, content.length, { noteId: 'n2' })], spaces),
      { code: 'AI_PROPOSAL_INVALID' });
  } },
  { name: '知识提议：模型不能指定审核状态或业务字段，参数严格校验', async run() {
    const content = Q2, ref = refFor(content, 0, content.length);
    const good = args(0, 2, content.slice(0, 2));
    const withStatus = structuredClone(good); withStatus.candidates[0].reviewStatus = 'confirmed';
    const extraRoot = { ...good, scopeId: 'x' };
    const noCites = structuredClone(good); noCites.candidates[0].citations = [];
    const badType = structuredClone(good); badType.candidates[0].knowledgeType = 'opinion';
    for (const input of [null, {}, { candidates: [] }, withStatus, extraRoot, noCites, badType]) {
      await assert.rejects(plan(content, input, [ref]), { code: 'AI_TOOL_ARGUMENTS_INVALID' });
    }
    await assert.rejects(plan(content, { candidates: [{ ...good.candidates[0], title: '   ' }] }, [ref]), { code: 'AI_PROPOSAL_INVALID' });
  } },
  { name: '知识提议：同一回合同一调用得到稳定候选 ID，重复引用同一片段被拒绝', async run() {
    const content = Q2, ref = refFor(content, 0, content.length);
    const input = args(0, 4, content.slice(0, 4));
    const first = await plan(content, input, [ref]), second = await plan(content, input, [ref]);
    assert.equal(first.candidates[0].candidateInput.id, second.candidates[0].candidateInput.id); assert.equal(first.outputHash, second.outputHash);
    const duplicate = structuredClone(input); duplicate.candidates[0].citations.push({ ...duplicate.candidates[0].citations[0] });
    await assert.rejects(plan(content, duplicate, [ref]), { code: 'AI_PROPOSAL_CITATION_INVALID' });
  } },
  { name: '知识保存：全部候选与来源摘要同事务提交，重试复用回执不重复创建', run: () => commitFixture(async ({ app, space, note, build, service, origin, identity }) => {
    const plan = await build();
    const receipt = await service.commit({ plan, origin, identity, provider: 'deepseek', modelId: 'deepseek-flash' });
    assert.equal(receipt.kind, 'knowledge_propose'); assert.equal(receipt.result.candidates.length, 2);
    const repos = app.modules.knowledge.repositories;
    assert.equal(repos.knowledgeItemRepository.list().length, 2);
    assert.equal(repos.knowledgeArtifactProvenanceRepository.list({}).length, 2);
    const again = await service.commit({ plan, origin, identity, provider: 'deepseek', modelId: 'deepseek-flash' });
    assert.equal(again.receiptHash, receipt.receiptHash); assert.equal(repos.knowledgeItemRepository.list().length, 2);
    for (const item of repos.knowledgeItemRepository.list()) {
      assert.equal(repos.knowledgeArtifactProvenanceRepository.findByArtifactId(item.id).provider, 'deepseek');
    }
  }) },
  { name: '知识保存：中途失败整体回滚，不留下部分候选或来源摘要', run: () => commitFixture(async ({ app, build, service, origin, identity }) => {
    const plan = await build(), repos = app.modules.knowledge.repositories;
    // 第二个候选 ID 已被不同内容占用，创建时冲突；第一个候选必须一并回滚。
    const second = plan.candidates[1].candidateInput;
    app.modules.knowledge.knowledgeItemService.createCandidate({ id: second.id, title: '别人的候选', canonicalStatement: '占用 ID',
      knowledgeType: 'concept', sourceMode: 'manual', userExplanation: '', evidence: [] });
    const before = repos.knowledgeItemRepository.list().length;
    await assert.rejects(service.commit({ plan, origin, identity, provider: 'deepseek', modelId: 'deepseek-flash' }));
    assert.equal(repos.knowledgeItemRepository.list().length, before);
    assert.equal(repos.knowledgeItemRepository.findById(plan.candidates[0].candidateInput.id), null);
    assert.equal(repos.knowledgeArtifactProvenanceRepository.list({}).length, 0);
    assert.equal(await app.coreOperationStore.get({ ownerId: 'test', datasetId: identity.datasetId,
      operationId: `knowledge-propose-${(await import('../src/modules/ai/record-contract.js')).hashRecord([origin.turnId, origin.toolCallId])}` }), null);
  }) },
  { name: '知识保存：计划提交前来源转私密则整体拒绝，且同操作绑定另一份计划时冲突', run: () => commitFixture(async ({ app, note, build, service, origin, identity }) => {
    const plan = await build(), repos = app.modules.knowledge.repositories;
    app.modules.knowledge.noteService.updateNote(note.id, { aiVisibility: 'private' });
    await assert.rejects(service.commit({ plan, origin, identity, provider: 'deepseek', modelId: 'deepseek-flash' }),
      { code: 'KNOWLEDGE_EXTRACTION_SOURCE_UNAVAILABLE' });
    assert.equal(repos.knowledgeItemRepository.list().length, 0);
    app.modules.knowledge.noteService.updateNote(note.id, { aiVisibility: 'normal' });
    await service.commit({ plan, origin, identity, provider: 'deepseek', modelId: 'deepseek-flash' });
    const other = await commitPlan(app, note, 'other-request');
    await assert.rejects(service.commit({ plan: { ...other, requestId: plan.requestId }, origin, identity, provider: 'deepseek', modelId: 'deepseek-flash' }),
      { code: 'CORE_OPERATION_CONFLICT' });
  }) },
  { name: '核心回执：知识提议回执与笔记回执结果格式互不通用', run() {
    const base = { ownerId: 'o', datasetId: 'd', datasetEpoch: 'e', actorId: 'o', spaceId: 's', requestId: 'r', operationId: 'op', planHash: 'a'.repeat(64) };
    const knowledge = { candidates: [{ candidateId: 'k1', provenanceId: 'p1' }], saveState: 'localCommitted' };
    const note = { changes: [{ noteId: 'n', beforeVersionId: null, afterVersionId: 'v', contentHash: 'b'.repeat(64), metadataBefore: null }], saveState: 'localCommitted' };
    const receipt = createCoreOperationReceipt({ ...base, kind: 'knowledge_propose' }, knowledge);
    assert.deepEqual(validateCoreOperationReceipt(receipt), receipt);
    assert.throws(() => createCoreOperationReceipt({ ...base, kind: 'knowledge_propose' }, note), { code: 'CORE_OPERATION_INVALID' });
    assert.throws(() => createCoreOperationReceipt({ ...base, kind: 'notes_create' }, knowledge), { code: 'CORE_OPERATION_INVALID' });
    assert.ok(createCoreOperationReceipt({ ...base, kind: 'notes_create' }, note));
    for (const bad of [{ ...knowledge, candidates: [] }, { ...knowledge, candidates: [knowledge.candidates[0], knowledge.candidates[0]] },
      { ...knowledge, candidates: [{ candidateId: 'k1' }] }, { ...knowledge, saveState: 'pending' }]) {
      assert.throws(() => createCoreOperationReceipt({ ...base, kind: 'knowledge_propose' }, bad), { code: 'CORE_OPERATION_INVALID' });
    }
  } }

];
