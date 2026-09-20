import { useEffect, useRef, useState } from 'react';
import { Button, Dialog, DialogBody } from '../../components/ui';
import { useAppStore, useAppStoreApi } from '../../store/AppStoreProvider';
import styles from './LocalSyncControl.module.css';
import { BackupRestoreDialog } from './BackupRestoreDialog';
import { downloadTextFile } from '../../browser/downloadFile';

import { ConflictCard, EntityConflictCard } from './SyncConflictCards';
import type { Conflict, EntityConflict } from './syncConflictModel';

interface SyncStatus {
  deviceId?: string; pendingEntities?: number; pendingAttachments?: number; attachmentPending?: string | null; entityConflict?: EntityConflict | null;
  serverUrl: string | null; generation: number; phase: string; pendingNotes: number;
  lastSyncedAt: string | null; conflicts: Conflict[]; error: { message: string } | null;
  blockedNotes: { noteId: string; title: string; message: string }[];
}
async function callSync<T = SyncStatus>(path = '', body?: unknown): Promise<T> {
  const response = await fetch(`/api/local-runtime/sync${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message ?? '同步操作失败');
  return result.data;
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
  const [error, setError] = useState('');
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
    setBusy(true); setError('');
    try { setStatus(await callSync(path, body)); await store.getState().refreshLocalWorkspace(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : '操作失败'); }
    finally { setBusy(false); setPassword(''); }
  };
  const label = !status?.serverUrl ? '连接云端' : status.phase === 'disconnected' ? '云端同步已暂停' : status.phase === 'syncing' ? '正在同步…'
    : status.entityConflict ? '关联资料待处理冲突' : status.conflicts.length ? `${status.conflicts.length} 篇待处理冲突` : status.error ? '同步已暂停'
      : status.attachmentPending ? '附件等待重试' : (status.pendingEntities ?? status.pendingNotes) ? `${status.pendingEntities ?? status.pendingNotes} 项待同步` : '云端已同步';
  return <>
    <button className={styles.trigger} onClick={() => { setServerUrl(status?.serverUrl ?? serverUrl); setOpen(true); }}>{label}</button>
    <Dialog title="云端同步" isOpen={open} onOpenChange={setOpen} size="md" isPending={busy}>
      <DialogBody>
        <div className={styles.body}>
          <p>笔记先保存到本机，联网后同步。目录、标签、附件、重点标记和回收站随笔记一起同步。</p>
          <form className={styles.form} onSubmit={event => { event.preventDefault(); void action('/configure', { serverUrl, username, password }); }}>
            <label>云端服务地址<input type="url" required placeholder="https://你的服务地址" value={serverUrl} readOnly={Boolean(status?.serverUrl)} onChange={event => setServerUrl(event.target.value)} /></label>
            <div className={styles.columns}>
              <label>登录账号<input autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} /></label>
              <label>登录密码<input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} /></label>
            </div>
            <p className={styles.hint}>凭据仅在本次运行中使用；重启后需要重新登录。</p>
            <div className={styles.actions}>
              <Button type="submit">{status?.serverUrl ? '更新登录并同步' : '连接并比较资料'}</Button>
              {status?.serverUrl && <><Button isDisabled={status.phase === 'disconnected'} onPress={() => { void action('/retry', {}); }}>立即同步</Button><Button isDisabled={status.phase === 'disconnected'} onPress={() => { void action('/disconnect', {}); }}>暂停云端同步</Button></>}
              <Button onPress={() => { setOpen(false); setBackupOpen(true); }}>本机备份与恢复</Button>
              <Button onPress={() => {
                void callSync<unknown[]>('/recovery').then(records => downloadTextFile('Knowra-冲突恢复记录.json', JSON.stringify(records, null, 2), 'application/json'))
                  .catch(failure => setError(failure instanceof Error ? failure.message : '恢复记录导出失败'));
              }}>导出冲突恢复记录</Button>
            </div>
          </form>
          {status?.deviceId && <details><summary>设备信息</summary><p className={styles.hint}>设备编号：{status.deviceId}</p></details>}
          <p role="status">{label}{status?.lastSyncedAt ? ` · 上次完成 ${new Date(status.lastSyncedAt).toLocaleString('zh-CN')}` : ''}</p>
          {(error || status?.error) && <p role="alert" className={styles.error}>{error || status?.error?.message}</p>}
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
