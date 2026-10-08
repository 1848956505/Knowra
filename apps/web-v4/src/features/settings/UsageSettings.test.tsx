import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { UsageSettings } from './UsageSettings';
import { notifyCredentialChanged } from './credentialEvents';
import { ApiRequestError } from '@study-accelerator/web-core';
import { assistantApi, type AssistantUsage, type UsageTotals } from '../assistant/assistantApi';

vi.mock('../assistant/assistantApi', () => ({ assistantApi: { usage: vi.fn(), balance: vi.fn(), refreshBalance: vi.fn() } }));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(assistantApi.balance).mockResolvedValue({ location: 'local', checkedAt: null, latest: null, inferred: [] });
});

const totals = (over: Partial<UsageTotals> = {}): UsageTotals => ({ requests: 0, spentMicrounits: 0, unknownRequests: 0,
  unknownMicrounits: 0, inputTokens: 0, outputTokens: 0, cacheHitTokens: 0, ...over });
const usage: AssistantUsage = { currency: 'CNY', day: '2026-10-08', location: 'local',
  today: totals({ requests: 2, spentMicrounits: 300_000 }), month: totals({ requests: 3, spentMicrounits: 400_000 }),
  total: totals({ requests: 4, spentMicrounits: 800_000, unknownRequests: 1, unknownMicrounits: 1_000_000, inputTokens: 1200, outputTokens: 70, cacheHitTokens: 600 }),
  recent: [{ attemptId: 'a-1', day: '2026-10-08', at: '2026-10-08T02:00:00.000Z', status: 'settled', costMicrounits: 300_000,
    modelId: 'deepseek-flash', inputTokens: 200, outputTokens: 20, cacheHitTokens: null, conversationId: 'c-1', priceVersion: 'p1' }] };

it('显示今日/本月/累计、未知请求占用与最近请求，并标明数据来自本机', async () => {
  vi.mocked(assistantApi.usage).mockResolvedValue(usage);
  render(<UsageSettings />);
  expect((await screen.findAllByText('¥0.30')).length).toBeGreaterThan(0);
  expect(screen.getByText('¥0.40')).toBeInTheDocument();
  expect(screen.getByText('¥0.80')).toBeInTheDocument();
  expect(screen.getByText(/这是本机记录的数据/)).toBeInTheDocument();
  expect(screen.getByText(/1 次请求结果未知，按最坏情况共占用 ¥1\.00/)).toBeInTheDocument();
  expect(screen.getByRole('table', { name: '最近请求' })).toHaveTextContent('deepseek-flash');
  expect(screen.getByRole('table', { name: '最近请求' })).toHaveTextContent('已结算');
  expect(screen.getByRole('table', { name: '最近请求' })).not.toHaveTextContent('成功');
});

it('读取失败时给出重试，不显示为零用量', async () => {
  vi.mocked(assistantApi.usage).mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce(usage);
  render(<UsageSettings />);
  expect(await screen.findByRole('alert')).toHaveTextContent('暂时无法读取用量记录');
  expect(screen.queryByText('¥0.00')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '重试读取' }));
  await waitFor(() => expect(screen.getByText('¥0.80')).toBeInTheDocument());
});

