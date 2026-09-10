import { useEffect, useRef, useState } from 'react';
import { Button, Dialog, DialogBody } from '../../components/ui';
import { useAppStore, useAppStoreApi } from '../../store/AppStoreProvider';
import styles from './LocalSyncControl.module.css';
import { downloadTextFile } from '../../browser/downloadFile';

interface SyncNote { title: string; rawMarkdown: string; deleted: boolean }
interface Conflict {
  noteId: string; kind: string; base: SyncNote | null; local: SyncNote | null; remote: SyncNote | null;
  remoteRevision: number | null; datasetEpoch: string;
}
interface EntityValue { title?: string; name?: string; rawMarkdown?: string; deleted?: boolean; [key: string]: unknown }
interface EntityConflict {
  id: string; changedEpoch: boolean;
  items: { collection: string; id: string; base: EntityValue | null; local: EntityValue | null; remote: EntityValue | null }[];
  reasons: { collection: string; id: string; message?: string }[];
}
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
  const [backupDirectory, setBackupDirectory] = useState('');
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
              <Button onPress={() => {
                void fetch('/api/local-runtime/backup', { method: 'POST' }).then(async response => {
                  const result = await response.json(); if (!response.ok) throw new Error(result.error?.message ?? '备份失败'); setBackupDirectory(result.data.directory);
                }).catch(failure => setError(failure instanceof Error ? failure.message : '备份失败'));
              }}>创建本机备份</Button>
              <Button onPress={() => {
                void callSync<unknown[]>('/recovery').then(records => downloadTextFile('Knowra-冲突恢复记录.json', JSON.stringify(records, null, 2), 'application/json'))
                  .catch(failure => setError(failure instanceof Error ? failure.message : '恢复记录导出失败'));
              }}>导出冲突恢复记录</Button>
            </div>
          </form>
          {status?.deviceId && <details><summary>设备信息</summary><p className={styles.hint}>设备编号：{status.deviceId}</p></details>}
          {backupDirectory && <p className={styles.hint}>备份已保存（含附件和待同步修改）：{backupDirectory}</p>}
          <p role="status">{label}{status?.lastSyncedAt ? ` · 上次完成 ${new Date(status.lastSyncedAt).toLocaleString('zh-CN')}` : ''}</p>
          {(error || status?.error) && <p role="alert" className={styles.error}>{error || status?.error?.message}</p>}
          {status?.blockedNotes.map(note => <p key={note.noteId} className={styles.error}>{note.title}：{note.message}</p>)}
          {hasDraft && (status?.conflicts.length || status?.entityConflict) ? <p>请等待当前正文保存到本机后处理冲突。</p> : null}
          {status?.entityConflict && <EntityConflictCard conflict={status.entityConflict} disabled={hasDraft || busy} onResolve={(choice, rawMarkdown) => action('/resolve', { conflictId: status.entityConflict?.id, choice, rawMarkdown })} />}
          {status?.conflicts.map(conflict => <ConflictCard key={`${conflict.noteId}:${conflict.remoteRevision}`} conflict={conflict} disabled={hasDraft}
            onResolve={(choice, rawMarkdown) => action('/resolve', { noteId: conflict.noteId, remoteRevision: conflict.remoteRevision, datasetEpoch: conflict.datasetEpoch, choice, rawMarkdown })} />)}
        </div>
      </DialogBody>
    </Dialog>
  </>;
}

