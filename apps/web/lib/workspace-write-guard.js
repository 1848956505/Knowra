export const READ_ONLY_CACHE_MESSAGE = '当前显示的是只读缓存，请在后端恢复后刷新页面再修改';
export const LOADING_WORKSPACE_MESSAGE = '资料仍在加载，请等待连接完成后再修改';

export function isWorkspaceWritable(dataMode) {
  return dataMode === 'api' || dataMode === 'local';
}

export function guardWorkspaceWrite({ dataMode, flashStatus } = {}) {
  if (isWorkspaceWritable(dataMode)) {
    return true;
  }

  const message = dataMode === 'cache'
    ? READ_ONLY_CACHE_MESSAGE
    : LOADING_WORKSPACE_MESSAGE;
  flashStatus?.(message);
  return false;
}
