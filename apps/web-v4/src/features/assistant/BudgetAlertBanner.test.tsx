import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BudgetAlertBanner } from './BudgetAlertBanner';
import { assistantApi, type BudgetAlert, type BudgetAlerts } from './assistantApi';
import { ASSISTANT_STATUS_CHANGED_EVENT } from './assistantEvents';

const navigate = vi.fn();
vi.mock('../../app/router', () => ({ useNavigate: () => navigate }));
vi.mock('./assistantApi', () => ({ assistantApi: { alerts: vi.fn(), markAlerts: vi.fn(), allowRule: vi.fn(), pauseRule: vi.fn(), resumeRule: vi.fn() } }));

const alert = (threshold: number, over: Partial<BudgetAlert> = {}): BudgetAlert => ({ id: `daily:2026-10-08:${threshold}`, rule: 'daily', threshold,
  period: '2026-10-08', mode: 'stop', usedMicrounits: threshold * 200_000, limitMicrounits: 20_000_000, notified: true, dismissed: false, ...over });
const state = (alerts: BudgetAlert[], overrides: BudgetAlerts['overrides'] = [], pauses: BudgetAlerts['pauses'] = []): BudgetAlerts => ({ day: '2026-10-08', location: 'local', alerts, overrides, pauses });

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

it('“暂停 AI”只记录本周期暂停，不改写预算设置；暂停后显示恢复入口，可提前恢复', async () => {
  const alerts = [alert(50, { mode: 'warn' }), alert(80, { mode: 'warn' })];
  vi.mocked(assistantApi.alerts).mockResolvedValue(state(alerts));
  vi.mocked(assistantApi.pauseRule).mockResolvedValue(state(alerts, [], [{ rule: 'daily', period: '2026-10-08' }]));
  vi.mocked(assistantApi.markAlerts).mockResolvedValue(state(alerts.map(item => ({ ...item, dismissed: true })), [], [{ rule: 'daily', period: '2026-10-08' }]));
  vi.mocked(assistantApi.resumeRule).mockResolvedValue(state([]));
  render(<BudgetAlertBanner />);
  fireEvent.click(await screen.findByRole('button', { name: '暂停 AI 至明天' }));
  await waitFor(() => expect(assistantApi.pauseRule).toHaveBeenCalledWith('daily'));
  expect(await screen.findByText(/AI 已暂停至明天/)).toBeInTheDocument();
  expect(screen.queryByText(/的 80%/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '立即恢复' }));
  await waitFor(() => expect(assistantApi.resumeRule).toHaveBeenCalledWith('daily'));
  await waitFor(() => expect(screen.queryByRole('region')).not.toBeInTheDocument());
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

it('放行后通知助手视图刷新状态', async () => {
  const changed = vi.fn();
  window.addEventListener(ASSISTANT_STATUS_CHANGED_EVENT, changed);
  try {
    vi.mocked(assistantApi.alerts).mockResolvedValue(state([alert(100)]));
    vi.mocked(assistantApi.allowRule).mockResolvedValue(state([alert(100)], [{ rule: 'daily', period: '2026-10-08' }]));
    render(<BudgetAlertBanner />);
    fireEvent.click(await screen.findByRole('button', { name: '今日放行' }));
    await waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
  } finally { window.removeEventListener(ASSISTANT_STATUS_CHANGED_EVENT, changed); }
});

it('仅关闭横幅不改变助手能否调用，不通知', async () => {
  const changed = vi.fn();
  window.addEventListener(ASSISTANT_STATUS_CHANGED_EVENT, changed);
  try {
    vi.mocked(assistantApi.alerts).mockResolvedValue(state([alert(100)]));
    vi.mocked(assistantApi.markAlerts).mockResolvedValue(state([alert(100, { dismissed: true })]));
    render(<BudgetAlertBanner />);
    fireEvent.click(await screen.findByRole('button', { name: '关闭提示' }));
    await waitFor(() => expect(assistantApi.markAlerts).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole('region')).not.toBeInTheDocument());
    expect(changed).not.toHaveBeenCalled();
  } finally { window.removeEventListener(ASSISTANT_STATUS_CHANGED_EVENT, changed); }
});

it('暂停状态文件损坏时显示阻止提示，重置后通知助手视图', async () => {
  const changed = vi.fn();
  window.addEventListener(ASSISTANT_STATUS_CHANGED_EVENT, changed);
  try {
    vi.mocked(assistantApi.alerts).mockResolvedValue({ ...state([]), stateInvalid: true });
    vi.mocked(assistantApi.resumeRule).mockResolvedValue(state([]));
    render(<BudgetAlertBanner />);
    expect(await screen.findByRole('alert')).toHaveTextContent('暂停/提醒状态文件已损坏，AI 已被阻止');
    fireEvent.click(screen.getByRole('button', { name: '重置并恢复' }));
    await waitFor(() => expect(assistantApi.resumeRule).toHaveBeenCalledWith('daily'));
    await waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole('region')).not.toBeInTheDocument());
  } finally { window.removeEventListener(ASSISTANT_STATUS_CHANGED_EVENT, changed); }
});
