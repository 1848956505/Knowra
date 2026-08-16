import type { PropsWithChildren } from 'react';
import { ErrorBoundary } from 'react-error-boundary';

export function AppErrorBoundary({ children }: PropsWithChildren) {
  return (
    <ErrorBoundary fallbackRender={({ error, resetErrorBoundary }) => (
      <main>
        <h1>Knowra V4</h1>
        <section aria-labelledby="fatal-error-title">
          <h2 id="fatal-error-title">应用发生意外错误</h2>
          <p role="alert">{error instanceof Error ? error.message : '未知错误'}</p>
          <button type="button" onClick={resetErrorBoundary}>重新加载界面</button>
        </section>
      </main>
    )}>
      {children}
    </ErrorBoundary>
  );
}
