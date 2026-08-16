import { useEffect } from 'react';
import { useAppStore } from '../store/AppStoreProvider';

export function App() {
  const loadWorkspace = useAppStore((state) => state.loadWorkspace);
  const retryWorkspace = useAppStore((state) => state.retryWorkspace);
  const loadState = useAppStore((state) => state.workspaceLoadState);
  const error = useAppStore((state) => state.workspaceError);
  const dataMode = useAppStore((state) => state.dataMode);
  const serverData = useAppStore((state) => state.serverData);
  const statusMessage = useAppStore((state) => state.statusMessage);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const hasWorkspace = serverData.currentSpaceId !== null || dataMode === 'local';

  return (
    <main>
      <h1>Knowra V4</h1>
      {loadState === 'loading' && <p role="status">{statusMessage}</p>}
      {hasWorkspace && (
        <section aria-labelledby="workspace-summary-title">
          <h2 id="workspace-summary-title">资料工作区</h2>
          <p>目录 {Object.keys(serverData.foldersById).length} 个</p>
          <p>资料 {serverData.notes.length} 条</p>
          <p>标签 {serverData.tags.length} 个</p>
          <p>数据模式：{dataMode}</p>
        </section>
      )}
      {error && (
        <section aria-labelledby="workspace-error-title">
          <h2 id="workspace-error-title">资料服务暂时不可用</h2>
          <p role="alert">{error}</p>
          {dataMode === 'cache' && <p>当前缓存为只读，恢复连接后可继续修改。</p>}
          <button type="button" onClick={() => void retryWorkspace()}>重试</button>
        </section>
      )}
      {loadState === 'ready' && <p role="status">{statusMessage}</p>}
    </main>
  );
}
