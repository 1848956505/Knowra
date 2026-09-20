import { useEffect, useMemo, useRef, useState } from 'react';
import { calculateContentHash } from '@study-accelerator/content-anchor';
import type { Note, NoteVersion, NoteVersionPage, NoteVersionPageOptions, NoteVersionSummary } from '@study-accelerator/web-core';
import { Button, Dialog, DialogBody, DialogClose, DialogFooter } from '../../components/ui';
import { TextDiff } from '../../components/ui/TextDiff';
import styles from './EditorInspector.module.css';

interface Props {
  note: Note;
  markdown: string;
  canWrite: boolean;
  onListVersions(noteId: string): Promise<NoteVersion[]>;
  onListVersionPage?(noteId: string, options?: NoteVersionPageOptions): Promise<NoteVersionPage>;
  onGetVersion(noteId: string, versionId: string): Promise<NoteVersion>;
  onRestoreVersion?(version: NoteVersion): Promise<void>;
  onSaveVersionAs?(version: NoteVersion): Promise<void>;
}

function dateLabel(value: string) {
  return new Date(value).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

/** Group only the presentation. Every immutable source snapshot stays available. */
export function groupVersionSessions(versions: NoteVersionSummary[]) {
  const groups: NoteVersionSummary[][] = [];
  for (const version of versions) {
    const previous = groups.at(-1);
    if (previous && Date.parse(previous.at(-1)!.createdAt) - Date.parse(version.createdAt) <= 5 * 60_000) previous.push(version);
    else groups.push([version]);
  }
  return groups;
}

export function VersionHistoryPanel({ note, markdown, canWrite, onListVersions, onListVersionPage, onGetVersion, onRestoreVersion, onSaveVersionAs }: Props) {
  const [versions, setVersions] = useState<NoteVersionSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<NoteVersion | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [compare, setCompare] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const requestRef = useRef(0);
  const detailRequestRef = useRef(0);
  const currentHash = useMemo(() => calculateContentHash(markdown), [markdown]);
  const groups = useMemo(() => groupVersionSessions(versions), [versions]);

  useEffect(() => {
    let active = true;
    ++requestRef.current;
    ++detailRequestRef.current;
    setDetailLoading(false);
    setListLoading(true);
    setError('');
    const request = onListVersionPage ? onListVersionPage(note.id, { limit: 20 }) : onListVersions(note.id).then((items) => ({ items, total: items.length, nextCursor: null }));
    void request.then((page) => {
      if (!active) return;
      setVersions(page.items);
      setTotal(page.total);
      setCursor(page.nextCursor);
    }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : '历史记录加载失败');
    }).finally(() => { if (active) setListLoading(false); });
    return () => { active = false; ++requestRef.current; ++detailRequestRef.current; };
  }, [note.id, note.updatedAt, onListVersionPage, onListVersions]);

  async function loadMore() {
    if (!cursor || !onListVersionPage || listLoading) return;
    const requestId = requestRef.current;
    setListLoading(true);
    setError('');
    try {
      const page = await onListVersionPage(note.id, { limit: 20, cursor });
      if (requestId !== requestRef.current) return;
      setVersions((items) => [...items, ...page.items.filter((item) => !items.some((existing) => existing.id === item.id))]);
      setTotal(page.total);
      setCursor(page.nextCursor);
    } catch (reason) {
      if (requestId === requestRef.current) setError(reason instanceof Error ? reason.message : '历史记录加载失败');
    } finally { if (requestId === requestRef.current) setListLoading(false); }
  }

  async function select(version: NoteVersionSummary) {
    const requestId = ++detailRequestRef.current;
    setSelected(null);
    setDetailLoading(true);
    setError('');
    setMessage('');
    try {
      const detail = await onGetVersion(note.id, version.id);
      if (requestId === detailRequestRef.current) setSelected(detail);
    } catch (reason) {
      if (requestId === detailRequestRef.current) setError(reason instanceof Error ? reason.message : '版本正文加载失败');
    } finally { if (requestId === detailRequestRef.current) setDetailLoading(false); }
  }

  async function act(action: 'restore' | 'saveAs') {
    if (!selected || !canWrite || pending) return;
    const handler = action === 'restore' ? onRestoreVersion : onSaveVersionAs;
    if (!handler) return;
    setPending(true);
    setError('');
    try {
      await handler(selected);
      setRestoreOpen(false);
      setMessage(action === 'restore' ? '已恢复历史正文，原正文保留在历史记录中。' : '已另存为新笔记。');
    } catch (reason) { setError(reason instanceof Error ? reason.message : '历史记录操作失败'); }
    finally { setPending(false); }
  }

  const row = (version: NoteVersionSummary) => <button key={version.id} type="button" aria-pressed={selected?.id === version.id} onClick={() => void select(version)}>
    <span>{version.contentHash === currentHash ? '当前正文' : '历史正文'}</span>
    <time dateTime={version.createdAt}>{dateLabel(version.createdAt)}</time>
  </button>;

  return <section className={`${styles.simplePanel} ${styles.versionPanel}`} aria-label="历史记录">
    <div className={styles.versionSummary}><strong>{total} 条历史记录</strong><span>相邻修改间隔 5 分钟内归组，可展开全部快照。来源快照持续保留。</span></div>
    {markdown !== note.rawMarkdown ? <p role="status">当前草稿尚未保存；差异对比包含这部分修改。</p> : null}
    {error && !restoreOpen ? <p className={styles.versionError} role="alert">{error}</p> : null}
    {message ? <p role="status">{message}</p> : null}
    {listLoading ? <p role="status">正在加载历史记录…</p> : null}
    {!listLoading && versions.length === 0 && !error ? <p className={styles.emptyPanel}>暂无历史记录。</p> : null}
    <div className={styles.versionList} aria-label="版本列表">
      {groups.map((group) => <div key={group[0].id} className={styles.versionGroup}>
        {row(group[0])}
        {group.length > 1 ? <details><summary>展开本组其余 {group.length - 1} 条快照</summary>{group.slice(1).map(row)}</details> : null}
      </div>)}
    </div>
    {cursor ? <Button isPending={listLoading} onPress={() => void loadMore()}>加载更早记录</Button> : null}
    {detailLoading ? <p role="status">正在加载版本正文…</p> : null}
    {!selected && !detailLoading && versions.length ? <p className={styles.emptyPanel}>选择一条记录查看正文或比较差异。</p> : null}
    {selected ? <>
      <div className={styles.versionActions}>
        <Button onPress={() => setCompare((value) => !value)}>{compare ? '查看历史正文' : '与当前正文对比'}</Button>
        <Button isDisabled={!canWrite || !onRestoreVersion || pending || selected.content === markdown} onPress={() => setRestoreOpen(true)}>恢复此版本</Button>
        <Button isDisabled={!canWrite || !onSaveVersionAs || pending} onPress={() => void act('saveAs')}>另存为新笔记</Button>
      </div>
      {compare ? <TextDiff before={selected.content} after={markdown} beforeLabel="所选历史正文" afterLabel="当前正文（含草稿）" /> : <article className={styles.versionPreview} aria-label="版本正文预览"><header><strong>正文快照</strong><span>{selected.content.length.toLocaleString('zh-CN')} 字符</span></header><pre>{selected.content || '（空白版本）'}</pre></article>}
    </> : null}
    <Dialog title="恢复历史正文" isOpen={restoreOpen} onOpenChange={setRestoreOpen} isPending={pending}>
      <DialogBody><p>先保存当前草稿，再恢复所选正文。恢复前的内容仍可在历史记录中找回；标题、目录和标签保持现状。关联标注会重新检查位置。</p>{error ? <p className={styles.versionError} role="alert">{error}</p> : null}</DialogBody>
      <DialogFooter><DialogClose variant="ghost">取消</DialogClose><Button variant="primary" isPending={pending} isDisabled={!canWrite} onPress={() => void act('restore')}>确认恢复</Button></DialogFooter>
    </Dialog>
  </section>;
}
