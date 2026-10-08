import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ApiRequestError } from '@study-accelerator/web-core';
import { ExternalClientSettings } from './ExternalClientSettings';
import { claudeCodeSnippet, codexSnippet, externalClients, type McpOverview, type McpPairing } from './externalClients';

vi.mock('./externalClients', async importOriginal => ({ ...(await importOriginal<typeof import('./externalClients')>()),
  externalClients: { overview: vi.fn(), create: vi.fn(), revoke: vi.fn(), audit: vi.fn() } }));
const storeState = vi.hoisted(() => ({ current: null as null | Record<string, unknown> }));
vi.mock('../../store/AppStoreProvider', () => ({ useAppStore: (selector: (state: unknown) => unknown) => selector(storeState.current) }));
const loadWorkspace = vi.fn();
const workspace = (overrides: Record<string, unknown> = {}) => ({ loadWorkspace, serverData: { currentSpaceId: 'space-1',
  notes: [{ id: 'note-1', title: '细胞', spaceId: 'space-1', deleted: false }],
  foldersById: { 'folder-1': { id: 'folder-1', name: '生物', parentId: null, spaceId: 'space-1' },
    'folder-2': { id: 'folder-2', name: '细胞结构', parentId: 'folder-1', spaceId: 'space-1' },
    'folder-3': { id: 'folder-3', name: '已删除', parentId: null, spaceId: 'space-1', deletedAt: '2026-01-01' },
    'folder-4': { id: 'folder-4', name: '别的空间', parentId: null, spaceId: 'space-2' } } }, ...overrides });

const adapter = { command: '/Applications/知境·Knowra.app/Contents/MacOS/Knowra', args: ['/Applications/知境·Knowra.app/Contents/Resources/app/mcp-adapter.mjs'], env: { ELECTRON_RUN_AS_NODE: '1' } };
const pairing = (overrides: Partial<McpPairing> = {}): McpPairing => ({ pairingId: 'p-1', label: 'Claude Code', spaceId: 'space-1', scope: { kind: 'library' }, excludedNoteIds: [],
  createdAt: '2026-10-06T00:00:00Z', expiresAt: '2026-10-13T00:00:00Z', revokedAt: null, lastUsedAt: null, calls: 0, allowPropose: false, status: 'active',
  pairingFile: '/data/mcp/pairings/p-1.json', ...overrides });
const overview = (overrides: Partial<McpOverview> = {}): McpOverview => ({ items: [], aiEnabled: true, egressEnabled: true, proposalsEnabled: true, adapter, ...overrides });

beforeEach(() => {
  vi.resetAllMocks();
  loadWorkspace.mockResolvedValue(undefined);
  storeState.current = workspace();
  (globalThis as { knowraRuntime?: unknown }).knowraRuntime = { persistenceMode: 'desktop-local' };
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});
afterEach(() => { delete (globalThis as { knowraRuntime?: unknown }).knowraRuntime; });

it('网页版（非桌面本地运行端）不显示，也不请求接口', () => {
  delete (globalThis as { knowraRuntime?: unknown }).knowraRuntime;
  const { container } = render(<ExternalClientSettings />);
  expect(container).toBeEmptyDOMElement();
  expect(externalClients.overview).not.toHaveBeenCalled();
});

it('接口不存在（旧运行端）时整块隐藏，而不是显示错误', async () => {
  vi.mocked(externalClients.overview).mockRejectedValue(new ApiRequestError('missing', { status: 404, code: 'ROUTE_NOT_FOUND' }));
  const { container } = render(<ExternalClientSettings />);
  await waitFor(() => expect(container).toBeEmptyDOMElement());
});

it('AI 未开启时禁用添加并提示；外发被紧急停止时同样提示', async () => {
  vi.mocked(externalClients.overview).mockResolvedValue(overview({ aiEnabled: false }));
  const first = render(<ExternalClientSettings />);
  expect(await screen.findByText('AI 功能未开启，无法创建外部客户端配对。')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '添加外部客户端' })).toBeDisabled();
  first.unmount();
  vi.mocked(externalClients.overview).mockResolvedValue(overview({ egressEnabled: false }));
  render(<ExternalClientSettings />);
  expect(await screen.findByText('外发已被紧急停止，外部客户端暂时无法读取笔记。')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '添加外部客户端' })).toBeDisabled();
});