function ConflictCard({ conflict, onResolve, disabled }: { conflict: Conflict; disabled: boolean; onResolve(choice: string, markdown?: string): Promise<void> }) {
  const [manual, setManual] = useState(false);
  const [markdown, setMarkdown] = useState(conflict.local?.rawMarkdown ?? '');
  return <section className={styles.conflict} aria-label={`冲突：${conflict.local?.title ?? conflict.remote?.title ?? '已删除笔记'}`}>
    <h3>{conflict.local?.title ?? conflict.remote?.title ?? '已删除笔记'} · {conflict.kind === 'delete' ? '删除与修改冲突' : '双方都有修改'}</h3>
    <details><summary>查看共同基线</summary><pre>{conflict.base?.rawMarkdown ?? '没有共同基线'}</pre></details>
    <div className={styles.columns}>
      <div><h4>本机{conflict.local?.deleted ? '（已移入回收站）' : ''}</h4><pre>{conflict.local?.rawMarkdown ?? '已永久删除'}</pre></div>
      <div><h4>云端{conflict.remote?.deleted ? '（已移入回收站）' : ''}</h4><pre>{conflict.remote?.rawMarkdown ?? '已永久删除'}</pre></div>
    </div>
    <p className={styles.hint}>处理前自动保留恢复记录。其他笔记可继续同步。</p>
    <div className={styles.actions}>
      <Button isDisabled={disabled} onPress={() => { void onResolve('remote'); }}>采用云端</Button>
      <Button isDisabled={disabled} onPress={() => { void onResolve('local'); }}>采用本地</Button>
      <Button isDisabled={disabled} onPress={() => { void onResolve('copy'); }}>保留为两篇</Button>
      <Button isDisabled={disabled} onPress={() => setManual(!manual)}>手动合并</Button>
    </div>
    {manual && <div className={styles.merge}><label>合并后的正文<textarea value={markdown} onChange={event => setMarkdown(event.target.value)} rows={10} /></label><Button isDisabled={disabled} onPress={() => { void onResolve('manual', markdown); }}>保存合并结果</Button></div>}
  </section>;
}

const entityNames: Record<string, string> = { spaces: '空间', folders: '目录', tagGroups: '标签组', tags: '标签', notes: '笔记', noteVersions: '历史版本', attachments: '附件', contentAnnotations: '重点标记', annotationExclusions: '排除范围', annotationRevisions: '标注修订' };
function EntityConflictCard({ conflict, disabled, onResolve }: { conflict: EntityConflict; disabled: boolean; onResolve(choice: string, markdown?: string): Promise<void> }) {
  const notes = conflict.items.filter(item => item.collection === 'notes' && item.local);
  const [manual, setManual] = useState(false);
  const [markdown, setMarkdown] = useState(notes[0]?.local?.rawMarkdown ?? '');
  const visible = conflict.items.filter(item => !['noteVersions', 'annotationRevisions'].includes(item.collection));
  const title = notes.length === 1 ? notes[0].local?.title : '关联资料';
  const show = (value: EntityValue | null) => value === null ? '云端没有此对象或已永久删除' : value.rawMarkdown ?? JSON.stringify(value, null, 2);
  return <section className={styles.conflict} aria-label={`冲突：${title}`}>
    <h3>{title} · 关联资料需要核对</h3>
    <p>以下 {visible.length} 项本机修改属于同一组关联资料。处理前会保存完整恢复记录；确认期间暂缓这组资料上传，其他笔记可继续同步。</p>
    {conflict.changedEpoch && <p>云端资料库已恢复或重建，请仔细核对。已删除对象不会自动恢复。</p>}
    {visible.map(item => <div key={`${item.collection}:${item.id}`}>
      <h4>{entityNames[item.collection] ?? '资料'}：{item.local?.title ?? item.local?.name ?? item.remote?.name ?? item.id}</h4>
      <details><summary>查看共同基线</summary><pre>{show(item.base)}</pre></details>
      <div className={styles.columns}><div><h4>本机</h4><pre>{show(item.local)}</pre></div><div><h4>云端</h4><pre>{show(item.remote)}</pre></div></div>
    </div>)}
    <div className={styles.actions}>
      <Button isDisabled={disabled} onPress={() => { void onResolve('remote'); }}>采用云端</Button>
      <Button isDisabled={disabled} onPress={() => { void onResolve('local'); }}>采用本地</Button>
      {notes.length === 1 && <><Button isDisabled={disabled} onPress={() => { void onResolve('copy'); }}>保留为两篇</Button><Button isDisabled={disabled} onPress={() => setManual(!manual)}>手动合并</Button></>}
    </div>
    {manual && <div className={styles.merge}><label>合并后的正文<textarea value={markdown} onChange={event => setMarkdown(event.target.value)} rows={10} /></label><Button isDisabled={disabled} onPress={() => { void onResolve('manual', markdown); }}>保存合并结果</Button></div>}
  </section>;
}
