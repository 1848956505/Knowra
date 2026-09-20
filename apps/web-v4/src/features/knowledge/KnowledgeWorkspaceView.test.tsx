import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Annotation, KnowledgeEvidence, KnowledgeItem } from '@study-accelerator/web-core';
import { canNavigate } from '../../app/navigationGuard';
import { flushBeforeWorkspaceBackup, flushBeforeWorkspaceRestore } from '../../app/desktopLifecycle';
import { CreateKnowledgeCandidateDialog } from './CreateKnowledgeCandidateDialog';
import { KnowledgeWorkspaceView, type KnowledgeWorkspaceViewProps } from './KnowledgeWorkspaceView';
import { getKnowledgeDraftScope, knowledgeDraftRecovery } from './knowledgeDraftRecovery';

afterEach(async () => { await knowledgeDraftRecovery.flush(); sessionStorage.clear(); delete window.knowraDesktop; });

const candidate: KnowledgeItem = { id: 'k1', title: '数据增强', canonicalStatement: '通过变换样本扩充训练数据。', userExplanation: '用于训练阶段。', knowledgeType: 'concept', importance: null, reviewStatus: 'candidate', sourceMode: 'annotation', createdAt: '2026-09-21T10:00:00.000Z', updatedAt: '2026-09-21T10:00:00.000Z', deletedAt: null };
const archived: KnowledgeItem = { ...candidate, id: 'k2', title: '已归档的观点', reviewStatus: 'archived' };
const evidence: KnowledgeEvidence = { id: 'e1', knowledgeItemId: 'k1', sourceType: 'annotation', annotationId: 'a1', noteId: 'n1', noteVersionId: 'v1', sourceId: 'a1', quoteText: '样本变换', headingPath: ['样本操作'], relationType: 'supports', status: 'valid', createdAt: candidate.createdAt, updatedAt: candidate.updatedAt };
function props(overrides: Partial<KnowledgeWorkspaceViewProps> = {}): KnowledgeWorkspaceViewProps {
  return { selectedItemId: 'k1', canWrite: true, onSelectItem: vi.fn(), onOpenNote: vi.fn(), onList: vi.fn().mockResolvedValue([candidate, archived]), onGet: vi.fn().mockResolvedValue(candidate), onListEvidence: vi.fn().mockResolvedValue([evidence]), onCreate: vi.fn().mockResolvedValue({ item: candidate, evidence: [evidence] }), onUpdate: vi.fn().mockResolvedValue(candidate), onConfirm: vi.fn().mockResolvedValue({ ...candidate, reviewStatus: 'confirmed', updatedAt: '2026-09-21T11:00:00.000Z' }), onArchive: vi.fn().mockResolvedValue({ ...candidate, reviewStatus: 'archived' }), onRestore: vi.fn().mockResolvedValue(candidate), ...overrides };
}

