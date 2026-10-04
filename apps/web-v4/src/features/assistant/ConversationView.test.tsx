vi.mock('./noteActionApi', () => ({ noteActionApi: { list: vi.fn(async () => []), inbox: vi.fn(async () => []) } }));
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AssistantView } from './AssistantView';
import { assistantApi } from './assistantApi';
import { conversationAttachmentApi } from './conversationAttachmentApi';
import { conversationApi, type Conversation, type ConversationTurn, type ConversationMessage } from './conversationApi';

const fixture = vi.hoisted(() => ({
  navigate: vi.fn(),
  state: {
    serverData: { currentSpaceId: 'space-1', notes: [{ id: 'note-1', title: '笔记 A', spaceId: 'space-1', deleted: false }], folderTree: [] },
    getNoteVersion: vi.fn(async () => ({ content: '前文 alpha 后文', contentHash: 'e1ad18f75b0295b8a3845a76fc8e148b8eef2107f58336fe9bca6a23ebb608d6' }))
  }
}));

vi.mock('../../app/router', async importOriginal => ({
  ...await importOriginal<typeof import('../../app/router')>(), useNavigate: () => fixture.navigate
}));

vi.mock('../../store/AppStoreProvider', () => ({ useAppStoreApi: () => ({ getState: () => fixture.state }), useAppStore: (selector: (value: typeof fixture.state) => unknown) => selector(fixture.state) }));
vi.mock('./assistantApi', () => ({ assistantApi: { status: vi.fn(), listLegacy: vi.fn(), getLegacy: vi.fn() } }));
vi.mock('./conversationAttachmentApi', () => ({ conversationAttachmentApi: {
  list: vi.fn(), upload: vi.fn(), preview: vi.fn(), content: vi.fn(), remove: vi.fn()
} }));
vi.mock('./conversationApi', () => ({ conversationApi: {
  list: vi.fn(), create: vi.fn(), messages: vi.fn(), send: vi.fn(), turn: vi.fn(), cancel: vi.fn(), retry: vi.fn(), resume: vi.fn(),
  policies: vi.fn(), createPolicy: vi.fn(), revokePolicy: vi.fn()
} }));

const conversation: Conversation = { conversationId: 'conversation-1', spaceId: 'space-1',
  createdAt: '2026-09-27T00:00:00.000Z', updatedAt: '2026-09-27T00:00:00.000Z',
  historicalDataset: false, readOnly: false };
const succeeded: ConversationTurn = { turnId: 'turn-1', conversationId: 'conversation-1',
  requestedPolicyId: null, status: 'succeeded', phase: 'finished', errorCode: null,
  toolCalls: [], modelAttempts: [] };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(conversationApi.list).mockResolvedValue([]);
  vi.mocked(conversationAttachmentApi.list).mockResolvedValue([]);
  vi.mocked(conversationApi.policies).mockResolvedValue([]);
  vi.mocked(conversationApi.messages).mockResolvedValue([]);
  vi.mocked(conversationApi.turn).mockResolvedValue(succeeded);
  vi.mocked(assistantApi.listLegacy).mockResolvedValue([]);
  vi.mocked(assistantApi.status).mockResolvedValue({ provider: 'deepseek', modelId: 'deepseek-flash',
    configured: true, executionLocation: 'server', generationAvailable: true, unavailableReason: null, budget: null,
    capabilities: { readScopes: ['note', 'folder'], actions: ['answer', 'cancel'], responseMode: 'polling',
      writeTools: false, providerAdvertised: null, providerVerified: false } });
});

