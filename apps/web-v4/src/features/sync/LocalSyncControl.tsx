import { useEffect, useRef, useState } from 'react';
import { Button, Dialog, DialogBody, TextField } from '../../components/ui';
import { useAppStore, useAppStoreApi } from '../../store/AppStoreProvider';
import styles from './LocalSyncControl.module.css';
import { BackupRestoreDialog } from './BackupRestoreDialog';
import { downloadTextFile } from '../../browser/downloadFile';

import { ConflictCard, EntityConflictCard } from './SyncConflictCards';
import type { Conflict, EntityConflict } from './syncConflictModel';
import { describeLocalSyncStatus, type SyncIssue } from './syncStatusPresentation';

interface SyncStatus {
  deviceId?: string; pendingEntities?: number; pendingAttachments?: number; attachmentPending?: string | null; entityConflict?: EntityConflict | null;
  pendingKnowledgeEntities?: number; knowledgeSyncSupported?: boolean;
  serverUrl: string | null; generation: number; phase: string; pendingNotes: number;
  lastSyncedAt: string | null; conflicts: Conflict[]; error: SyncIssue | null;
  blockedNotes: { noteId: string; title: string; message: string }[];
}
async function callSync<T = SyncStatus>(path = '', body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/local-runtime/sync${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    });
  } catch {
    throw Object.assign(new Error('无法连接本地服务，请重新打开应用后重试。'), { code: 'LOCAL_RUNTIME_UNAVAILABLE' });
  }
  const result = await response.json().catch(() => null);
  if (!result) throw Object.assign(new Error('本地服务返回异常，请重新打开应用后重试。'), { code: 'LOCAL_RUNTIME_INVALID_RESPONSE' });
  if (!response.ok) throw Object.assign(new Error(result.error?.message ?? '同步操作失败。'), { code: result.error?.code ?? 'SYNC_ACTION_FAILED' });
  return result.data;
}

function syncIssue(failure: unknown): SyncIssue {
  return failure instanceof Error
    ? { code: 'code' in failure && typeof failure.code === 'string' ? failure.code : 'SYNC_ACTION_FAILED', message: failure.message }
    : { code: 'SYNC_ACTION_FAILED', message: '同步操作失败。' };
}

