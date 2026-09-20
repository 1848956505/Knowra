export interface RuntimeBackup {
  id: string; createdAt: string | null; purpose: string; fileCount: number; size: number; error?: string;
}
export interface BackupInspection {
  valid: boolean; createdAt: string; fileCount: number; size: number;
  noteCount: number; attachmentCount: number; pendingOperations: number; draftCount: number;
}
export interface BackupRestoreResult {
  datasetId: string; directory: string; protectionBackupId: string; previousDirectory: string; syncPaused: boolean;
}
export async function callBackup<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/local-runtime/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message ?? '本机备份操作失败');
  return result.data;
}