it('附件创建会话期间暂停消息发送，迟到创建不会覆盖用户切换的会话', async () => {
  let release!: (value: Conversation) => void;
  const delayed = new Promise<Conversation>(resolve => { release = resolve; });
  vi.mocked(conversationApi.list).mockResolvedValue([conversation]);
  vi.mocked(conversationApi.create).mockReturnValue(delayed);
  const view = render(<AssistantView pathname="/assistant?new=1" onOpenNote={vi.fn()} />);
  await screen.findByText('服务器执行');
  fireEvent.change(screen.getByRole('textbox', { name: '消息' }), { target: { value: '独立问题' } });
  const fileInput = document.querySelector('input[type=file]')!;
  fireEvent.change(fileInput, { target: { files: [new File(['资料'], '资料.txt', { type: 'text/plain' })] } });
  await waitFor(() => expect(conversationApi.create).toHaveBeenCalledOnce());
  expect(screen.getByRole('button', { name: '处理中…' })).toBeDisabled();
  view.rerender(<AssistantView pathname="/assistant?conversationId=conversation-1" onOpenNote={vi.fn()} />);
  await act(async () => { release({ ...conversation, conversationId: 'late-conversation' }); await delayed; });
  expect(conversationAttachmentApi.upload).not.toHaveBeenCalled();
  expect(conversationApi.send).not.toHaveBeenCalled();
  expect(fixture.navigate).not.toHaveBeenCalled();
});

it('迟到的联网恢复快照不覆盖用户关闭的资料读取范围', async () => {
  const policy = { policyId: 'policy-1', revision: 1, spaceId: 'space-1', scope: { kind: 'library' as const },
    egress: true, recipients: ['deepseek'], expiresAt: '2030-01-01T00:00:00Z', revokedAt: null };
  const messages: ConversationMessage[] = [
    { messageId: 'old-user', turnId: 'turn-1', sequence: 1, role: 'user', content: '旧提问', sourceRefs: [], sourceFree: true, createdAt: conversation.createdAt },
    { messageId: 'old-answer', turnId: 'turn-1', sequence: 2, role: 'assistant', content: '旧回答', sourceRefs: [], sourceFree: true, createdAt: conversation.createdAt }
  ];
  let release!: (rows: ConversationMessage[]) => void;
  const delayed = new Promise<ConversationMessage[]>(resolve => { release = resolve; });
  vi.mocked(conversationApi.list).mockResolvedValue([conversation]);
  vi.mocked(conversationApi.policies).mockResolvedValue([policy]);
  vi.mocked(conversationApi.messages).mockResolvedValueOnce(messages).mockReturnValueOnce(delayed).mockResolvedValue(messages);
  vi.mocked(conversationApi.turn).mockResolvedValue({ ...succeeded, requestedPolicyId: 'policy-1', assistantMessageId: 'old-answer' });
  vi.mocked(conversationApi.send).mockResolvedValue({ ...succeeded, turnId: 'turn-2', status: 'running' });
  render(<AssistantView pathname="/assistant?conversationId=conversation-1" onOpenNote={vi.fn()} />);
  await screen.findByText('旧回答');
  const scope = Array.from(document.querySelectorAll('select')).find(select => Array.from(select.options).some(option => option.value === 'policy-1'))!;
  expect(scope.value).toBe('policy-1');
  fireEvent(window, new Event('online'));
  await waitFor(() => expect(conversationApi.messages).toHaveBeenCalledTimes(2));
  fireEvent.change(scope, { target: { value: 'plain' } });
  await act(async () => { release(messages); await delayed; });
  expect(scope.value).toBe('plain');
  fireEvent.change(screen.getByRole('textbox', { name: '消息' }), { target: { value: '新的私事' } });
  fireEvent.click(screen.getByRole('button', { name: '发送消息' }));
  await waitFor(() => expect(conversationApi.send).toHaveBeenCalledWith('conversation-1', expect.objectContaining({ requestedPolicyId: null })));
});