it('创建：弹窗按确认文案展示，未勾选确认不能创建；创建后显示连接方式且不含令牌', async () => {
  vi.mocked(externalClients.overview).mockResolvedValue(overview());
  vi.mocked(externalClients.create).mockResolvedValue(pairing());
  render(<ExternalClientSettings />);
  fireEvent.click(await screen.findByRole('button', { name: '添加外部客户端' }));
  const dialog = await screen.findByRole('dialog', { name: '允许外部 AI 客户端读取笔记？' });
  expect(dialog).toHaveTextContent('被读取的笔记片段会发送给该客户端所属的厂商（如 Anthropic、OpenAI），费用由客户端自己的订阅承担，不计入知境预算。只读取你选定范围内的笔记，不含标记为私密的笔记，不会修改或创建任何内容。可随时撤销，到期自动失效。');
  const create = within(dialog).getByRole('button', { name: '创建配对' });
  expect(create).toBeDisabled();
  fireEvent.change(within(dialog).getByRole('textbox', { name: /客户端名称/ }), { target: { value: 'Claude Code' } });
  expect(create).toBeDisabled();
  fireEvent.click(within(dialog).getByRole('checkbox', { name: '我了解所选范围内的笔记片段会发给该客户端所属的厂商' }));
  await waitFor(() => expect(create).toBeEnabled());
  expect(externalClients.create).not.toHaveBeenCalled();
  fireEvent.click(create);
  await waitFor(() => expect(externalClients.create).toHaveBeenCalledExactlyOnceWith({ label: 'Claude Code', spaceId: 'space-1',
    scope: { kind: 'library' }, expiresInDays: 7, egressConfirmed: true }));
  const connection = await screen.findByRole('dialog', { name: '连接方式：Claude Code' });
  expect(connection).toHaveTextContent('配对文件相当于访问密码，请勿分享、提交到代码仓库或放进云盘。');
  expect(connection).toHaveTextContent('/data/mcp/pairings/p-1.json');
  expect(within(connection).getByLabelText('claude 配置')).toHaveTextContent('claude mcp add-json knowra');
  expect(within(connection).getByLabelText('codex 配置')).toHaveTextContent('[mcp_servers.knowra]');
  expect(connection.textContent).not.toMatch(/knp1\./);
  fireEvent.click(within(connection).getByRole('button', { name: '复制 claude 配置' }));
  await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('claude mcp add-json knowra')));
  expect(await within(connection).findByText('已复制。')).toBeInTheDocument();
});

it('创建失败时弹窗保留并显示错误，可重试', async () => {
  vi.mocked(externalClients.overview).mockResolvedValue(overview());
  vi.mocked(externalClients.create).mockRejectedValueOnce(new Error('AI 功能未开启')).mockResolvedValueOnce(pairing());
  render(<ExternalClientSettings />);
  fireEvent.click(await screen.findByRole('button', { name: '添加外部客户端' }));
  const dialog = await screen.findByRole('dialog', { name: '允许外部 AI 客户端读取笔记？' });
  fireEvent.change(within(dialog).getByRole('textbox', { name: /客户端名称/ }), { target: { value: 'Codex' } });
  fireEvent.click(within(dialog).getByRole('checkbox', { name: /我了解/ }));
  fireEvent.click(await within(dialog).findByRole('button', { name: '创建配对' }));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('AI 功能未开启');
  fireEvent.click(within(dialog).getByRole('button', { name: '创建配对' }));
  expect(await screen.findByRole('dialog', { name: '连接方式：Claude Code' })).toBeInTheDocument();
  expect(externalClients.create).toHaveBeenCalledTimes(2);
});

