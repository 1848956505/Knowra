import { useEffect } from 'react';
import { Link, RouterOutlet, useLocation, type RouteProps } from './router';
import { useAppStore } from '../store/AppStoreProvider';
import { ComponentShowcase } from '../components/ui/showcase';

export function App() {
  const location = useLocation();

  const routes: RouteProps[] = [
    { path: '/showcase', element: <ComponentShowcase /> },
    { path: '/', element: <WorkspaceOverview /> }
  ];

  return (
    <>
      <header className="app-header">
        <span className="app-header__brand">Knowra V4</span>
        <nav className="app-header__nav" aria-label="主导航">
          <Link to="/">资料工作区</Link>
          <Link to="/showcase">组件展台</Link>
        </nav>
        <span className="app-header__path" aria-label="当前路径">
          当前路径：<span className="app-header__path-value">{location.pathname}</span>
        </span>
      </header>
      <RouterOutlet routes={routes} />
    </>
  );
}

function WorkspaceOverview() {
  const loadWorkspace = useAppStore((state) => state.loadWorkspace);
  const retryWorkspace = useAppStore((state) => state.retryWorkspace);

  // 仅在工作区路由触发 workspace 加载；其他路由（如 /showcase）独立运行，不发 API 请求。
  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  return <WorkspaceBody onRetry={() => void retryWorkspace()} />;
}

interface WorkspaceBodyProps {
  onRetry: () => void;
}

function WorkspaceBody({ onRetry }: WorkspaceBodyProps) {
  const loadState = useAppStore((state) => state.workspaceLoadState);
  const error = useAppStore((state) => state.workspaceError);
  const dataMode = useAppStore((state) => state.dataMode);
  const serverData = useAppStore((state) => state.serverData);
  const statusMessage = useAppStore((state) => state.statusMessage);
  const hasWorkspace = serverData.currentSpaceId !== null || dataMode === 'local';

  return (
    <main className="workspace-overview">
      <h1>Knowra V4</h1>
      <p>
        <Link to="/showcase">打开 V4-04 组件展台</Link>
      </p>
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
          <button type="button" onClick={onRetry}>重试</button>
        </section>
      )}
      {loadState === 'ready' && <p role="status">{statusMessage}</p>}
    </main>
  );
}

export function AppRoot() {
  return <App />;
}
