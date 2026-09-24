/** 与桌面运行服务的路由边界保持一致；只读预览可用，未支持同步的写入须提前解释。 */
export function workspaceCapabilities(persistenceMode: 'remote' | 'desktop-local') {
  const local = persistenceMode === 'desktop-local';
  return {
    permanentDelete: !local,
    saveAnalysisScope: true,
    writeKnowledge: true,
  };
}

export const LOCAL_PERMANENT_DELETE_REASON = '桌面端暂不支持彻底删除。可在此恢复笔记；需要永久清理时，请先完成云端同步，再在网页版操作。';
export const LOCAL_ANALYSIS_SCOPE_REASON = '当前资料库暂不支持保存分析范围，请升级后重试。';