it('初次会话快照也不能覆盖加载期间用户新选择的授权', async () => {
  const policies = ['policy-1', 'policy-2'].map(policyId => ({ policyId, revision: 1, spaceId: 'space-1',
    scope: { kind: 'library' as const }, egress: true, recipients: ['deepseek'], expiresAt: '2030-01-01T00:00:00Z', revokedAt: null }));
  const messages: ConversationMessage[] = [
    { messageId: 'old-user', turnId: 'turn-1', sequence: 1, role: 'user', content: '旧问题', sourceRefs: [], sourceFree: true, createdAt: conversation.createdAt },
    { messageId: 'old-answer', turnId: 'turn-1', sequence: 2, role: 'assistant', content: '旧答复', sourceRefs: [], sourceFree: true, createdAt: conversation.createdAt }
  ];
  let release!: (rows: ConversationMessage[]) => void;
  const delayed = new Promise<ConversationMessage[]>(resolve => { release = resolve; });
  vi.mocked(conversationApi.list).mockResolvedValue([conversation]);
  vi.mocked(conversationApi.policies).mockResolvedValue(policies);
  vi.mocked(conversationApi.messages).mockReturnValueOnce(delayed).mockResolvedValue(messages);
  vi.mocked(conversationApi.turn).mockResolvedValue({ ...succeeded, requestedPolicyId: 'policy-1', assistantMessageId: 'old-answer' });
  vi.mocked(conversationApi.send).mockResolvedValue({ ...succeeded, turnId: 'turn-2', status: 'running' });
  render(<AssistantView pathname="/assistant?conversationId=conversation-1" onOpenNote={vi.fn()} />);
  await waitFor(() => expect(conversationApi.messages).toHaveBeenCalledOnce());
  const scope = Array.from(document.querySelectorAll('select')).find(select => Array.from(select.options).some(option => option.value === 'policy-2'))!;
  fireEvent.change(scope, { target: { value: 'policy-2' } });
  await act(async () => { release(messages); await delayed; });
  await screen.findByText('旧答复'); expect(scope.value).toBe('policy-2');
  fireEvent.change(screen.getByRole('textbox', { name: '消息' }), { target: { value: '沿用新选择' } });
  fireEvent.click(screen.getByRole('button', { name: '发送消息' }));
  await waitFor(() => expect(conversationApi.send).toHaveBeenCalledWith('conversation-1', expect.objectContaining({ requestedPolicyId: 'policy-2' })));
});