describe('KnowledgeWorkspaceView', () => {
  it('筛选知识状态、搜索正文，展示来源并打开笔记', async () => {
    const user = userEvent.setup(); const input = props();
    render(<KnowledgeWorkspaceView {...input} />);
    const list = screen.getByRole('region', { name: '知识列表' });
    await within(list).findByRole('button', { name: /数据增强/ });
    expect(within(list).queryByRole('button', { name: /已归档的观点/ })).not.toBeInTheDocument();
    expect(input.onList).toHaveBeenCalledWith({ includeArchived: true });
    await user.click(within(list).getByRole('button', { name: '已归档 1' }));
    expect(within(list).getByRole('button', { name: /已归档的观点/ })).toBeInTheDocument();
    expect(within(list).queryByRole('button', { name: /数据增强/ })).not.toBeInTheDocument();
    await user.click(within(list).getByRole('button', { name: '全部未归档' }));
    await user.type(screen.getByRole('searchbox', { name: '搜索知识' }), '不存在的知识');
    expect(within(list).getByText('没有符合条件的知识。')).toBeInTheDocument();
    await user.clear(screen.getByRole('searchbox', { name: '搜索知识' }));
    await user.type(screen.getByRole('searchbox', { name: '搜索知识' }), '变换样本');
    expect(within(list).getByRole('button', { name: /数据增强/ })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '知识来源' })).toHaveTextContent('样本变换');
    await user.click(screen.getByRole('button', { name: '打开来源笔记' }));
    expect(input.onOpenNote).toHaveBeenCalledWith('n1');
  });

  it('确认和编辑都携带读取时的版本，显式保存后显示待修订', async () => {
    const user = userEvent.setup();
    const input = props({ onUpdate: vi.fn().mockResolvedValue({ ...candidate, canonicalStatement: '更完整的陈述', reviewStatus: 'needsRevision' }) });
    render(<KnowledgeWorkspaceView {...input} />);
    await user.click(await screen.findByRole('button', { name: '确认知识' }));
    expect(input.onConfirm).toHaveBeenCalledWith('k1', { expectedUpdatedAt: candidate.updatedAt });
    await screen.findByText('已确认这条知识。');
    await user.click(screen.getByRole('button', { name: '编辑' }));
    await user.clear(screen.getByRole('textbox', { name: '核心陈述' }));
    await user.type(screen.getByRole('textbox', { name: '核心陈述' }), '更完整的陈述');
    expect(canNavigate()).toBe(false);
    await user.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '编辑知识' })).not.toBeInTheDocument());
    expect(input.onUpdate).toHaveBeenCalledWith('k1', expect.objectContaining({ canonicalStatement: '更完整的陈述', expectedUpdatedAt: '2026-09-21T11:00:00.000Z' }));
    expect(screen.getByText('正文或来源已变化，请重新核对后确认。')).toBeInTheDocument();
    expect(canNavigate()).toBe(true);
  });

  it('归档先确认，恢复回到候选', async () => {
    const user = userEvent.setup(); const input = props();
    render(<KnowledgeWorkspaceView {...input} />);
    await user.click(await screen.findByRole('button', { name: '归档' }));
    expect(input.onArchive).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '确认归档' }));
    await user.click(await screen.findByRole('button', { name: '恢复为候选' }));
    expect(input.onArchive).toHaveBeenCalledWith('k1', { expectedUpdatedAt: candidate.updatedAt });
    expect(input.onRestore).toHaveBeenCalledWith('k1', { expectedUpdatedAt: candidate.updatedAt });
    expect(await screen.findByText('已恢复为候选，请重新核对后确认。')).toBeInTheDocument();
  });

  it('桌面只读原因可见，所有知识写入都禁用', async () => {
    render(<KnowledgeWorkspaceView {...props({ canWrite: false, readOnlyReason: '桌面端知识写入与同步尚未开放。' })} />);
    expect(screen.getByText('桌面端知识写入与同步尚未开放。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '新建知识候选' })).toBeDisabled();
    expect(await screen.findByRole('button', { name: '确认知识' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '编辑' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '归档' })).toBeDisabled();
  });

  it('来源失效的候选不能确认，编辑冲突保留表单输入', async () => {
    const user = userEvent.setup();
    const input = props({ onListEvidence: vi.fn().mockResolvedValue([{ ...evidence, status: 'stale' }]), onUpdate: vi.fn().mockRejectedValue(Object.assign(new Error('Conflict'), { code: 'KNOWLEDGE_ITEM_UPDATE_CONFLICT' })) });
    render(<KnowledgeWorkspaceView {...input} />);
    expect(await screen.findByRole('button', { name: '确认知识' })).toBeDisabled();
    expect(screen.getByText('当前没有可用来源，暂不能确认。请在来源笔记中核对标注，再从有效标注建立候选。')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '编辑' }));
    await user.type(screen.getByRole('textbox', { name: '我的解释' }), '新补充');
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('本次输入已保留');
    expect(screen.getByRole('textbox', { name: '我的解释' })).toHaveValue('用于训练阶段。新补充');
    expect(canNavigate()).toBe(false);
  });

  it('后返回的旧详情不能覆盖新选择，加载错误可重试', async () => {
    let finishOld!: (item: KnowledgeItem) => void;
    const oldRequest = new Promise<KnowledgeItem>(resolve => { finishOld = resolve; });
    const input = props({ onGet: vi.fn().mockReturnValueOnce(oldRequest).mockRejectedValueOnce(new Error('加载暂时失败')).mockResolvedValue(archived) });
    const { rerender } = render(<KnowledgeWorkspaceView {...input} />);
    rerender(<KnowledgeWorkspaceView {...input} selectedItemId="k2" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('加载暂时失败');
    await userEvent.click(screen.getByRole('button', { name: '重新加载知识' }));
    await screen.findByRole('heading', { name: '已归档的观点' });
    await act(async () => finishOld(candidate));
    expect(screen.queryByRole('heading', { name: '数据增强' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '已归档的观点' })).toBeInTheDocument();
  });

  it('本机同步刷新知识详情时保留正在编辑的输入与原 CAS；重启仍使用旧基线', async () => {
    const user = userEvent.setup();
    const input = props();
    const view = render(<KnowledgeWorkspaceView {...input} refreshKey={0} />);
    await user.click(await screen.findByRole('button', { name: '编辑' }));
    await user.type(screen.getByRole('textbox', { name: '我的解释' }), '本机未提交');
    const updated = { ...candidate, title: '另一端更新', updatedAt: '2026-09-21T12:00:00.000Z' };
    vi.mocked(input.onGet).mockResolvedValue(updated);
    view.rerender(<KnowledgeWorkspaceView {...input} refreshKey={1} />);
    await waitFor(() => expect(input.onGet).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('textbox', { name: '我的解释' })).toHaveValue('用于训练阶段。本机未提交');
    await expect(flushBeforeWorkspaceRestore()).rejects.toThrow('知识表单仍有未保存');
    await expect(flushBeforeWorkspaceBackup()).resolves.toEqual({ hasUnsavedDrafts: true });
    view.unmount();
    render(<KnowledgeWorkspaceView {...input} refreshKey={2} />);
    await user.click(await screen.findByRole('button', { name: '恢复草稿：数据增强' }));
    expect(screen.getByRole('textbox', { name: '我的解释' })).toHaveValue('用于训练阶段。本机未提交');
    await user.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(input.onUpdate).toHaveBeenCalledWith('k1', expect.objectContaining({ expectedUpdatedAt: candidate.updatedAt, userExplanation: '用于训练阶段。本机未提交' })));
    await waitFor(() => expect(knowledgeDraftRecovery.list(getKnowledgeDraftScope())).toEqual([]));
  });

  it('从标注创建后异常退出，恢复保留候选 id 和原来源，不会自动确认', async () => {
    const user = userEvent.setup();
    const source = { id: 'a-old', noteVersionId: 'v-old', revision: 3, headingPath: ['旧标注标题'], quoteText: '旧摘录' } as Annotation;
    const first = render(<CreateKnowledgeCandidateDialog source={source} canWrite onClose={vi.fn()} onCreate={vi.fn()} />);
    await user.type(screen.getByRole('textbox', { name: '标题' }), '草稿补充');
    await knowledgeDraftRecovery.flush();
    const original = knowledgeDraftRecovery.list(getKnowledgeDraftScope())[0]!;
    first.unmount();
    const input = props();
    render(<KnowledgeWorkspaceView {...input} />);
    await user.click(await screen.findByRole('button', { name: '恢复草稿：旧标注标题草稿补充' }));
    expect(screen.getByRole('region', { name: '来源标注' })).toHaveTextContent('旧摘录');
    expect(input.onCreate).not.toHaveBeenCalled();
    expect(input.onConfirm).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(input.onCreate).toHaveBeenCalledWith(expect.objectContaining({ id: original.candidateId, evidence: [{ sourceType: 'annotation', annotationId: 'a-old', noteVersionId: 'v-old', expectedAnnotationRevision: 3 }] })));
    await waitFor(() => expect(knowledgeDraftRecovery.list(getKnowledgeDraftScope())).toEqual([]));
  });
});

