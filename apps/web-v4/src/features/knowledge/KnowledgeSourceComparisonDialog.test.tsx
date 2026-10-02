import { act, render, screen, waitFor, within } from '@testing-library/react';
import { StrictMode } from 'react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { KnowledgeEvidence, KnowledgeItem, NoteVersion } from '@study-accelerator/web-core';
import { KnowledgeDetail } from './KnowledgeDetail';
import { KnowledgeSourceComparisonDialog } from './KnowledgeSourceComparisonDialog';

const { getNoteVersion } = vi.hoisted(() => ({ getNoteVersion: vi.fn() }));
vi.mock('../../store/AppStoreProvider', () => ({
  useAppStore: (select: (state: { getNoteVersion: typeof getNoteVersion }) => unknown) => select({ getNoteVersion })
}));

const item: KnowledgeItem = { id: 'k1', title: '样本增强', canonicalStatement: '通过样本变换扩充训练集。', userExplanation: '用于训练阶段。', knowledgeType: 'concept', importance: null, sourceMode: 'annotation', reviewStatus: 'candidate', createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', deletedAt: null };
const evidence: KnowledgeEvidence = { id: 'e1', knowledgeItemId: 'k1', sourceType: 'annotation', sourceId: 'a1', annotationId: 'a1', noteId: 'n1', noteVersionId: 'v-old', quoteText: '旋转和翻转扩充训练集。', headingPath: ['样本操作'], relationType: 'supports', status: 'stale', applicabilityStatus: 'needsReview', sourceAnnotationRemoved: true, createdAt: item.createdAt, updatedAt: item.updatedAt };
const version: NoteVersion = { id: 'v-old', noteId: 'n1', content: '# 旧版正文\n旋转和翻转扩充训练集。', contentHash: 'a'.repeat(64), createdAt: item.createdAt, createdBy: 'user' };

function input(overrides: Partial<Parameters<typeof KnowledgeSourceComparisonDialog>[0]> = {}) {
  return { item, evidence, onGetVersion: vi.fn().mockResolvedValue(version), onClose: vi.fn(), onOpenNote: vi.fn(), ...overrides };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((accept, decline) => { resolve = accept; reject = decline; });
  return { promise, resolve, reject };
}

describe('KnowledgeSourceComparisonDialog', () => {
  it('StrictMode挂载时取消首个effect的读取，保留真实请求错误', async () => {
    const props = input({ onGetVersion: vi.fn().mockRejectedValue({ code: 'NOTE_VERSION_NOT_FOUND' }) });
    render(<StrictMode><KnowledgeSourceComparisonDialog {...props} /></StrictMode>);
    expect(await screen.findByRole('alert')).toHaveTextContent('历史版本暂不可用');
    expect(props.onGetVersion).toHaveBeenCalledExactlyOnceWith('n1', 'v-old');
  });
  it('并列知识与保存摘录，仅读取证据绑定的历史正文', async () => {
    const props = input();
    render(<KnowledgeSourceComparisonDialog {...props} />);
    const dialog = screen.getByRole('dialog', { name: '来源对照' });
    expect(within(dialog).getByRole('region', { name: '待核对知识' })).toHaveTextContent(item.canonicalStatement);
    expect(within(dialog).getByRole('region', { name: '保存的来源' })).toHaveTextContent(evidence.quoteText);
    expect(within(dialog).getByText('需复核')).toBeVisible();
    expect(within(dialog).getByText('适用性待核对')).toBeVisible();
    expect(within(dialog).getByText('原标注已移除')).toBeVisible();
    await waitFor(() => expect(screen.getByLabelText('历史版本正文')).toHaveTextContent('旧版正文'));
    expect(props.onGetVersion).toHaveBeenCalledExactlyOnceWith('n1', 'v-old');
    expect(props.onOpenNote).not.toHaveBeenCalled();
  });

  it('撤回适用性仍可核对原版本，技术健康单独保留', async () => {
    render(<KnowledgeSourceComparisonDialog {...input({ evidence: { ...evidence, status: 'valid', applicabilityStatus: 'withdrawn' } })} />);
    expect(screen.getByText('来源可用')).toBeVisible();
    expect(screen.getByText('已撤回适用性')).toBeVisible();
    await waitFor(() => expect(screen.getByLabelText('历史版本正文')).toHaveTextContent('旧版正文'));
    expect(screen.queryByRole('button', { name: '确认知识' })).not.toBeInTheDocument();
  });

  it.each(['NOTE_VERSION_NOT_FOUND', 'NOTE_NOT_FOUND', 'NETWORK_ERROR'])('历史读取错误 %s 保留摘录，并允许重试同一版本', async code => {
    const user = userEvent.setup();
    const props = input({ onGetVersion: vi.fn().mockRejectedValueOnce({ code }).mockResolvedValueOnce(version) });
    render(<KnowledgeSourceComparisonDialog {...props} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('历史版本');
    expect(screen.getByRole('region', { name: '保存的来源' })).toHaveTextContent(evidence.quoteText);
    expect(screen.queryByLabelText('历史版本正文')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '重试历史版本' }));
    await waitFor(() => expect(screen.getByLabelText('历史版本正文')).toHaveTextContent('旧版正文'));
    expect(props.onGetVersion).toHaveBeenNthCalledWith(2, 'n1', 'v-old');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([{ noteId: null, noteVersionId: 'v-old' }, { noteId: 'n1', noteVersionId: null }, { noteId: null, noteVersionId: null }])('来源版本信息不完整时不请求当前版本：%j', async ids => {
    const props = input({ evidence: { ...evidence, ...ids } });
    render(<KnowledgeSourceComparisonDialog {...props} />);
    expect(screen.getByText(/未关联完整的笔记版本信息/)).toBeVisible();
    expect(screen.getByRole('region', { name: '保存的来源' })).toHaveTextContent(evidence.quoteText);
    expect(props.onGetVersion).not.toHaveBeenCalled();
  });

  it('手动来源只展示保存摘录，空白历史正文明确呈现', async () => {
    const props = input({ evidence: { ...evidence, sourceType: 'manual', noteId: null, noteVersionId: null, quoteText: '' } });
    const view = render(<KnowledgeSourceComparisonDialog {...props} />);
    expect(screen.getByText('该来源没有文字摘录')).toBeVisible();
    expect(screen.getByText(/手动来源未绑定笔记历史版本/)).toBeVisible();
    expect(screen.queryByRole('button', { name: '打开当前笔记' })).not.toBeInTheDocument();
    expect(props.onGetVersion).not.toHaveBeenCalled();
    view.rerender(<KnowledgeSourceComparisonDialog {...input({ onGetVersion: vi.fn().mockResolvedValue({ ...version, content: '' }) })} />);
    expect(await screen.findByText('（空白版本）')).toBeVisible();
  });

  it.each([{ id: 'v-other' }, { noteId: 'n-other' }, { content: undefined }])('拒绝展示身份或正文不匹配的历史响应：%j', async change => {
    render(<KnowledgeSourceComparisonDialog {...input({ onGetVersion: vi.fn().mockResolvedValue({ ...version, ...change }) })} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('返回的历史版本与来源记录不一致');
    expect(screen.queryByLabelText('历史版本正文')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: '保存的来源' })).toHaveTextContent(evidence.quoteText);
  });

  it.each(['success', 'failure'])('切换来源后忽略旧请求的迟到%s结果', async result => {
    const oldRequest = deferred<NoteVersion>();
    const nextRequest = deferred<NoteVersion>();
    const onGetVersion = vi.fn().mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(nextRequest.promise);
    const props = input({ onGetVersion });
    const view = render(<KnowledgeSourceComparisonDialog {...props} />);
    await waitFor(() => expect(onGetVersion).toHaveBeenCalledTimes(1));
    const nextEvidence = { ...evidence, id: 'e2', noteId: 'n2', noteVersionId: 'v2', quoteText: '另一条保存摘录' };
    view.rerender(<KnowledgeSourceComparisonDialog {...props} evidence={nextEvidence} />);
    await waitFor(() => expect(onGetVersion).toHaveBeenLastCalledWith('n2', 'v2'));
    await act(async () => { nextRequest.resolve({ ...version, id: 'v2', noteId: 'n2', content: '下一来源正文' }); });
    await act(async () => { if (result === 'success') oldRequest.resolve(version); else oldRequest.reject(new Error('迟到错误')); });
    expect(screen.getByLabelText('历史版本正文')).toHaveTextContent('下一来源正文');
    expect(screen.queryByText(/旧版正文/)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('重新读取另一版本时立即隐藏已加载的旧正文', async () => {
    const next = deferred<NoteVersion>();
    const onGetVersion = vi.fn().mockResolvedValueOnce(version).mockReturnValueOnce(next.promise);
    const props = input({ onGetVersion });
    const view = render(<KnowledgeSourceComparisonDialog {...props} />);
    await waitFor(() => expect(screen.getByLabelText('历史版本正文')).toHaveTextContent('旧版正文'));
    view.rerender(<KnowledgeSourceComparisonDialog {...props} evidence={{ ...evidence, noteVersionId: 'v-next' }} />);
    expect(screen.queryByLabelText('历史版本正文')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('正在加载来源的历史版本');
    await act(async () => { next.resolve({ ...version, id: 'v-next', content: '更新版本正文' }); });
    expect(screen.getByLabelText('历史版本正文')).toHaveTextContent('更新版本正文');
  });

  it('历史 Markdown 按原文展示，打开当前笔记是独立导航动作', async () => {
    const user = userEvent.setup();
    const props = input({ onGetVersion: vi.fn().mockResolvedValue({ ...version, content: '<img src="https://external.invalid/tracker"><script>window.bad=true</script>' }) });
    render(<KnowledgeSourceComparisonDialog {...props} />);
    await waitFor(() => expect(screen.getByLabelText('历史版本正文')).toHaveTextContent('<img'));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '打开当前笔记' }));
    expect(props.onClose).toHaveBeenCalledOnce();
    expect(props.onOpenNote).toHaveBeenCalledExactlyOnceWith('n1');
  });

  it.each(['candidate', 'archived', 'deleted'] as const)('只读知识详情的 %s 来源仍可对照，Esc 后归还焦点', async status => {
    const user = userEvent.setup();
    getNoteVersion.mockResolvedValue(version);
    const onOpenNote = vi.fn();
    render(<KnowledgeDetail item={{ ...item, reviewStatus: status === 'archived' ? 'archived' : 'candidate', deletedAt: status === 'deleted' ? item.updatedAt : null }} evidence={[evidence]} canWrite={false} pending={false} onOpenNote={onOpenNote}
      onEdit={vi.fn()} onConfirm={vi.fn()} onArchive={vi.fn()} onRestore={vi.fn()} onTrash={vi.fn()} onRestoreDeleted={vi.fn()} onAddSource={vi.fn()} onReplaceSource={vi.fn()} onRetireSource={vi.fn()} onReadoptSource={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: '对照来源' });
    await user.click(trigger);
    await waitFor(() => expect(screen.getByLabelText('历史版本正文')).toHaveTextContent('旧版正文'));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '来源对照' })).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(onOpenNote).not.toHaveBeenCalled();
  });
});
