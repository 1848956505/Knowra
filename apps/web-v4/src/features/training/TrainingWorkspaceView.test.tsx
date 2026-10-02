import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppStore } from '../../store/types';
import type { TrainingAssetRecord } from '@study-accelerator/web-core';
import { TrainingWorkspaceView } from './TrainingWorkspaceView';

const mocked = vi.hoisted(() => ({ state: null as unknown as AppStore, navigate: vi.fn() }));
vi.mock('../../store/AppStoreProvider', () => ({ useAppStore: (selector: (state: AppStore) => unknown) => selector(mocked.state) }));
vi.mock('../../app/router', () => ({ useNavigate: () => mocked.navigate }));

const question: TrainingAssetRecord = { id: 'q1', stem: '解释导数', questionType: 'shortAnswer', reviewStatus: 'draft', referenceAnswer: '切线斜率', learningObjectiveIds: ['o1'],
  updatedAt: '2026-10-02T00:00:00Z', sources: [{ id: 's1', sourceType: 'learningObjective', sourceId: 'o1', quote: '旧目标摘录', status: 'stale' }] };
const objective = { id: 'o1', objective: '解释导数的含义', reviewStatus: 'confirmed', updatedAt: question.updatedAt };

function setup(overrides: Partial<AppStore> = {}) {
  let questions = [question];
  const state = { dataMode: 'api', persistenceMode: 'remote', knowledgeGeneration: 0, canWriteWorkspace: vi.fn(() => true),
    listTrainingAssets: vi.fn(async (kind: string) => kind === 'question' ? questions : kind === 'learningObjective' ? [objective] : []),
    listKnowledgeItems: vi.fn().mockResolvedValue([]), getKnowledgeItem: vi.fn(), listKnowledgeEvidence: vi.fn(), getNoteVersion: vi.fn(),
    createTrainingAsset: vi.fn(), updateTrainingAsset: vi.fn(async (_kind, id, input) => { questions = questions.map(item => item.id === id ? { ...item, ...input } : item); }),
    mutateTrainingAsset: vi.fn(async (_kind, id) => { questions = questions.map(item => item.id === id ? { ...item, reviewStatus: 'archived' } : item); }),
    inspectTrainingAssetPurge: vi.fn(), purgeTrainingAsset: vi.fn(), ...overrides };
  mocked.state = state as unknown as AppStore;
  return state;
}
beforeEach(() => { mocked.navigate.mockReset(); });

describe('训练工作台详情流程', () => {
  it('选择题目、对照目标、关闭归还焦点，过滤后不显示隐藏题目的详情', async () => {
    setup(); const user = userEvent.setup(); render(<TrainingWorkspaceView />);
    const open = await screen.findByRole('button', { name: '查看详情' });
    await user.click(open);
    const detail = within(screen.getByRole('article', { name: '题目详情' }));
    expect(detail.getByRole('region', { name: '参考答案' })).toHaveTextContent('切线斜率');
    await user.click(detail.getByRole('button', { name: '对照来源' }));
    const dialog = await screen.findByRole('dialog', { name: '题目来源对照' });
    expect(within(dialog).getByRole('region', { name: '编题时保存的摘录' })).toHaveTextContent('旧目标摘录');
    expect(await within(dialog).findByText('解释导数的含义')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: '关闭' }));
    await user.click(detail.getByRole('button', { name: '关闭详情' }));
    expect(open).toHaveFocus();
    await user.click(open);
    await user.type(screen.getByRole('searchbox', { name: '搜索题目' }), '不存在');
    expect(screen.queryByRole('article', { name: '题目详情' })).not.toBeInTheDocument();
  });

  it('保存后从重新加载的题目更新详情，归档后隐藏当前使用中详情', async () => {
    const state = setup(); const user = userEvent.setup(); render(<TrainingWorkspaceView />);
    await user.click(await screen.findByRole('button', { name: '查看详情' }));
    await user.click(within(screen.getByRole('region', { name: '题目列表' })).getByRole('button', { name: '编辑' }));
    const dialog = screen.getByRole('dialog', { name: '编辑题目' });
    const answer = within(dialog).getByRole('textbox', { name: '参考答案' });
    await user.clear(answer); await user.type(answer, '更新的参考答案');
    await user.click(within(dialog).getByRole('button', { name: '保存' }));
    await waitFor(() => expect(screen.getByRole('region', { name: '参考答案' })).toHaveTextContent('更新的参考答案'));
    expect(state.updateTrainingAsset).toHaveBeenCalledWith('question', 'q1', { stem: '解释导数', referenceAnswer: '更新的参考答案' });
    await user.click(within(screen.getByRole('region', { name: '题目列表' })).getByRole('button', { name: '归档' }));
    await waitFor(() => expect(screen.queryByRole('article', { name: '题目详情' })).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: '已归档' }));
    await user.click(await screen.findByRole('button', { name: '查看详情' }));
    expect(screen.getByRole('article', { name: '题目详情' })).toHaveTextContent('已归档');
  });

  it('只读训练资产仍能查看详情和来源，写操作不出现', async () => {
    const state = setup({ persistenceMode: 'desktop-local' }); render(<TrainingWorkspaceView />);
    await userEvent.click(await screen.findByRole('button', { name: '查看详情' }));
    expect(screen.getByRole('article', { name: '题目详情' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '编辑' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '新建题目' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '对照来源' }));
    expect(await screen.findByRole('dialog', { name: '题目来源对照' })).toBeInTheDocument();
    expect(state.updateTrainingAsset).not.toHaveBeenCalled();
  });

  it('结构化答案编辑不会展示可输入却被静默忽略的空白答案框', async () => {
    const state = setup({ listTrainingAssets: vi.fn(async kind => kind === 'question' ? [{ ...question, referenceAnswer: false, questionType: 'trueFalse' }] : []) });
    render(<TrainingWorkspaceView />);
    await userEvent.click(await screen.findByRole('button', { name: '编辑' }));
    const dialog = screen.getByRole('dialog', { name: '编辑题目' });
    expect(within(dialog).queryByRole('textbox', { name: '参考答案' })).not.toBeInTheDocument();
    expect(within(dialog).getByRole('region', { name: '已有参考答案' })).toHaveTextContent('否');
    await userEvent.click(within(dialog).getByRole('button', { name: '保存' }));
    await waitFor(() => expect(state.updateTrainingAsset).toHaveBeenCalledWith('question', 'q1', { stem: '解释导数' }));
  });

  it('工作区刷新后迟到的旧列表不能覆盖较新的题目', async () => {
    let finish!: (value: TrainingAssetRecord[]) => void;
    let questionReads = 0;
    setup({ listTrainingAssets: vi.fn(async kind => {
      if (kind !== 'question') return [];
      if (++questionReads === 1) return new Promise<TrainingAssetRecord[]>(resolve => { finish = resolve; });
      return [{ ...question, stem: '新版本题干' }];
    }) });
    const view = render(<TrainingWorkspaceView />);
    mocked.state = { ...mocked.state, knowledgeGeneration: 1 };
    view.rerender(<TrainingWorkspaceView />);
    await screen.findByRole('heading', { name: '新版本题干' });
    await act(async () => finish([question]));
    expect(screen.queryByRole('heading', { name: question.stem })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '新版本题干' })).toBeInTheDocument();
  });
});
