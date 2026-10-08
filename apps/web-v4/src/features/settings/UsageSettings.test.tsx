import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { UsageSettings } from './UsageSettings';
import { downloadTextFile } from '../../browser/downloadFile';
import { assistantApi, type AssistantUsage, type UsageTotals } from '../assistant/assistantApi';

vi.mock('../assistant/assistantApi', () => ({ assistantApi: { usage: vi.fn(), balance: vi.fn(), refreshBalance: vi.fn(), resolveUnknown: vi.fn(), exportUsage: vi.fn() } }));
vi.mock('../../browser/downloadFile', () => ({ downloadTextFile: vi.fn() }));

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
    modelId: 'deepseek-flash', inputTokens: 200, outputTokens: 20, cacheHitTokens: null, conversationId: 'c-1', priceVersion: 'p1' }],
  unknown: [], archive: [] };

it('显示今日/本月/累计、未知请求占用与最近请求，并标明数据来自本机', async () => {
  vi.mocked(assistantApi.usage).mockResolvedValue(usage);
  render(<UsageSettings />);
  expect((await screen.findAllByText('¥0.30')).length).toBeGreaterThan(0);
  expect(screen.getByText('¥0.40')).toBeInTheDocument();
  expect(screen.getByText('¥0.80')).toBeInTheDocument();
  expect(screen.getByText(/这是本机记录的数据/)).toBeInTheDocument();
  expect(screen.getByText(/1 次请求结果未知，按最坏情况共占用 ¥1\.00/)).toBeInTheDocument();
  expect(screen.getByRole('table', { name: '最近请求' })).toHaveTextContent('deepseek-flash');
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

const unknownRow = { attemptId: 'a-9', day: '2026-10-08', at: '2026-10-08T02:30:00.000Z', status: 'unknown' as const, costMicrounits: 1_000_000,
  reservedMicrounits: 1_000_000, modelId: 'deepseek-flash', inputTokens: null, outputTokens: null, cacheHitTokens: null, conversationId: 'c-2', priceVersion: 'p1' };

it('结果未知的请求：释放需二次确认，按金额结算校验不超过占用额，处理后列表刷新', async () => {
  vi.mocked(assistantApi.usage).mockResolvedValue({ ...usage, unknown: [unknownRow] });
  vi.mocked(assistantApi.resolveUnknown).mockResolvedValue({ ...usage, unknown: [] });
  render(<UsageSettings />);
  expect(await screen.findByText('结果未知的请求（1）')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('实际金额（元）'), { target: { value: '5' } });
  fireEvent.click(screen.getByRole('button', { name: '按金额结算' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('不超过 ¥1.00');
  expect(assistantApi.resolveUnknown).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('实际金额（元）'), { target: { value: '0.25' } });
  fireEvent.click(screen.getByRole('button', { name: '按金额结算' }));
  await waitFor(() => expect(assistantApi.resolveUnknown).toHaveBeenCalledWith({ attemptId: 'a-9', disposition: 'settled', actualMicrounits: 250_000 }));
  await waitFor(() => expect(screen.queryByText('结果未知的请求（1）')).not.toBeInTheDocument());
});

it('释放占用需先确认没有扣费', async () => {
  vi.mocked(assistantApi.usage).mockResolvedValue({ ...usage, unknown: [unknownRow] });
  vi.mocked(assistantApi.resolveUnknown).mockResolvedValue({ ...usage, unknown: [] });
  render(<UsageSettings />);
  fireEvent.click(await screen.findByRole('button', { name: '释放占用' }));
  expect(assistantApi.resolveUnknown).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '确认没有扣费，释放' }));
  await waitFor(() => expect(assistantApi.resolveUnknown).toHaveBeenCalledWith({ attemptId: 'a-9', disposition: 'released' }));
});

it('导出 CSV 触发下载；明细折叠的月份给出说明；导出失败给出提示', async () => {
  vi.mocked(assistantApi.usage).mockResolvedValue({ ...usage, archive: [{ month: '2026-05', requests: 12, spentMicrounits: 3_500_000 }] });
  vi.mocked(assistantApi.exportUsage).mockResolvedValueOnce('csv-body').mockRejectedValueOnce(new Error('导出失败，请稍后重试。'));
  render(<UsageSettings />);
  expect(await screen.findByText(/明细保留 90 天；更早的已折叠为月汇总（2026-05：¥3\.50 \/ 12 次）/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '导出 CSV' }));
  await waitFor(() => expect(downloadTextFile).toHaveBeenCalledWith('knowra-ai-usage.csv', 'csv-body', 'text/csv;charset=utf-8'));
  fireEvent.click(screen.getByRole('button', { name: '导出 CSV' }));
  expect(await screen.findByText('导出失败，请稍后重试。')).toBeInTheDocument();
});
