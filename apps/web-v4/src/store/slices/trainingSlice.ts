import type { TrainingAssetKind, TrainingAssetRecord, TrainingPurgePreview } from '@study-accelerator/web-core';
import type { WorkspaceDependencies } from '../types';
import type { GetStore } from '../workspaceSnapshotState';

export interface TrainingSlice {
  listTrainingAssets(kind: TrainingAssetKind): Promise<TrainingAssetRecord[]>;
  createTrainingAsset(kind: TrainingAssetKind, input: Record<string, unknown>): Promise<TrainingAssetRecord>;
  updateTrainingAsset(kind: TrainingAssetKind, id: string, input: Record<string, unknown>): Promise<TrainingAssetRecord>;
  mutateTrainingAsset(kind: TrainingAssetKind, id: string, action: 'validate' | 'confirm' | 'archive' | 'restore' | 'trash' | 'restore-deleted'): Promise<TrainingAssetRecord>;
  inspectTrainingAssetPurge(kind: TrainingAssetKind, id: string): Promise<TrainingPurgePreview>;
  purgeTrainingAsset(kind: TrainingAssetKind, id: string, expectedUpdatedAt: string): Promise<{ status: string; asset: { type: TrainingAssetKind; id: string } }>;
}

export function createTrainingSlice(get: GetStore, { api }: WorkspaceDependencies): TrainingSlice {
  function requireConnected() {
    if (get().dataMode !== 'api') throw new Error('资料库尚未连接，请先重试加载。');
  }
  function requireWrite() {
    requireConnected();
    if (get().persistenceMode === 'desktop-local' || !get().canWriteWorkspace()) throw new Error('当前资料库暂不支持训练资产写入，请在网页版操作。');
  }
  function requireMethod<T>(method: T | undefined): T {
    if (!method) throw new Error('当前服务尚未接通训练工作域，请更新应用后重试。');
    return method;
  }
  return {
    listTrainingAssets: kind => { requireConnected(); return requireMethod(api.listTrainingAssets)(kind, { includeArchived: true, includeDeleted: true }); },
    createTrainingAsset: (kind, input) => { requireWrite(); return requireMethod(api.createTrainingAsset)(kind, input); },
    updateTrainingAsset: (kind, id, input) => { requireWrite(); return requireMethod(api.updateTrainingAsset)(kind, id, input); },
    mutateTrainingAsset: (kind, id, action) => { requireWrite(); return requireMethod(api.mutateTrainingAsset)(kind, id, action); },
    inspectTrainingAssetPurge: (kind, id) => { requireConnected(); return requireMethod(api.inspectTrainingAssetPurge)(kind, id); },
    purgeTrainingAsset: (kind, id, expectedUpdatedAt) => { requireWrite(); return requireMethod(api.purgeTrainingAsset)(kind, id, expectedUpdatedAt); }
  };
}
