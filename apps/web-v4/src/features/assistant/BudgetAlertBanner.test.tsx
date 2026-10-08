import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BudgetAlertBanner } from './BudgetAlertBanner';
import { assistantApi, type BudgetAlert, type BudgetAlerts } from './assistantApi';

const navigate = vi.fn();
vi.mock('../../app/router', () => ({ useNavigate: () => navigate }));
vi.mock('./assistantApi', () => ({ assistantApi: { alerts: vi.fn(), markAlerts: vi.fn(), allowRule: vi.fn(), budgetSettings: vi.fn(), saveBudgetSettings: vi.fn() } }));

const alert = (threshold: number, over: Partial<BudgetAlert> = {}): BudgetAlert => ({ id: `daily:2026-10-08:${threshold}`, rule: 'daily', threshold,
  period: '2026-10-08', mode: 'stop', usedMicrounits: threshold * 200_000, limitMicrounits: 20_000_000, notified: true, dismissed: false, ...over });
const state = (alerts: BudgetAlert[], overrides: BudgetAlerts['overrides'] = []): BudgetAlerts => ({ day: '2026-10-08', location: 'local', alerts, overrides });

beforeEach(() => {
  vi.resetAllMocks();
  delete (window as { knowraDesktop?: unknown }).knowraDesktop;
});

it('只展示最高的已越过阈值；“继续”把同规则的所有阈值标为已关闭', async () => {
  vi.mocked(assistantApi.alerts).mockResolvedValue(state([alert(50), alert(80)]));
  vi.mocked(assistantApi.markAlerts).mockResolvedValue(state([alert(50, { dismissed: true }), alert(80, { dismissed: true })]));
  render(<BudgetAlertBanner />);
  expect(await screen.findByText(/今日 AI 费用已达上限的 80%/)).toBeInTheDocument();
  expect(screen.queryByText(/的 50%/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '继续' }));
  await waitFor(() => expect(assistantApi.markAlerts).toHaveBeenCalledWith(['daily:2026-10-08:50', 'daily:2026-10-08:80'], 'dismissed'));
  await waitFor(() => expect(screen.queryByRole('region')).not.toBeInTheDocument());
});

it('达到即停并 100% 时显示已暂停，可放行当日或去提高上限', async () => {
  vi.mocked(assistantApi.alerts).mockResolvedValue(state([alert(50), alert(80), alert(100)]));
  vi.mocked(assistantApi.allowRule).mockResolvedValue(state([alert(100)], [{ rule: 'daily', period: '2026-10-08' }]));
  render(<BudgetAlertBanner />);
  expect(await screen.findByRole('alert')).toHaveTextContent('今日费用已达上限，AI 已暂停');
  expect(screen.queryByRole('button', { name: /暂停 AI 至/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '提高上限' }));
  expect(navigate).toHaveBeenCalledWith('/settings');
  fireEvent.click(screen.getByRole('button', { name: '今日放行' }));
  await waitFor(() => expect(assistantApi.allowRule).toHaveBeenCalledWith('daily'));
  expect(await screen.findByText(/今日已放行/)).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('“暂停 AI”把该规则改为达到即停，上限等于当前已用额', async () => {
  vi.mocked(assistantApi.alerts).mockResolvedValue(state([alert(50, { mode: 'warn' }), alert(80, { mode: 'warn' })]));
  const rules = { daily: { mode: 'warn', limitMicrounits: 20_000_000 }, monthly: { mode: 'off', limitMicrounits: null },
    turn: { mode: 'stop', limitMicrounits: 2_000_000 }, balanceFloor: { mode: 'off', limitMicrounits: null } } as const;
  vi.mocked(assistantApi.budgetSettings).mockResolvedValue({ rules, price: null, alerts: { thresholds: [50, 80, 100] } });
  vi.mocked(assistantApi.saveBudgetSettings).mockResolvedValue({ rules, price: null, alerts: { thresholds: [50, 80, 100] } });
  vi.mocked(assistantApi.markAlerts).mockResolvedValue(state([]));
  render(<BudgetAlertBanner />);
  fireEvent.click(await screen.findByRole('button', { name: '暂停 AI 至明天' }));
  await waitFor(() => expect(assistantApi.saveBudgetSettings).toHaveBeenCalled());
  const sent = vi.mocked(assistantApi.saveBudgetSettings).mock.calls[0][0];
  expect(sent.rules.daily).toEqual({ mode: 'stop', limitMicrounits: 16_000_000 });
  expect(sent.rules.turn).toEqual({ mode: 'stop', limitMicrounits: 2_000_000 });
});

it('Mac 版对每条规则只发一次系统通知并记为已通知；网页版不发系统通知', async () => {
  const created: Array<{ title: string; body: string }> = [];
  class FakeNotification {
    static permission = 'granted';
    constructor(title: string, options: { body: string }) { created.push({ title, body: options.body }); }
  }
  vi.stubGlobal('Notification', FakeNotification);
  try {
    const fresh = [alert(50, { notified: false }), alert(80, { notified: false })];
    vi.mocked(assistantApi.alerts).mockImplementation(async () => state(fresh));
    vi.mocked(assistantApi.markAlerts).mockResolvedValue(state(fresh.map(item => ({ ...item, notified: true }))));
    render(<BudgetAlertBanner />);
    await screen.findByText(/80%/);
    expect(created).toHaveLength(0);
    expect(assistantApi.markAlerts).not.toHaveBeenCalled();
    (window as { knowraDesktop?: unknown }).knowraDesktop = {};
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    await waitFor(() => expect(assistantApi.markAlerts).toHaveBeenCalledWith(['daily:2026-10-08:50', 'daily:2026-10-08:80'], 'notified'));
    expect(created).toHaveLength(1);
    expect(created[0].title).toContain('80%');
  } finally { vi.unstubAllGlobals(); }
});

it('读取提醒失败时不显示任何横幅', async () => {
  vi.mocked(assistantApi.alerts).mockRejectedValue(new Error('x'));
  render(<BudgetAlertBanner />);
  await waitFor(() => expect(assistantApi.alerts).toHaveBeenCalled());
  expect(screen.queryByRole('region')).not.toBeInTheDocument();
});
