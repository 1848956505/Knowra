import type { WorkspaceDependencies } from '../types';
import type { GetStore } from '../workspaceSnapshotState';
import type { CreateKnowledgeCandidateInput, CreateKnowledgeEvidenceInput, KnowledgeEvidence, KnowledgeEvidenceMutationResult, KnowledgeItem, KnowledgeReviewStatus, UpdateKnowledgeItemInput } from '@study-accelerator/web-core';

export interface KnowledgeSlice {
  listKnowledgeItems(query?: { reviewStatus?: KnowledgeReviewStatus; query?: string; noteId?: string }): Promise<KnowledgeItem[]>;
  getKnowledgeItem(id: string): Promise<KnowledgeItem>;
  listKnowledgeEvidence(id: string): Promise<KnowledgeEvidence[]>;
  createKnowledgeEvidence(id: string, input: CreateKnowledgeEvidenceInput): Promise<KnowledgeEvidence>;
  retireKnowledgeEvidence(id: string, evidenceId: string, input?: { expectedUpdatedAt?: string }): Promise<KnowledgeEvidenceMutationResult>;
  createKnowledgeCandidate(input: CreateKnowledgeCandidateInput): Promise<{ item: KnowledgeItem; evidence: KnowledgeEvidence[] }>;
  updateKnowledgeItem(id: string, input: UpdateKnowledgeItemInput): Promise<KnowledgeItem>;
  confirmKnowledgeItem(id: string, input: { expectedUpdatedAt: string }): Promise<KnowledgeItem>;
  archiveKnowledgeItem(id: string, input: { expectedUpdatedAt: string }): Promise<KnowledgeItem>;
  restoreKnowledgeItem(id: string, input: { expectedUpdatedAt: string }): Promise<KnowledgeItem>;
}

/** 知识显式保存的错误留在表单中，不覆盖正在编辑的笔记保存状态。 */
export function createKnowledgeSlice(get: GetStore, { api }: WorkspaceDependencies): KnowledgeSlice {
  function spaceId() {
    const state = get();
    if (state.dataMode !== 'api' || !state.serverData.currentSpaceId) throw new Error('资料库尚未连接，请先重试加载。');
    return state.serverData.currentSpaceId;
  }
  function assertWrite() {
    spaceId();
  }
  function requireMethod<T>(method: T | undefined): T {
    if (!method) throw new Error('当前服务尚未接通知识管理，请更新应用后重试。');
    return method;
  }
  return {
    listKnowledgeItems: query => { spaceId(); return requireMethod(api.listKnowledgeItems)({ includeArchived: true, ...query }); },
    getKnowledgeItem: id => { spaceId(); return requireMethod(api.getKnowledgeItem)(id); },
    listKnowledgeEvidence: id => { spaceId(); return requireMethod(api.listKnowledgeEvidence)(id); },
    createKnowledgeEvidence: (id, input) => { assertWrite(); return requireMethod(api.createKnowledgeEvidence)(id, input); },
    retireKnowledgeEvidence: (id, evidenceId, input) => { assertWrite(); return requireMethod(api.retireKnowledgeEvidence)(id, evidenceId, input); },
    createKnowledgeCandidate: input => { assertWrite(); return requireMethod(api.createKnowledgeCandidate)(input); },
    updateKnowledgeItem: (id, input) => { assertWrite(); return requireMethod(api.updateKnowledgeItem)(id, input); },
    confirmKnowledgeItem: (id, input) => { assertWrite(); return requireMethod(api.confirmKnowledgeItem)(id, input); },
    archiveKnowledgeItem: (id, input) => { assertWrite(); return requireMethod(api.archiveKnowledgeItem)(id, input); },
    restoreKnowledgeItem: (id, input) => { assertWrite(); return requireMethod(api.restoreKnowledgeItem)(id, input); },
  };
}
