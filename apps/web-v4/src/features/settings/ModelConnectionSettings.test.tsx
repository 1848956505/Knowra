import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiRequestError } from '@study-accelerator/web-core';
import { ModelConnectionSettings } from './ModelConnectionSettings';
import { modelSettings } from './modelSettings';

vi.mock('./modelSettings', () => ({ modelSettings: {
  status: vi.fn(), save: vi.fn(), check: vi.fn(), remove: vi.fn()
} }));

beforeEach(() => vi.resetAllMocks());

it('在设置页保存、检查及移除 DeepSeek 配置，密钥不回显', async () => {
  vi.mocked(modelSettings.status).mockResolvedValue({ provider: 'deepseek', modelId: 'deepseek-flash', configured: false });
  vi.mocked(modelSettings.save).mockResolvedValue({ provider: 'deepseek', modelId: 'deepseek-flash', configured: true });
  vi.mocked(modelSettings.check).mockResolvedValue({ provider: 'deepseek', modelId: 'deepseek-flash', configured: true, connected: true, modelAvailable: true });
  vi.mocked(modelSettings.remove).mockResolvedValue({ provider: 'deepseek', modelId: 'deepseek-flash', configured: false });
  render(<ModelConnectionSettings />);
  expect(await screen.findByText('尚未配置')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'test-secret' } });
  fireEvent.click(screen.getByRole('button', { name: '保存配置' }));
  await waitFor(() => expect(modelSettings.save).toHaveBeenCalledWith({ modelId: 'deepseek-flash', apiKey: 'test-secret' }));
  await waitFor(() => expect(screen.getByLabelText('API Key')).toHaveValue(''));
  fireEvent.click(screen.getByRole('button', { name: '检查连接' }));
  expect(await screen.findByText(/连接成功：密钥有效/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '移除配置' }));
  await waitFor(() => expect(screen.getByText('尚未配置')).toBeInTheDocument());
});

it('状态接口 404 时结束加载并允许保留已输入的密钥重试', async () => {
  vi.mocked(modelSettings.status)
    .mockRejectedValueOnce(new ApiRequestError('Route not found', { status: 404, code: 'ROUTE_NOT_FOUND' }))
    .mockResolvedValueOnce({ provider: 'deepseek', modelId: 'deepseek-flash', configured: false });
  render(<ModelConnectionSettings />);
  fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'test-secret' } });
  expect(await screen.findByText('配置状态读取失败')).toBeInTheDocument();
  expect(screen.getByText(/当前 API 服务未提供模型配置接口/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '保存配置' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '重试读取' }));
  expect(await screen.findByText('尚未配置')).toBeInTheDocument();
  expect(screen.getByLabelText('API Key')).toHaveValue('test-secret');
  expect(screen.getByRole('button', { name: '保存配置' })).toBeEnabled();
});