it('没有笔记选择时可直接创建普通聊天，发送请求不带读取授权', async () => {
  vi.mocked(conversationApi.create).mockImplementation(async (_space, id) => ({ ...conversation, conversationId: id }));
  vi.mocked(conversationApi.send).mockResolvedValue({ ...succeeded, status: 'running', phase: 'generating' });
  render(<AssistantView pathname="/assistant?new=1" onOpenNote={vi.fn()} />);
  expect(await screen.findByText('服务器执行')).toBeInTheDocument();
  expect(screen.queryByRole('combobox', { name: '本轮用途' })).not.toBeInTheDocument();
  expect(screen.queryByRole('combobox', { name: '本轮固定写入目标' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox', { name: '消息' }), { target: { value: '解释梯度下降' } });
  fireEvent.click(screen.getByRole('button', { name: '发送消息' }));
  await waitFor(() => expect(conversationApi.send).toHaveBeenCalledOnce());
  expect(conversationApi.create).toHaveBeenCalledWith('space-1', expect.any(String));
  expect(conversationApi.send).toHaveBeenCalledWith(expect.any(String), {
    content: '解释梯度下降', idempotencyKey: expect.any(String), requestedPolicyId: null
  });
});

it('已有会话沿用原会话 ID 追问，不创建第二个会话', async () => {
  vi.mocked(conversationApi.list).mockResolvedValue([conversation]);
  vi.mocked(conversationApi.messages).mockResolvedValue([{ messageId: 'message-1', turnId: 'turn-1', sequence: 1,
    role: 'user', content: '第一问', sourceRefs: [], sourceFree: true, createdAt: conversation.createdAt },
  { messageId: 'message-2', turnId: 'turn-1', sequence: 2, role: 'assistant', content: '第一答',
    sourceRefs: [], citations: [], sourceFree: true, createdAt: conversation.createdAt }]);
  vi.mocked(conversationApi.send).mockResolvedValue({ ...succeeded, turnId: 'turn-2', status: 'running', phase: 'generating' });
  render(<AssistantView pathname="/assistant?conversationId=conversation-1" onOpenNote={vi.fn()} />);
  expect(await screen.findByText('第一答')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox', { name: '消息' }), { target: { value: '为什么？' } });
  fireEvent.click(screen.getByRole('button', { name: '发送消息' }));
  await waitFor(() => expect(conversationApi.send).toHaveBeenCalledWith('conversation-1',
    expect.objectContaining({ content: '为什么？', requestedPolicyId: null })));
  expect(conversationApi.create).not.toHaveBeenCalled();
});

it('响应中断后重试同一发送意图，复用幂等键', async () => {
  vi.mocked(conversationApi.create).mockImplementation(async (_space, id) => ({ ...conversation, conversationId: id }));
  vi.mocked(conversationApi.send).mockRejectedValueOnce(new Error('连接中断'))
    .mockResolvedValue({ ...succeeded, status: 'running', phase: 'generating' });
  render(<AssistantView pathname="/assistant?new=1" onOpenNote={vi.fn()} />);
  await screen.findByText('服务器执行');
  fireEvent.change(screen.getByRole('textbox', { name: '消息' }), { target: { value: '问题' } });
  fireEvent.click(screen.getByRole('button', { name: '发送消息' }));
  expect(await screen.findByText(/连接中断/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '重试发送' }));
  await waitFor(() => expect(conversationApi.send).toHaveBeenCalledTimes(2));
  expect(vi.mocked(conversationApi.send).mock.calls[1]).toEqual(vi.mocked(conversationApi.send).mock.calls[0]);
  expect(vi.mocked(conversationApi.create).mock.calls[1]).toEqual(vi.mocked(conversationApi.create).mock.calls[0]);
});

it('恢复历史消息与引用，来源打开历史版本，检索记录按需加载', async () => {
  vi.mocked(conversationApi.list).mockResolvedValue([conversation]);
  vi.mocked(conversationApi.messages).mockResolvedValue([{ messageId: 'message-1', turnId: 'turn-1', sequence: 1,
    role: 'user', content: '问题', sourceRefs: [], sourceFree: true, createdAt: conversation.createdAt },
  { messageId: 'message-2', turnId: 'turn-1', sequence: 2, role: 'assistant', content: '回答',
    sourceRefs: [], citations: [{ noteId: 'note-1', noteVersionId: 'version-1',
      contentHash: 'e1ad18f75b0295b8a3845a76fc8e148b8eef2107f58336fe9bca6a23ebb608d6',
      start: 3, end: 8, quoteHash: '8ed3f6ad685b959ead7022518e1af76cd816f8e8ec7ccdda1ed4018e8f2223f8' }],
    sourceFree: false, createdAt: conversation.createdAt }]);
  vi.mocked(conversationApi.turn).mockResolvedValue({ ...succeeded, toolCalls: [{ callId: 'call-1', ordinal: 1,
    toolName: 'notes_search', argumentsJson: { query: 'alpha' }, resultJson: { hits: [], mode: 'keyword_fallback' },
    status: 'succeeded', sourceRefs: [], errorCode: null }] });
  const openNote = vi.fn();
  render(<AssistantView pathname="/assistant?conversationId=conversation-1" onOpenNote={openNote} />);
  expect(await screen.findByText('回答')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /来源 1 · 笔记 A/ }));
  expect(await screen.findByLabelText('引用原文定位')).toBeInTheDocument();
  expect(screen.getByText('alpha', { selector: 'mark' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '打开当前笔记' }));
  expect(openNote).toHaveBeenCalledWith('note-1');
  fireEvent.click(screen.getByText('检索与调用记录'));
  expect(await screen.findByText(/检索笔记/)).toBeInTheDocument();
  expect(screen.getByText(/索引无可用结果，已改用关键词检索/)).toBeInTheDocument();
});

it('中断轮次可重试，模型不可用时仍可回看消息且不能发送', async () => {
  vi.mocked(conversationApi.list).mockResolvedValue([conversation]);
  vi.mocked(conversationApi.messages).mockResolvedValue([{ messageId: 'message-1', turnId: 'turn-1', sequence: 1,
    role: 'user', content: '未完成的问题', sourceRefs: [], sourceFree: true, createdAt: conversation.createdAt }]);
  vi.mocked(conversationApi.turn).mockResolvedValue({ ...succeeded, status: 'interrupted', phase: 'finished', errorCode: 'AI_PROVIDER_UNAVAILABLE' });
  vi.mocked(assistantApi.status).mockResolvedValue({ provider: 'deepseek', modelId: 'deepseek-flash',
    configured: true, executionLocation: 'server', generationAvailable: false,
    unavailableReason: '模型服务暂时不可用。', budget: null,
    capabilities: { readScopes: ['note', 'folder'], actions: ['answer', 'cancel'], responseMode: 'polling',
      writeTools: false, providerAdvertised: null, providerVerified: false } });
  render(<AssistantView pathname="/assistant?conversationId=conversation-1" onOpenNote={vi.fn()} />);
  expect(await screen.findByText('未完成的问题', { selector: 'p' })).toBeInTheDocument();
  expect(screen.getByText('模型服务暂时不可用。')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '重试本轮' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '发送消息' })).toBeDisabled();
});

