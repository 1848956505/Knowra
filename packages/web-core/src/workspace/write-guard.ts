import type { WorkspaceDataMode } from './types.js';

export const READ_ONLY_CACHE_MESSAGE = '当前显示的是只读缓存，请在后端恢复后刷新页面再修改';
export const LOADING_WORKSPACE_MESSAGE = '资料仍在加载，请等待连接完成后再修改';

export function isWorkspaceWritable(dataMode: WorkspaceDataMode): boolean {
  return dataMode === 'api' || dataMode === 'local';
}

export function guardWorkspaceWrite(input: {
  dataMode?: WorkspaceDataMode;
  flashStatus?: (message: string) => void;
} = {}): boolean {
  const dataMode = input.dataMode ?? 'loading';
  if (isWorkspaceWritable(dataMode)) return true;
  input.flashStatus?.(dataMode === 'cache' ? READ_ONLY_CACHE_MESSAGE : LOADING_WORKSPACE_MESSAGE);
  return false;
}
