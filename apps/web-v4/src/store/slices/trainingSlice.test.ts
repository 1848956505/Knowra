import { describe, expect, it, vi } from 'vitest';
import { createEmptyWorkspaceSnapshot, type WorkspaceApi } from '@study-accelerator/web-core';
import { createAppStore } from '../createAppStore';
function fixture(mode: 'remote' | 'desktop-local' = 'remote') {
  const api = { createTrainingAsset: vi.fn(), updateTrainingAsset: vi.fn(), mutateTrainingAsset: vi.fn(), listTrainingAssets: vi.fn().mockResolvedValue([]) };
  const store = createAppStore({ api: api as unknown as WorkspaceApi, cacheKey: 'objective-review', mockSnapshot: createEmptyWorkspaceSnapshot(), persistenceMode: mode });
  store.setState(state => ({ dataMode: 'api', serverData: { ...state.serverData, currentSpaceId: 'space-demo' } }));
  return { api, store };
}
describe('训练目标写入门禁与审阅基线', () => {
  it('未提供审阅基线的既有题目操作和旧目标确认保持三参数调用', async () => {
    const { api, store } = fixture();
    await store.getState().mutateTrainingAsset('question', 'q1', 'trash');
    expect(api.mutateTrainingAsset).toHaveBeenNthCalledWith(1, 'question', 'q1', 'trash');
    expect(api.mutateTrainingAsset.mock.calls[0]).toHaveLength(3);
    await store.getState().mutateTrainingAsset('learningObjective', 'o1', 'confirm');
    expect(api.mutateTrainingAsset).toHaveBeenNthCalledWith(2, 'learningObjective', 'o1', 'confirm');
    expect(api.mutateTrainingAsset.mock.calls[1]).toHaveLength(3);
  });
  it.each(['desktop-local', 'cache'] as const)('%s不能借知识写入能力确认目标', mode => {
    const { api, store } = fixture(mode === 'desktop-local' ? mode : 'remote'); if (mode === 'cache') store.setState({ dataMode: mode });
    expect(() => store.getState().mutateTrainingAsset('learningObjective', 'o1', 'confirm', { reviewBaseline: { knowledgeUpdatedAt: '2026-10-03T00:00:00.000Z', objectiveUpdatedAt: '2026-10-03T01:00:00.000Z' } })).toThrow(); expect(api.mutateTrainingAsset).not.toHaveBeenCalled();
    expect(() => store.getState().createTrainingAsset('learningObjective', {})).toThrow(); expect(api.createTrainingAsset).not.toHaveBeenCalled();
  });
  it('可写Web完整转交基线，读取含归档与回收站', async () => {
    const { api, store } = fixture(); const input = { reviewBaseline: { knowledgeUpdatedAt: '2026-10-03T00:00:00.000Z', objectiveUpdatedAt: '2026-10-03T01:00:00.000Z' } };
    await store.getState().mutateTrainingAsset('learningObjective', 'o1', 'confirm', input); expect(api.mutateTrainingAsset).toHaveBeenCalledWith('learningObjective', 'o1', 'confirm', input);
    expect(api.mutateTrainingAsset.mock.calls[0]).toHaveLength(4);
    await store.getState().listTrainingAssets('learningObjective'); expect(api.listTrainingAssets).toHaveBeenCalledWith('learningObjective', { includeArchived: true, includeDeleted: true });
  });
});
