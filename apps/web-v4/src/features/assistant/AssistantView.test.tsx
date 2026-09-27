import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AssistantView } from './AssistantView';
import { assistantApi } from './assistantApi';

const fixture = vi.hoisted(() => ({
  state: {
    serverData: { currentSpaceId: 'space-1', notes: [{ id: 'note-1', title: '笔记 A', spaceId: 'space-1', deleted: false }], folderTree: [] },
    getNoteVersion: vi.fn(async () => ({ content: '前文 alpha 后文' }))
  }
}));

vi.mock('../../store/AppStoreProvider', () => ({ useAppStore: (selector: (value: typeof fixture.state) => unknown) => selector(fixture.state) }));
vi.mock('./assistantApi', () => ({ assistantApi: {
  status: vi.fn(), list: vi.fn(), get: vi.fn(), preview: vi.fn(), start: vi.fn(), cancel: vi.fn()
} }));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(assistantApi.status).mockResolvedValue({ provider: 'deepseek', modelId: 'deepseek-flash',
    configured: true, executionLocation: 'server', generationAvailable: false,
    unavailableReason: '价格与真实外发验收尚未完成，当前只能预览发送范围。' });
  vi.mocked(assistantApi.list).mockResolvedValue([]);
});

it('云端显示真实门禁，可预览明确选中的正文但不能误触发生成', async () => {
  vi.mocked(assistantApi.preview).mockResolvedValue({ previewId: 'preview-1', expiresAt: '2030-01-01T00:00:00.000Z',
    scopeHash: 'scope-hash', payloadHash: 'payload-hash', recipient: 'deepseek', spaceId: 'space-1',
    estimatedInputTokens: 120, omissions: [], sources: [{ sourceId: 'source-1', noteId: 'note-1',
      noteVersionId: 'version-1', start: 0, end: 8, text: 'alpha 正文' }] });
  render(<AssistantView pathname="/assistant?noteId=note-1" onOpenNote={vi.fn()} />);
  expect(await screen.findByText('服务器执行')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox', { name: '问题' }), { target: { value: 'alpha 是什么？' } });
  fireEvent.click(screen.getByRole('button', { name: '预览发送范围' }));
  await waitFor(() => expect(assistantApi.preview).toHaveBeenCalledWith({ spaceId: 'space-1',
    scope: { kind: 'note', noteId: 'note-1' }, question: 'alpha 是什么？' }));
  expect(await screen.findByText('alpha 正文')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '确认范围并提问' })).toBeDisabled();
  expect(assistantApi.start).not.toHaveBeenCalled();
});

it('刷新后读取已完成任务，并把引用定位到不可变笔记版本', async () => {
  const job = { jobId: 'job-1', spaceId: 'space-1', question: '问题', status: 'succeeded' as const,
    phase: 'finished', modelId: 'deepseek-flash', createdAt: '2026-09-26T00:00:00.000Z',
    updatedAt: '2026-09-26T00:00:01.000Z', result: { answer: '有依据的回答', citations: [{
      sourceId: 'source-1', noteId: 'note-1', noteVersionId: 'version-1', start: 3, end: 8
    }] }, sources: [], omissions: [] };
  vi.mocked(assistantApi.list).mockResolvedValue([job]);
  vi.mocked(assistantApi.get).mockResolvedValue(job);
  const onOpenNote = vi.fn();
  render(<AssistantView pathname="/assistant" onOpenNote={onOpenNote} />);
  expect(await screen.findByText('有依据的回答')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /引用 1 · 笔记 A/ }));
  expect(await screen.findByLabelText('引用原文定位')).toBeInTheDocument();
  expect(screen.getByText('alpha', { selector: 'mark' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '打开笔记' }));
  expect(onOpenNote).toHaveBeenCalledWith('note-1');
});
