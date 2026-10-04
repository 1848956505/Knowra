import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createPersistentAppContext } from '../src/app.factory.js';
import { createOptionalAiRuntime } from '../src/modules/ai/runtime.js';
import { createAssistantWebSearch } from '../src/modules/ai/assistant-tools.js';

const priceProfile = { version: 'assistant-synthetic-v1', modelId: 'deepseek-flash', expiresAt: '2030-01-01T00:00:00Z',
  inputMicrounitsPerMillion: 2000000, outputMicrounitsPerMillion: 8000000 };
const tool = (name, args, id = name) => ({ choices: [{ finish_reason: 'tool_calls', message: { content: null,
  tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }], usage: { prompt_tokens: 10, completion_tokens: 10 } });
const answer = (content, citations = null) => ({ choices: [{ finish_reason: 'stop', message: {
  content: citations === null ? content : JSON.stringify({ answer: content, citations }) } }], usage: { prompt_tokens: 10, completion_tokens: 10 } });
async function fixture(run, webSearchAdapter = null) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'knowra-assistant-autonomy-'));
  let runtime;
  try {
    const app = createPersistentAppContext({ storageRootDir: root, ownerId: 'test' });
    const space = app.http.knowledge.createDefaultKnowledgeSpace();
    const requests = [];
    let respond = () => answer('普通回答');
    const providerAdapter = { provider: 'mock', capabilities: () => ({ provider: 'mock' }), async *stream() {},
      async complete(request) { requests.push(request); return respond(request); } };
    runtime = createOptionalAiRuntime({ modelSettings: { credentialReference: async () => ({ modelId: 'deepseek-flash', credentialRef: 'synthetic' }),
      resolveCredential: async () => { throw new Error('Synthetic scenarios must not resolve real credentials'); } }, providerAdapter,
    repository: app.dataStore.aiRepository, accessStore: app.dataStore.aiAccessStore, conversationStore: app.dataStore.aiConversationStore,
    actionStore: app.dataStore.aiActionStore, coreOperationStore: app.coreOperationStore, knowledge: app.modules.knowledge,
    budgetAuthority: app.dataStore.aiBudgetAuthority, priceProfile, webSearchAdapter,
    contextSources: { ...app.modules.knowledge.repositories, spaceRepository: app.modules.knowledge.repositories.knowledgeSpaceRepository, ownerId: 'test' } });
    const conversation = await runtime.conversation.create({ spaceId: space.id });
    const submit = (content, idempotencyKey, requestedPolicyId = null) => runtime.conversationStore.submitTurn({
      ownerId: 'test', conversationId: conversation.conversationId, content, idempotencyKey: `assistant-${idempotencyKey}`, requestedPolicyId });
    const policy = () => runtime.access.createPolicy({ spaceId: space.id, scope: { kind: 'library' }, excludedNoteIds: [],
      includeAttachments: false, read: true, egress: true, recipients: ['deepseek'], expiresAt: new Date(Date.now() + 86400000).toISOString() });
    await run({ app, runtime, space, conversation, requests, submit, policy, respond: next => { respond = next; } });
  } finally { await runtime?.agent?.close(); fs.rmSync(root, { recursive: true, force: true }); }
}
export const aiAssistantAutonomyTests = [
  { name: '自主助手：解释怎么保存文件保持普通聊天，禁止模型乱提成果', run: () => fixture(async ({ runtime, requests, submit, space, respond }) => {
    respond(() => tool('notes_create', { title: '错误成果', rawMarkdown: '模型乱提' }));
    const turn = await submit('解释怎么保存文件', 'explain-save');
    await assert.rejects(runtime.agent.run(turn.turnId), { code: 'AI_TOOL_INVALID' });
    assert(!requests[0].tools.some(item => item.name === 'notes_create')); assert.equal((await runtime.actions.list(space.id)).length, 0);
  }) },
  { name: '自主助手：自然语言整理本周学习与总结这周笔记均可生成新稿', run: () => fixture(async ({ runtime, requests, submit, space, respond }) => {
    respond(() => tool('notes_create', { title: '本周学习总结', rawMarkdown: '合成学习总结。' }));
    for (const [index, content] of ['帮我整理一下本周学到的东西', '总结这周笔记'].entries()) {
      const turn = await submit(content, `natural-week-${index}`); await runtime.agent.run(turn.turnId);
      assert(requests.at(-1).tools.some(item => item.name === 'notes_create'));
    }
    assert.equal((await runtime.actions.list(space.id)).length, 2);
  }) },
  { name: '自主助手：普通聊天不开放成果工具，目标模糊只问关键问题', run: () => fixture(async ({ runtime, requests, submit, space, respond }) => {
    respond(() => answer('你希望整理哪一方面的内容？'));
    const turn = await submit('帮我看看', 'clarify'); await runtime.agent.run(turn.turnId);
    assert.equal((await runtime.actions.list(space.id)).length, 0);
    assert(!requests[0].tools.some(item => item.name.startsWith('notes_')));
    assert.equal((await runtime.conversationStore.listMessages(turn.conversationId)).at(-1).content, '你希望整理哪一方面的内容？');
  }) },
  { name: '自主助手：个人资料问答按当前普通笔记来源引用', run: () => fixture(async ({ app, runtime, space, policy, submit, respond, requests }) => {
    const note = app.modules.knowledge.noteService.createNote({ spaceId: space.id, title: '光合作用', rawMarkdown: '光合作用需要阳光和水。' });
    const grantPolicy = await policy();
    respond(() => answer('个人笔记：光合作用需要阳光和水。', [{ sourceId: 'S1', quote: '光合作用需要阳光和水' }]));
    const turn = await submit('根据我的笔记解释光合作用', 'personal-qa', grantPolicy.policyId); await runtime.agent.run(turn.turnId);
    assert.equal((await runtime.conversationStore.listMessages(turn.conversationId)).at(-1).citations[0].noteId, note.id);
    assert.equal((await runtime.actions.list(space.id)).length, 0);
    assert(!requests[0].tools.some(item => item.name === 'notes_create'));
  }) },
  { name: '自主助手：按时间检索周总结新稿，不要求预选写入模式', run: () => fixture(async ({ app, runtime, space, policy, submit, respond }) => {
    const repo = app.modules.knowledge.repositories.noteRepository;
    const first = app.modules.knowledge.noteService.createNote({ spaceId: space.id, title: '学习甲', rawMarkdown: '合成学习记录甲' });
    const excluded = app.modules.knowledge.noteService.createNote({ spaceId: space.id, title: '学习乙', rawMarkdown: '时间范围之外的内容' });
    repo.save({ ...first, createdAt: '2026-09-28T00:00:00.000Z' }); repo.save({ ...excluded, createdAt: '2026-10-05T00:00:00.000Z' });
    const p = await policy(); let round = 0;
    respond(request => ++round === 1 ? tool('notes_search', { createdFrom: '2026-09-28T00:00:00Z', createdBefore: '2026-10-05T00:00:00Z' })
      : tool('notes_create', { title: '本周总结', rawMarkdown: '本周学习记录甲。' }));
    const turn = await submit('将 9 月 28 日到 10 月 4 日的笔记生成周总结新稿，按 UTC 时间', 'weekly', p.policyId);
    await runtime.agent.run(turn.turnId);
    const calls = await runtime.conversationStore.listToolCalls(turn.turnId);
    const dated = calls.find(call => call.resultJson?.mode === 'created_time');
    assert.deepEqual(dated.resultJson.hits.map(hit => hit.noteId), [first.id]);
    const [draft] = await runtime.actions.list(space.id); assert.equal(draft.plan.toolName, 'notes_create');
    assert.equal(draft.status, 'awaitingApproval'); assert.equal(app.dataStore.state.notes.length, 2);
    assert(!turn.writeIntent); assert.equal((await runtime.conversationStore.getTurn(turn.turnId)).checkpoint.totalTools, 2);
  }) },
  { name: '自主助手：先读后提出已有笔记差异稿，经确认后提交且可恢复版本', run: () => fixture(async ({ app, runtime, space, policy, submit, respond }) => {
    const note = app.modules.knowledge.noteService.createNote({ spaceId: space.id, title: '整理目标', rawMarkdown: '原句需要整理。' });
    const p = await policy(); let round = 0;
    respond(() => ++round === 1 ? tool('notes_read', { noteId: note.id })
      : tool('notes_propose_patch', { noteId: note.id, replacements: [{ start: 0, end: 2, quote: '原句', replacement: '新句' }] }));
    const turn = await submit('整理修改这篇笔记', 'patch', p.policyId); await runtime.agent.run(turn.turnId);
    const [draft] = await runtime.actions.list(space.id); assert.equal(draft.plan.items[0].before.rawMarkdown, '原句需要整理。');
    assert.equal(draft.plan.items[0].after.rawMarkdown, '新句需要整理。');
    assert.equal(app.modules.knowledge.noteService.getNote(note.id).rawMarkdown, '原句需要整理。');
    await runtime.actions.approve(draft.actionId, { planHash: draft.plan.planHash });
    const applied = await runtime.actions.apply(draft.actionId);
    assert(applied.receipt.result.changes[0].beforeVersionId); assert.equal(app.modules.knowledge.noteService.getNote(note.id).rawMarkdown, '新句需要整理。');
  }) },
  { name: '自主助手：新稿可用短一点延续同会话修改，普通回答不另建成果', run: () => fixture(async ({ runtime, submit, space, respond, requests }) => {
    respond(() => tool('notes_create', { title: '合成周报', rawMarkdown: '第一段学习结果，第二段行动计划。' }));
    const first = await submit('生成周报新稿', 'draft'); await runtime.agent.run(first.turnId);
    const [draft] = await runtime.actions.list(space.id);
    respond(request => { assert(request.messages.at(-1).content.includes(draft.actionId));
      return tool('notes_create', { actionId: draft.actionId, title: '合成周报', rawMarkdown: '学习结果与行动计划。' }); });
    const second = await submit('短一点', 'shorter'); await runtime.agent.run(second.turnId);
    const list = await runtime.actions.list(space.id); assert.equal(list.length, 1); assert.equal(list[0].plan.items[0].after.rawMarkdown, '学习结果与行动计划。');
    respond(() => answer('你好')); const plain = await submit('你好', 'plain-after-draft'); await runtime.agent.run(plain.turnId);
    assert(!requests.at(-1).tools.some(item => item.name === 'notes_create')); assert.equal((await runtime.actions.list(space.id)).length, 1);
  }) },
  { name: '自主助手：草稿个人来源改私密后阻止续对话发送原资料', run: () => fixture(async ({ app, runtime, space, policy, submit, respond, requests }) => {
    const note = app.modules.knowledge.noteService.createNote({ spaceId: space.id, title: '授权资料', rawMarkdown: '只用于合成的个人秘密' }); const p = await policy();
    respond(() => tool('notes_create', { title: '资料新稿', rawMarkdown: '只用于合成的个人秘密' }));
    const first = await submit('根据我的笔记生成资料新稿', 'source-draft', p.policyId); await runtime.agent.run(first.turnId);
    app.modules.knowledge.noteService.updateNote(note.id, { aiVisibility: 'private' });
    const second = await submit('短一点', 'private-followup', p.policyId); const count = requests.length;
    await assert.rejects(runtime.agent.run(second.turnId), { code: 'AI_SCOPE_FORBIDDEN' }); assert.equal(requests.length, count);
  }) },
  { name: '自主助手：合成联网注明外部来源，不加入个人笔记引用', run: () => fixture(async ({ runtime, submit, respond, requests }) => {
    let round = 0; respond(() => ++round === 1 ? tool('web_search', { query: '公开主题' }) : answer('外部资料：合成结果，仅用于流程验收。'));
    const turn = await submit('搜索公开主题的最新信息', 'synthetic-web'); await runtime.agent.run(turn.turnId);
    const message = (await runtime.conversationStore.listMessages(turn.conversationId)).at(-1);
    assert(message.content.includes('合成验收，非真实联网')); assert(message.content.includes('https://example.test/source'));
    assert.deepEqual(message.sourceRefs, []); assert(requests[1].messages.at(-1).content.includes('sourceType'));
  }, { capabilities: () => ({ mode: 'synthetic', egress: false }), search: async input => {
    assert.deepEqual(Object.keys(input), ['query', 'limit', 'signal']); return { hits: [{ title: '合成公开来源', url: 'https://example.test/source', text: '合成外部事实。' }] };
  } }) },
  { name: '自主助手：搜索拒绝从笔记生成的词，真实适配器默认不可用', async run() {
    let sent = 0;
    const search = createAssistantWebSearch({ capabilities: () => ({ mode: 'synthetic', egress: false }), search: async () => { sent++; } });
    await assert.rejects(search.search({ query: '个人秘密笔记原文' }, '请核实公开主题'), { code: 'AI_WEB_QUERY_REQUIRES_CLARIFICATION' }); assert.equal(sent, 0);
    const external = createAssistantWebSearch({ capabilities: () => ({ mode: 'live', egress: true }), search: async () => { sent++; } });
    assert.equal(external.enabled, false); await assert.rejects(external.search({ query: '公开主题' }, '公开主题'), { code: 'AI_WEB_SEARCH_UNAVAILABLE' }); assert.equal(sent, 0);
  } }
];