it('列表显示范围、到期、最近使用与调用次数；已撤销的只能看记录', async () => {
  vi.mocked(externalClients.overview).mockResolvedValue(overview({ items: [
    pairing({ scope: { kind: 'folder', folderId: 'folder-1' }, calls: 3, lastUsedAt: '2026-10-07T01:00:00Z' }),
    pairing({ pairingId: 'p-2', label: '旧客户端', status: 'revoked', revokedAt: '2026-10-06T10:00:00Z' })] }));
  vi.mocked(externalClients.audit).mockResolvedValue([{ at: '2026-10-07T01:00:00Z', event: 'call', tool: 'notes_search', status: 'ok', fragments: 2 },
    { at: '2026-10-07T00:59:00Z', event: 'call', tool: 'notes_read', status: 'error', code: 'MCP_RATE_LIMITED' }]);
  render(<ExternalClientSettings />);
  const list = await screen.findByRole('list', { name: '已配对的外部客户端' });
  const rows = within(list).getAllByRole('listitem');
  expect(rows[0]).toHaveTextContent('Claude Code'); expect(rows[0]).toHaveTextContent('有效'); expect(rows[0]).toHaveTextContent('目录：生物'); expect(rows[0]).toHaveTextContent('共调用 3 次');
  expect(rows[1]).toHaveTextContent('已撤销');
  expect(within(rows[1]).queryByRole('button', { name: /撤销：/ })).not.toBeInTheDocument();
  expect(within(rows[1]).queryByRole('button', { name: /查看连接方式/ })).not.toBeInTheDocument();
  fireEvent.click(within(rows[0]).getByRole('button', { name: '最近调用：Claude Code' }));
  const audit = await screen.findByRole('list', { name: 'Claude Code最近调用' });
  expect(audit).toHaveTextContent('notes_search'); expect(audit).toHaveTextContent('成功，返回 2 个片段'); expect(audit).toHaveTextContent('MCP_RATE_LIMITED');
});

it('撤销需确认：取消不调用，确认后立即撤销并刷新', async () => {
  vi.mocked(externalClients.overview).mockResolvedValueOnce(overview({ items: [pairing()] }))
    .mockResolvedValue(overview({ items: [pairing({ status: 'revoked', revokedAt: '2026-10-07T02:00:00Z' })] }));
  vi.mocked(externalClients.revoke).mockResolvedValue(pairing({ status: 'revoked' }));
  render(<ExternalClientSettings />);
  fireEvent.click(await screen.findByRole('button', { name: '撤销：Claude Code' }));
  let dialog = await screen.findByRole('dialog', { name: '撤销“Claude Code”？' });
  expect(dialog).toHaveTextContent('撤销后该客户端立即无法读取笔记，配对文件会被删除');
  fireEvent.click(within(dialog).getByRole('button', { name: '取消' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(externalClients.revoke).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '撤销：Claude Code' }));
  dialog = await screen.findByRole('dialog', { name: '撤销“Claude Code”？' });
  fireEvent.click(within(dialog).getByRole('button', { name: '确认撤销' }));
  await waitFor(() => expect(externalClients.revoke).toHaveBeenCalledExactlyOnceWith('p-1'));
  expect(await screen.findByRole('status')).toHaveTextContent('该客户端立即无法读取');
  expect(await screen.findByText('已撤销')).toBeInTheDocument();
});

it('应用未内置适配器时如实提示，不生成连接方式', async () => {
  vi.mocked(externalClients.overview).mockResolvedValue(overview({ items: [pairing()], adapter: null }));
  render(<ExternalClientSettings />);
  fireEvent.click(await screen.findByRole('button', { name: '查看连接方式：Claude Code' }));
  const dialog = await screen.findByRole('dialog', { name: '连接方式：Claude Code' });
  expect(dialog).toHaveTextContent('此版本没有内置外部客户端适配器');
  expect(within(dialog).queryByLabelText('claude 配置')).not.toBeInTheDocument();
});

it('配置片段：命令与配对文件路径正确转义，不含令牌', () => {
  const quirky = { command: "/Users/o'brien/知境 App/Knowra", args: ['/a b/mcp-adapter.mjs'], env: { ELECTRON_RUN_AS_NODE: '1' } };
  const claude = claudeCodeSnippet(quirky, '/d/p "1".json');
  expect(claude.startsWith("claude mcp add-json knowra '")).toBe(true);
  const json = JSON.parse(claude.slice("claude mcp add-json knowra '".length, -1).replaceAll("'\\''", "'"));
  expect(json).toEqual({ type: 'stdio', command: quirky.command, args: ['/a b/mcp-adapter.mjs', '--pairing-file', '/d/p "1".json'], env: { ELECTRON_RUN_AS_NODE: '1' } });
  const codex = codexSnippet(quirky, '/d/p "1".json');
  expect(codex).toBe(['[mcp_servers.knowra]', 'command = "/Users/o\'brien/知境 App/Knowra"',
    'args = ["/a b/mcp-adapter.mjs", "--pairing-file", "/d/p \\"1\\".json"]', '', '[mcp_servers.knowra.env]', 'ELECTRON_RUN_AS_NODE = "1"'].join('\n'));
  expect(codexSnippet({ command: 'node', args: ['x.mjs'], env: {} }, '/f.json')).not.toContain('env');
});

