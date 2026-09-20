/** 与桌面运行服务的路由边界保持一致；只读预览可用，未支持同步的写入须提前解释。 */
export function workspaceCapabilities(persistenceMode: 'remote' | 'desktop-local') {
  const local = persistenceMode === 'desktop-local';
  return {
    permanentDelete: !local,
    saveAnalysisScope: !local,
    writeKnowledge: !local,
  };
}

export const LOCAL_PERMANENT_DELETE_REASON = '桌面端暂不支持彻底删除。可在此恢复笔记；需要永久清理时，请先完成云端同步，再在网页版操作。';
export const LOCAL_ANALYSIS_SCOPE_REASON = '桌面端可预览分析范围；范围快照暂不支持离线同步，请在网页版保存。';
export const LOCAL_KNOWLEDGE_WRITE_REASON = '桌面端可查看已同步的知识与来源。知识修改暂不支持离线同步，请在网页版创建和确认。';