it('首次授权明确的知识空间范围后，提问使用该授权并可撤销', async () => {
  const policy = { policyId: 'policy-1', revision: 1, spaceId: 'space-1',
    scope: { kind: 'library' as const }, egress: true, recipients: ['deepseek'],
    expiresAt: '2030-01-01T00:00:00.000Z', revokedAt: null };
  vi.mocked(conversationApi.createPolicy).mockResolvedValue(policy);
  vi.mocked(conversationApi.create).mockImplementation(async (_space, id) => ({ ...conversation, conversationId: id }));
  vi.mocked(conversationApi.send).mockResolvedValue({ ...succeeded, status: 'running', phase: 'generating' });
  vi.mocked(conversationApi.revokePolicy).mockResolvedValue({ ...policy, revision: 2, revokedAt: '2026-09-28T00:00:00.000Z' });
  render(<AssistantView pathname="/assistant?new=1" onOpenNote={vi.fn()} />);
  await screen.findByText('服务器执行');
  fireEvent.click(screen.getByRole('button', { name: '设置读取范围' }));
  expect(await screen.findByRole('dialog', { name: '授权助手读取资料' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '确认授权' }));
  await waitFor(() => expect(conversationApi.createPolicy).toHaveBeenCalledWith(expect.objectContaining({
    spaceId: 'space-1', scope: { kind: 'library' }, expiresAt: expect.any(String)
  })));
  fireEvent.change(screen.getByRole('textbox', { name: '消息' }), { target: { value: '总结资料' } });
  fireEvent.click(screen.getByRole('button', { name: '发送消息' }));
  await waitFor(() => expect(conversationApi.send).toHaveBeenCalledWith(expect.any(String),
    expect.objectContaining({ content: '总结资料', requestedPolicyId: 'policy-1' })));
  fireEvent.click(screen.getByRole('button', { name: '撤销此授权' }));
  await waitFor(() => expect(conversationApi.revokePolicy).toHaveBeenCalledWith(policy));
});

it('运行轮次可停止，中断轮次可显式重试', async () => {
  vi.mocked(conversationApi.list).mockResolvedValue([conversation]);
  vi.mocked(conversationApi.messages).mockResolvedValue([{ messageId: 'message-1', turnId: 'turn-1', sequence: 1,
    role: 'user', content: '待处理的问题', sourceRefs: [], sourceFree: true, createdAt: conversation.createdAt }]);
  vi.mocked(conversationApi.turn).mockResolvedValueOnce({ ...succeeded, status: 'running', phase: 'retrieving' })
    .mockResolvedValue({ ...succeeded, status: 'interrupted', phase: 'finished' });
  vi.mocked(conversationApi.cancel).mockResolvedValue({ ...succeeded, status: 'cancelled' });
  vi.mocked(conversationApi.retry).mockResolvedValue({ ...succeeded, status: 'running', phase: 'waiting' });
  render(<AssistantView pathname="/assistant?conversationId=conversation-1" onOpenNote={vi.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: '停止生成' }));
  await waitFor(() => expect(conversationApi.cancel).toHaveBeenCalledWith('conversation-1', 'turn-1'));
  fireEvent.click(await screen.findByRole('button', { name: '重试本轮' }));
  await waitFor(() => expect(conversationApi.retry).toHaveBeenCalledWith('conversation-1', 'turn-1'));
});