it('桌面本地运行端的设置页多一项并在“模型接入”分类里显示；网页版计数不变', async () => {
  const { SettingsView } = await import('./SettingsView');
  const { defaultAppPreferences } = await import('./preferences');
  vi.mocked(externalClients.overview).mockResolvedValue(overview());
  const view = <SettingsView preferences={defaultAppPreferences} sidebarOpen onPreferencesChange={() => {}} onSidebarOpenChange={() => {}} />;
  const desktop = render(view);
  expect(screen.getByText('显示 8 / 8 项设置')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /模型接入/ }));
  expect(screen.getByText('显示 4 / 8 项设置')).toBeInTheDocument();
  expect(await screen.findByRole('heading', { name: '外部 AI 客户端' })).toBeInTheDocument();
  desktop.unmount();
  delete (globalThis as { knowraRuntime?: unknown }).knowraRuntime;
  render(view);
  expect(screen.getByText('显示 7 / 7 项设置')).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: '外部 AI 客户端' })).not.toBeInTheDocument();
});

it('子目录也能选为授权范围：目录以“父 / 子”路径显示，已删除与其他空间的目录不出现', async () => {
  vi.mocked(externalClients.overview).mockResolvedValue(overview());
  vi.mocked(externalClients.create).mockResolvedValue(pairing({ scope: { kind: 'folder', folderId: 'folder-2' } }));
  render(<ExternalClientSettings />);
  fireEvent.click(await screen.findByRole('button', { name: '添加外部客户端' }));
  const dialog = await screen.findByRole('dialog', { name: '允许外部 AI 客户端读取笔记？' });
  fireEvent.change(within(dialog).getByRole('textbox', { name: /客户端名称/ }), { target: { value: '子目录' } });
  fireEvent.click(within(dialog).getByRole('checkbox', { name: /我了解/ }));
  fireEvent.click(within(dialog).getByRole('button', { name: /授权范围/ }));
  fireEvent.click(await screen.findByRole('option', { name: '一个目录' }));
  fireEvent.click(within(dialog).getByRole('button', { name: /生物/ }));
  const options = (await screen.findAllByRole('option')).map(option => option.textContent);
  expect(options).toEqual(['生物', '生物 / 细胞结构']);
  fireEvent.click(screen.getByRole('option', { name: '生物 / 细胞结构' }));
  fireEvent.click(within(dialog).getByRole('button', { name: '创建配对' }));
  await waitFor(() => expect(externalClients.create).toHaveBeenCalledExactlyOnceWith({ label: '子目录', spaceId: 'space-1',
    scope: { kind: 'folder', folderId: 'folder-2' }, expiresInDays: 7, egressConfirmed: true }));
});

it('直接打开或刷新设置页时工作区尚未加载：补加载，加载完成前提示并禁用添加，完成后可添加', async () => {
  vi.mocked(externalClients.overview).mockResolvedValue(overview());
  storeState.current = workspace({ serverData: { currentSpaceId: null, notes: [], foldersById: {} } });
  const view = render(<ExternalClientSettings />);
  await waitFor(() => expect(loadWorkspace).toHaveBeenCalledTimes(1));
  expect(await screen.findByText('正在加载知识空间，加载完成后即可添加。')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '添加外部客户端' })).toBeDisabled();
  storeState.current = workspace();
  view.rerender(<ExternalClientSettings />);
  await waitFor(() => expect(screen.getByRole('button', { name: '添加外部客户端' })).toBeEnabled());
  expect(screen.queryByText('正在加载知识空间，加载完成后即可添加。')).not.toBeInTheDocument();
  expect(loadWorkspace).toHaveBeenCalledTimes(1);
});