it('读取余额后显示余额与推算消耗，并提示这是推算值；失败时给出原因', async () => {
  vi.mocked(assistantApi.usage).mockResolvedValue(usage);
  vi.mocked(assistantApi.balance).mockResolvedValue({ location: 'local', checkedAt: null, latest: null, inferred: [] });
  vi.mocked(assistantApi.refreshBalance)
    .mockRejectedValueOnce(new Error('DeepSeek 拒绝了 API Key，无法读取余额。'))
    .mockResolvedValueOnce({ location: 'local', checkedAt: '2026-10-08T03:00:00.000Z',
      latest: { at: '2026-10-08T03:00:00.000Z', isAvailable: true,
        balances: [{ currency: 'CNY', totalMicrounits: 188_500_000, grantedMicrounits: 8_500_000, toppedUpMicrounits: 180_000_000 }] },
      inferred: [{ currency: 'CNY', sinceAt: '2026-10-01T00:00:00.000Z', snapshots: 4, consumedMicrounits: 11_500_000, addedMicrounits: 100_000_000, currentMicrounits: 188_500_000 }] });
  render(<UsageSettings />);
  expect(await screen.findByText('尚未读取余额。')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '读取余额' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('DeepSeek 拒绝了 API Key');
  fireEvent.click(screen.getByRole('button', { name: '读取余额' }));
  expect(await screen.findByText('¥188.50')).toBeInTheDocument();
  expect(screen.getByText(/推算消耗 ¥11\.50（共 4 个快照/)).toBeInTheDocument();
  expect(screen.getByText('可调用')).toBeInTheDocument();
});

const accountA = { location: 'local' as const, checkedAt: '2026-10-08T03:00:00.000Z',
  latest: { at: '2026-10-08T03:00:00.000Z', isAvailable: true,
    balances: [{ currency: 'CNY' as const, totalMicrounits: 100_000_000, grantedMicrounits: 0, toppedUpMicrounits: 100_000_000 }] },
  inferred: [{ currency: 'CNY' as const, sinceAt: '2026-10-01T00:00:00.000Z', snapshots: 3, consumedMicrounits: 5_000_000, addedMicrounits: 0, currentMicrounits: 100_000_000 }] };
const empty = { location: 'local' as const, checkedAt: null, latest: null, inferred: [] };

it('更换 Key 后清空旧账户的余额与推算，重新读取服务端按新凭据过滤的快照', async () => {
  vi.mocked(assistantApi.usage).mockResolvedValue(usage);
  vi.mocked(assistantApi.balance).mockResolvedValueOnce(accountA).mockResolvedValue(empty);
  render(<UsageSettings />);
  expect(await screen.findByText('¥100.00')).toBeInTheDocument();
  expect(screen.getByText(/推算消耗 ¥5\.00/)).toBeInTheDocument();
  act(() => notifyCredentialChanged());
  await waitFor(() => expect(screen.queryByText('¥100.00')).not.toBeInTheDocument());
  expect(await screen.findByText('尚未读取余额。')).toBeInTheDocument();
  expect(screen.queryByText(/自 .* 起推算消耗/)).not.toBeInTheDocument();
});

it('更换 Key 前发出的读取结果被丢弃，不会把旧账户余额显示成当前余额', async () => {
  vi.mocked(assistantApi.usage).mockResolvedValue(usage);
  let resolveRefresh!: (value: typeof accountA) => void;
  vi.mocked(assistantApi.refreshBalance).mockReturnValue(new Promise(resolve => { resolveRefresh = resolve; }));
  render(<UsageSettings />);
  fireEvent.click(await screen.findByRole('button', { name: '读取余额' }));
  act(() => notifyCredentialChanged()); // 请求在途时换了 Key
  await act(async () => { resolveRefresh(accountA); });
  expect(screen.queryByText('¥100.00')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '读取余额' })).toBeEnabled();
});

it('收到凭据已变更的错误时清除已显示的旧余额并给出原因', async () => {
  vi.mocked(assistantApi.usage).mockResolvedValue(usage);
  vi.mocked(assistantApi.balance).mockResolvedValueOnce(accountA).mockResolvedValue(empty);
  vi.mocked(assistantApi.refreshBalance).mockRejectedValue(new ApiRequestError('账户凭据在读取期间已变更，已丢弃过期的余额响应，请重新读取。', { status: 409, code: 'AI_BALANCE_STALE' }));
  render(<UsageSettings />);
  expect(await screen.findByText('¥100.00')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '读取余额' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('已丢弃过期的余额响应');
  await waitFor(() => expect(screen.queryByText('¥100.00')).not.toBeInTheDocument());
});