it('安全继续调用resume，不改走显式retry', async () => {
  vi.mocked(conversationApi.list).mockResolvedValue([conversation]);
  vi.mocked(conversationApi.messages).mockResolvedValue([{ messageId: 'message-1', turnId: 'turn-1', sequence: 1,
    role: 'user', content: '中断问题', sourceRefs: [], sourceFree: true, createdAt: conversation.createdAt }]);
  vi.mocked(conversationApi.turn).mockResolvedValue({ ...succeeded, status: 'interrupted' });
  vi.mocked(conversationApi.resume).mockResolvedValue({ ...succeeded, status: 'running' });
  render(<AssistantView pathname="/assistant?conversationId=conversation-1" onOpenNote={vi.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: '从检查点继续' }));
  await waitFor(() => expect(conversationApi.resume).toHaveBeenCalledWith('conversation-1', 'turn-1'));
  expect(conversationApi.retry).not.toHaveBeenCalled();
});

it('未知发送不能安全继续，显式重试前确认可能重复费用', async () => {
  vi.mocked(conversationApi.list).mockResolvedValue([conversation]);
  vi.mocked(conversationApi.messages).mockResolvedValue([{ messageId: 'message-1', turnId: 'turn-1', sequence: 1,
    role: 'user', content: '发送中断问题', sourceRefs: [], sourceFree: true, createdAt: conversation.createdAt }]);
  vi.mocked(conversationApi.turn).mockResolvedValue({ ...succeeded, status: 'interrupted',
    modelAttempts: [{ attemptId: 'unknown', status: 'unknown', actualMicrounits: null, ordinal: 1, modelResult: null }] });
  vi.mocked(conversationApi.retry).mockResolvedValue({ ...succeeded, status: 'running' });
  render(<AssistantView pathname="/assistant?conversationId=conversation-1" onOpenNote={vi.fn()} />);
  expect(await screen.findByRole('button', { name: '从检查点继续' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '重试本轮' }));
  await screen.findByRole('dialog', { name: '确认重新调用模型' }); expect(conversationApi.retry).not.toHaveBeenCalled();
  expect(screen.getByText(/重试会重新调用模型/)).toHaveTextContent('重复费用');
  fireEvent.click(screen.getByRole('button', { name: '确认重试本轮' }));
  await waitFor(() => expect(conversationApi.retry).toHaveBeenCalledWith('conversation-1', 'turn-1'));
  expect(conversationApi.resume).not.toHaveBeenCalled();
});

it('旧版任务走历史只读入口，不显示旧版创建与取消操作', async () => {
  const job = { jobId: 'old-job', spaceId: 'space-1', question: '旧问题',
    status: 'succeeded' as const, phase: 'finished', modelId: 'deepseek-flash',
    createdAt: conversation.createdAt, updatedAt: conversation.updatedAt,
    result: { answer: '旧回答', citations: [] } };
  vi.mocked(assistantApi.listLegacy).mockResolvedValue([job]);
  vi.mocked(assistantApi.getLegacy).mockResolvedValue(job);
  render(<AssistantView pathname="/assistant?view=legacy" onOpenNote={vi.fn()} />);
  expect(await screen.findByText('旧回答')).toBeInTheDocument();
  expect(assistantApi.listLegacy).toHaveBeenCalledWith('space-1');
  expect(screen.queryByRole('button', { name: '预览发送范围' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '取消任务' })).not.toBeInTheDocument();
});