describe('CreateKnowledgeCandidateDialog', () => {
  const source = { id: 'a1', noteVersionId: 'v1', revision: 3, headingPath: ['样本操作'], quoteText: '原文摘录', comment: '我的标注说明' } as Annotation;
  it('从标注创建候选只提交来源标识；失败保留输入，成功后再解除导航保护', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockRejectedValueOnce(new Error('暂时无法保存')).mockResolvedValue({ item: candidate, evidence: [evidence] });
    const onClose = vi.fn(); const onCreated = vi.fn(() => expect(canNavigate()).toBe(true));
    render(<CreateKnowledgeCandidateDialog source={source} canWrite onClose={onClose} onCreate={onCreate} onCreated={onCreated} />);
    expect(screen.getByRole('textbox', { name: '核心陈述' })).toHaveValue('原文摘录');
    await user.clear(screen.getByRole('textbox', { name: '标题' }));
    await user.type(screen.getByRole('textbox', { name: '标题' }), '新知识');
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('暂时无法保存');
    expect(screen.getByRole('textbox', { name: '标题' })).toHaveValue('新知识');
    expect(onClose).not.toHaveBeenCalled();
    expect(canNavigate()).toBe(false);
    await user.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(candidate));
    expect(onCreate).toHaveBeenLastCalledWith({ id: expect.stringMatching(/^knowledge-/), title: '新知识', canonicalStatement: '原文摘录', userExplanation: '我的标注说明', knowledgeType: 'concept', sourceMode: 'annotation', evidence: [{ sourceType: 'annotation', annotationId: 'a1', noteVersionId: 'v1', expectedAnnotationRevision: 3 }] });
    expect(onCreate.mock.calls[0][0].id).toBe(onCreate.mock.calls[1][0].id);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('取消有修改的候选时先确认，继续编辑保留文字', async () => {
    const user = userEvent.setup(); const onClose = vi.fn();
    render(<CreateKnowledgeCandidateDialog canWrite onClose={onClose} onCreate={vi.fn()} />);
    await user.type(screen.getByRole('textbox', { name: '标题' }), '未保存候选');
    const beforeUnload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(beforeUnload);
    expect(beforeUnload.defaultPrevented).toBe(true);
    await expect(flushBeforeWorkspaceRestore()).rejects.toThrow('知识表单仍有未保存的修改');
    await user.click(screen.getByRole('button', { name: '取消' }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: '放弃未保存的知识修改？' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '继续编辑' }));
    expect(screen.getByRole('textbox', { name: '标题' })).toHaveValue('未保存候选');
    await user.click(screen.getByRole('button', { name: '取消' }));
    await user.click(screen.getByRole('button', { name: '放弃修改' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('知识提交成功但草稿删除失败时，只重试清理，不再提交旧版本', async () => {
    const disk: Record<string, unknown> = {};
    let refuseDelete = true;
    window.knowraDesktop = { onPrepareClose() {}, onCancelClose() {}, readRecoveryDrafts: () => disk,
      async writeRecoveryDraft(key, value) {
        if (value === null) { if (refuseDelete) throw new Error('磁盘暂时不可写'); delete disk[key]; }
        else disk[key] = value;
      } };
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue({ item: candidate, evidence: [] });
    const onClose = vi.fn();
    render(<CreateKnowledgeCandidateDialog canWrite onClose={onClose} onCreate={onCreate} />);
    await user.type(screen.getByRole('textbox', { name: '标题' }), '提交后的草稿');
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('知识已保存，但恢复草稿清理失败');
    expect(screen.getByRole('textbox', { name: '标题' })).toBeDisabled();
    expect(onCreate).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
    refuseDelete = false;
    await user.click(screen.getByRole('button', { name: '重试清理' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(onCreate).toHaveBeenCalledOnce();
    expect(disk).toEqual({});
  });
});