export function LocalSyncControl() {
  const store = useAppStoreApi();
  const hasDraft = useAppStore(state => state.editorHasLocalChanges || state.saveState === 'saving');
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [serverUrl, setServerUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<SyncIssue | null>(null);
  const [backupOpen, setBackupOpen] = useState(false);
  const seenGeneration = useRef<number | null>(null);
  useEffect(() => {
    let stopped = false;
    let pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      try {
        const next = await callSync();
        if (stopped) return;
        setStatus(next);
        setError(current => {
          if (!current || current.code?.startsWith('LOCAL_RUNTIME_')) return null;
          if (next.serverUrl && !next.error && ['synced', 'pending'].includes(next.phase)
            && (current.code?.startsWith('SYNC_NETWORK_') || current.code?.startsWith('SYNC_CONNECTION_')
              || ['AUTH_REQUIRED', 'CLOUD_SERVICE_UNAVAILABLE', 'CLOUD_REQUEST_FAILED'].includes(current.code ?? ''))) return null;
          return current;
        });
        if (seenGeneration.current === null) seenGeneration.current = next.generation;
        else if (seenGeneration.current !== next.generation && await store.getState().refreshLocalWorkspace()) seenGeneration.current = next.generation;
      } catch { /* 状态查询失败不影响本机编辑；打开面板后手动重试会显示具体错误。 */ }
      finally { pending = false; }
    };
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 2000);
    const wake = () => { void callSync('/retry', {}).then(() => refresh()).catch(() => undefined); };
    window.addEventListener('online', wake);
    window.addEventListener('focus', wake);
    return () => { stopped = true; window.clearInterval(timer); window.removeEventListener('online', wake); window.removeEventListener('focus', wake); };
  }, [store]);
  const action = async (path: string, body: unknown) => {
    setBusy(true); setError(null);
    try { setStatus(await callSync(path, body)); await store.getState().refreshLocalWorkspace(); }
    catch (failure) {
      setError(syncIssue(failure));
      try { setStatus(await callSync()); } catch { /* 仍保留这次操作的明确错误。 */ }
    }
    finally { setBusy(false); setPassword(''); }
  };
  const presentation = describeLocalSyncStatus(status, !status?.serverUrl || error?.code?.startsWith('LOCAL_RUNTIME_') ? error : null);
  const displayedError = error ?? status?.error;
  return <>
    <button type="button" className={styles.trigger} data-tone={presentation.tone} onClick={() => { setServerUrl(status?.serverUrl ?? serverUrl); setOpen(true); }}>
      <span className={styles.marker} aria-hidden="true" />
      <span className={styles.main}>{presentation.main}</span>
      {presentation.tone !== 'success' ? <span className={styles.detail}>{presentation.detail}</span> : null}
    </button>
    <Dialog title="云端同步" isOpen={open} onOpenChange={setOpen} size="md" isPending={busy}>
      <DialogBody>
        <div className={styles.body}>
          <p>笔记和知识先保存到本机，联网后同步。目录、标签、附件、标注与知识来源一起同步；双方修改同一内容时，会保留冲突供你核对。</p>
          <form className={styles.form} onSubmit={event => { event.preventDefault(); void action('/configure', { serverUrl, username, password }); }}>
            <TextField label="云端服务地址" type="url" isRequired placeholder="https://你的服务地址" value={serverUrl} isReadOnly={Boolean(status?.serverUrl)} onChange={setServerUrl} />
            <div className={styles.columns}>
              <TextField label="登录账号" autoComplete="username" value={username} onChange={setUsername} />
              <TextField label="登录密码" type="password" autoComplete="current-password" value={password} onChange={setPassword} />
            </div>
            <p className={styles.hint}>凭据仅在本次运行中使用；重启后需要重新登录。</p>
            <div className={styles.actions}>
              <Button type="submit">{status?.serverUrl ? '更新登录并同步' : '连接并比较资料'}</Button>
              {status?.serverUrl && <><Button isDisabled={status.phase === 'disconnected'} onPress={() => { void action('/retry', {}); }}>立即同步</Button><Button isDisabled={status.phase === 'disconnected'} onPress={() => { void action('/disconnect', {}); }}>暂停云端同步</Button></>}
              <Button onPress={() => { setOpen(false); setBackupOpen(true); }}>本机备份与恢复</Button>
              <Button onPress={() => {
                void callSync<unknown[]>('/recovery').then(records => downloadTextFile('Knowra-冲突恢复记录.json', JSON.stringify(records, null, 2), 'application/json'))
                  .catch(failure => setError({ message: failure instanceof Error ? failure.message : '恢复记录导出失败' }));
              }}>导出冲突恢复记录</Button>
            </div>
          </form>
          {status?.deviceId && <details><summary>设备信息</summary><p className={styles.hint}>设备编号：{status.deviceId}</p></details>}
          <p role="status">{presentation.main} · {presentation.detail}{status?.lastSyncedAt ? ` · 上次完成 ${new Date(status.lastSyncedAt).toLocaleString('zh-CN')}` : ''}</p>
          {Boolean(status?.pendingKnowledgeEntities) && <p className={styles.hint}>知识及来源：{status?.pendingKnowledgeEntities} 项待同步。{status?.knowledgeSyncSupported === false ? '云端需要升级后才能接收；本机已保存的知识会继续保留。' : ''}</p>}
          {displayedError && <p role="alert" className={styles.error}>{displayedError.message}</p>}
          {status?.blockedNotes.map(note => <p key={note.noteId} className={styles.error}>{note.title}：{note.message}</p>)}
          {hasDraft && (status?.conflicts.length || status?.entityConflict) ? <p>请等待当前正文保存到本机后处理冲突。</p> : null}
          {status?.entityConflict && <EntityConflictCard key={status.entityConflict.id} conflict={status.entityConflict} disabled={hasDraft || busy} onResolve={(choice, rawMarkdown) => action('/resolve', { conflictId: status.entityConflict?.id, choice, rawMarkdown })} />}
          {status?.conflicts.map(conflict => <ConflictCard key={`${conflict.noteId}:${conflict.remoteRevision}`} conflict={conflict} disabled={hasDraft || busy}
            onResolve={(choice, rawMarkdown) => action('/resolve', { noteId: conflict.noteId, remoteRevision: conflict.remoteRevision, datasetEpoch: conflict.datasetEpoch, choice, rawMarkdown })} />)}
        </div>
      </DialogBody>
    </Dialog>
    <BackupRestoreDialog isOpen={backupOpen} onOpenChange={setBackupOpen} />
  </>;
}