it('消息读取后轮次完成时补读结果，不能因新终态停在旧用户消息', async () => {
  const user = { messageId: 'race-user', turnId: 'turn-1', sequence: 1,
    role: 'user' as const, content: '生成合成笔记', sourceRefs: [], sourceFree: true, createdAt: conversation.createdAt };
  const answer = { ...user, messageId: 'race-answer', sequence: 2, role: 'assistant' as const,
    content: '已生成笔记计划，尚未写入。请在执行记录中查看差异并确认。' };
  vi.mocked(conversationApi.list).mockResolvedValue([conversation]);
  // 两个请求之间服务器已完成；旧消息快照与新终态都是合法响应。
  vi.mocked(conversationApi.messages).mockResolvedValueOnce([user]).mockResolvedValue([user, answer]);
  vi.mocked(conversationApi.turn).mockResolvedValue({ ...succeeded, assistantMessageId: answer.messageId });
  render(<AssistantView pathname="/assistant?conversationId=conversation-1" onOpenNote={vi.fn()} />);
  expect(await screen.findByText(answer.content, { selector: 'p' })).toBeInTheDocument();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const raceUser = { messageId: 'race-user', turnId: 'turn-1', sequence: 1,
  role: 'user' as const, content: '合成问题', sourceRefs: [], sourceFree: true, createdAt: conversation.createdAt };
const raceAnswer = { ...raceUser, messageId: 'race-answer', sequence: 2, role: 'assistant' as const, content: '新的完整合成回答' };

it('晚到的旧消息读取不覆盖已经展示的新快照', async () => {
  const oldRead = deferred<typeof raceUser[]>();
  vi.mocked(conversationApi.list).mockResolvedValue([conversation]);
  vi.mocked(conversationApi.messages).mockReturnValueOnce(oldRead.promise).mockResolvedValue([raceUser, raceAnswer]);
  vi.mocked(conversationApi.turn).mockResolvedValue({ ...succeeded, assistantMessageId: raceAnswer.messageId });
  render(<AssistantView pathname="/assistant?conversationId=conversation-1" onOpenNote={vi.fn()} />);
  await waitFor(() => expect(conversationApi.messages).toHaveBeenCalledOnce());
  fireEvent(window, new Event('online'));
  expect(await screen.findByText(raceAnswer.content, { selector: 'p' })).toBeInTheDocument();
  await act(async () => { oldRead.resolve([raceUser]); await oldRead.promise; });
  expect(screen.getByText(raceAnswer.content, { selector: 'p' })).toBeInTheDocument();
});

it('切换会话再回来后，旧会话同ID的未完成读取仍然失效', async () => {
  const oldRead = deferred<typeof raceUser[]>();
  const second = { ...conversation, conversationId: 'conversation-2' };
  const secondAnswer = { ...raceAnswer, messageId: 'second-answer', turnId: 'turn-2', content: '第二会话合成回答' };
  vi.mocked(conversationApi.list).mockResolvedValue([conversation, second]);
  vi.mocked(conversationApi.messages).mockReturnValueOnce(oldRead.promise)
    .mockResolvedValueOnce([secondAnswer]).mockResolvedValue([raceUser, raceAnswer]);
  vi.mocked(conversationApi.turn).mockImplementation(async (id, turnId) => ({ ...succeeded,
    conversationId: id, turnId, assistantMessageId: id === second.conversationId ? secondAnswer.messageId : raceAnswer.messageId }));
  const view = render(<AssistantView pathname="/assistant?conversationId=conversation-1" onOpenNote={vi.fn()} />);
  await waitFor(() => expect(conversationApi.messages).toHaveBeenCalledOnce());
  view.rerender(<AssistantView pathname="/assistant?conversationId=conversation-2" onOpenNote={vi.fn()} />);
  expect(await screen.findByText(secondAnswer.content, { selector: 'p' })).toBeInTheDocument();
  view.rerender(<AssistantView pathname="/assistant?conversationId=conversation-1" onOpenNote={vi.fn()} />);
  expect(await screen.findByText(raceAnswer.content, { selector: 'p' })).toBeInTheDocument();
  await act(async () => { oldRead.resolve([raceUser]); await oldRead.promise; });
  expect(screen.getByText(raceAnswer.content, { selector: 'p' })).toBeInTheDocument();
});

it('终态缺失的答案补读仍不一致时明确报错并提供重新加载', async () => {
  vi.mocked(conversationApi.list).mockResolvedValue([conversation]);
  vi.mocked(conversationApi.messages).mockResolvedValue([raceUser]);
  vi.mocked(conversationApi.turn).mockResolvedValue({ ...succeeded, assistantMessageId: raceAnswer.messageId });
  render(<AssistantView pathname="/assistant?conversationId=conversation-1" onOpenNote={vi.fn()} />);
  expect(await screen.findByText(/回答已完成，但消息尚未完整读取/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '重新加载助手' })).toBeEnabled();
  expect(conversationApi.messages).toHaveBeenCalledTimes(2);
});