it('允许提交候选：默认关闭；勾选后显示说明并要求额外确认，创建请求带上两个确认；列表显示标签', async () => {
  vi.mocked(externalClients.overview).mockResolvedValue(overview());
  vi.mocked(externalClients.create).mockResolvedValue(pairing({ allowPropose: true }));
  render(<ExternalClientSettings />);
  fireEvent.click(await screen.findByRole('button', { name: '添加外部客户端' }));
  const dialog = await screen.findByRole('dialog', { name: '允许外部 AI 客户端读取笔记？' });
  const option = within(dialog).getByRole('checkbox', { name: '同时允许该客户端提交待审核的知识候选（默认不允许）' });
  expect(option).not.toBeChecked();
  expect(dialog).not.toHaveTextContent('每天最多提交 200 条');
  fireEvent.change(within(dialog).getByRole('textbox', { name: /客户端名称/ }), { target: { value: 'Claude Code' } });
  fireEvent.click(within(dialog).getByRole('checkbox', { name: /我了解所选范围内的笔记片段会发给/ }));
  fireEvent.click(option);
  expect(dialog).toHaveTextContent('开启后，该客户端可以把它从你笔记里提炼的内容作为待审核的知识候选提交到知境。候选不会自动入库，也不会被确认，需要你在知识库逐条审核；它只能引用自己已读取过的原文，每天最多提交 200 条。仍需要“AI 提炼知识点”开关处于开启状态。');
  const create = within(dialog).getByRole('button', { name: '创建配对' });
  expect(create).toBeDisabled();
  fireEvent.click(within(dialog).getByRole('checkbox', { name: '我了解提交的候选由客户端的模型生成，可能有误，我会在知识库逐条审核' }));
  await waitFor(() => expect(create).toBeEnabled());
  // 取消勾选提交选项后，额外确认随之清空，不会带着旧的确认提交。
  fireEvent.click(option); fireEvent.click(option);
  expect(within(dialog).getByRole('checkbox', { name: /我了解提交的候选/ })).not.toBeChecked();
  expect(create).toBeDisabled();
  fireEvent.click(within(dialog).getByRole('checkbox', { name: /我了解提交的候选/ }));
  await waitFor(() => expect(create).toBeEnabled());
  fireEvent.click(create);
  await waitFor(() => expect(externalClients.create).toHaveBeenCalledExactlyOnceWith({ label: 'Claude Code', spaceId: 'space-1', scope: { kind: 'library' },
    expiresInDays: 7, egressConfirmed: true, allowPropose: true, proposeConfirmed: true }));
});

it('只读配对不显示“可提交候选”；开启提交的配对显示标签，全局“AI 提炼知识点”未开启时提示暂不能提交', async () => {
  vi.mocked(externalClients.overview).mockResolvedValue(overview({ proposalsEnabled: false, items: [
    pairing({ label: '只读', pairingId: 'p-ro' }), pairing({ label: '可提交', pairingId: 'p-rw', allowPropose: true }),
    pairing({ label: '已撤销可提交', pairingId: 'p-old', allowPropose: true, status: 'revoked' })] }));
  render(<ExternalClientSettings />);
  const rows = within(await screen.findByRole('list', { name: '已配对的外部客户端' })).getAllByRole('listitem');
  expect(rows[0]).not.toHaveTextContent('可提交候选'); expect(rows[0]).not.toHaveTextContent('暂不能提交');
  expect(rows[1]).toHaveTextContent('可提交候选'); expect(rows[1]).toHaveTextContent('“AI 提炼知识点”未开启，暂不能提交');
  expect(rows[2]).not.toHaveTextContent('暂不能提交');
});

it('“AI 提炼知识点”已开启时不显示暂不能提交的提示', async () => {
  vi.mocked(externalClients.overview).mockResolvedValue(overview({ items: [pairing({ allowPropose: true })] }));
  render(<ExternalClientSettings />);
  const row = within(await screen.findByRole('list', { name: '已配对的外部客户端' })).getByRole('listitem');
  expect(row).toHaveTextContent('可提交候选'); expect(row).not.toHaveTextContent('暂不能提交');
});
