/** 由受控的桌面本地服务注入；普通 Web 构建不含该标记。 */
export function readRuntimeConfig() {
  const config = (globalThis as { knowraRuntime?: { persistenceMode?: string; datasetId?: string } }).knowraRuntime;
  const local = config?.persistenceMode === 'desktop-local';
  const datasetId = config?.datasetId;
  return {
    persistenceMode: local ? 'desktop-local' as const : 'remote' as const,
    cacheSuffix: local && datasetId ? `:desktop:${datasetId}` : ''
  };
}
