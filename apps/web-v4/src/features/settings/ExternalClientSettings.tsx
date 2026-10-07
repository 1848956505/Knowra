import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiRequestError } from '@study-accelerator/web-core';
import { Button } from '../../components/ui/button/Button';
import { Badge } from '../../components/ui/status/Badge';
import { Checkbox } from '../../components/ui/input/Checkbox';
import { Select, TextField } from '../../components/ui/input';
import { Dialog, DialogBody, DialogFooter } from '../../components/ui/overlay/Dialog';
import { useAppStore } from '../../store/AppStoreProvider';
import { claudeCodeSnippet, codexSnippet, externalClients, isDesktopRuntime, type McpAuditEntry, type McpOverview, type McpPairing, type PairingScope } from './externalClients';
import styles from './SettingsView.module.css';

const time = (value: string) => new Date(value).toLocaleString('zh-CN', { hour12: false });
const statusBadge = { active: { tone: 'success', text: '有效' }, expired: { tone: 'neutral', text: '已过期' }, revoked: { tone: 'neutral', text: '已撤销' } } as const;
const message = (failure: unknown, fallback: string) => failure instanceof Error && failure.message ? failure.message : fallback;

/** 外部 AI 客户端（MCP）只在 Mac 应用的本地运行端提供；网页版不显示。 */
export function ExternalClientSettings() { return isDesktopRuntime() ? <ExternalClientPanel /> : null; }

function ExternalClientPanel() {
  const serverData = useAppStore(state => state.serverData);
  const spaceId = serverData.currentSpaceId;
  const loadWorkspace = useAppStore(state => state.loadWorkspace);
  // 直接打开或刷新设置页时工作区尚未加载（只有笔记、助手等页面会加载），这里补加载以获得当前知识空间与目录。
  useEffect(() => { if (!spaceId) void loadWorkspace().catch(() => undefined); }, [spaceId, loadWorkspace]);
  const notes = useMemo(() => serverData.notes.filter(note => !note.deleted && (!note.spaceId || note.spaceId === spaceId)), [serverData.notes, spaceId]);
  // 目录是嵌套树：用扁平索引取全部层级，并以“父 / 子”路径区分同名目录。
  const folders = useMemo(() => {
    const byId = serverData.foldersById;
    const live = Object.values(byId).filter(folder => !folder.deletedAt && (!folder.spaceId || folder.spaceId === spaceId));
    const pathOf = (id: string) => {
      const names: string[] = []; const seen = new Set<string>();
      for (let cursor: string | null | undefined = id; cursor && byId[cursor] && !seen.has(cursor); cursor = byId[cursor].parentId) { seen.add(cursor); names.unshift(byId[cursor].name); }
      return names.join(' / ');
    };
    return live.map(folder => ({ id: folder.id, name: pathOf(folder.id) })).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  }, [serverData.foldersById, spaceId]);
  const [overview, setOverview] = useState<McpOverview | null>(null);
  const [unsupported, setUnsupported] = useState(false);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [connection, setConnection] = useState<McpPairing | null>(null);
  const [revoking, setRevoking] = useState<McpPairing | null>(null);
  const [busy, setBusy] = useState(false);
  const [audit, setAudit] = useState<{ pairingId: string; items: McpAuditEntry[] } | null>(null);
  const [copied, setCopied] = useState('');
  // 创建表单
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<'library' | 'folder' | 'fixed'>('library');
  const [folderId, setFolderId] = useState('');
  const [noteId, setNoteId] = useState('');
  const [days, setDays] = useState('7');
  const [understood, setUnderstood] = useState(false);

  const refresh = useCallback(async () => {
    try { setOverview(await externalClients.overview()); setError(''); setUnsupported(false); }
    catch (failure) {
      if (failure instanceof ApiRequestError && (failure.status === 404 || failure.status === 409)) setUnsupported(true);
      else setError('无法读取外部客户端配对，请重试。');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { setLoading(true); void refresh(); }, [refresh, attempt]);

  const scopeText = (pairing: McpPairing) => pairing.scope.kind === 'library' ? '整个知识空间'
    : pairing.scope.kind === 'folder' ? `目录：${folders.find(folder => folder.id === (pairing.scope as { folderId: string }).folderId)?.name ?? '已移除目录'}`
      : `${(pairing.scope as { noteIds: string[] }).noteIds.length} 篇笔记`;

  const scope: PairingScope | null = kind === 'library' ? { kind: 'library' } : kind === 'folder' && folderId ? { kind: 'folder', folderId }
    : kind === 'fixed' && noteId ? { kind: 'fixed', noteIds: [noteId] } : null;
  const canCreate = Boolean(spaceId && scope && label.trim() && understood && !busy);

  function openCreate() {
    setLabel(''); setKind('library'); setFolderId(folders[0]?.id ?? ''); setNoteId(notes[0]?.id ?? ''); setDays('7'); setUnderstood(false);
    setError(''); setNotice(''); setCreateOpen(true);
  }
  async function create() {
    if (!canCreate || !spaceId || !scope) return;
    setBusy(true); setError('');
    try {
      const pairing = await externalClients.create({ label: label.trim(), spaceId, scope, expiresInDays: Number(days), egressConfirmed: true });
      setCreateOpen(false); setNotice(`已创建配对“${pairing.label}”。请按下面的连接方式配置客户端。`);
      await refresh(); setConnection(pairing);
    } catch (failure) { setError(message(failure, '创建配对失败。')); }
    finally { setBusy(false); }
  }
  async function revoke(pairing: McpPairing) {
    setBusy(true); setError('');
    try {
      await externalClients.revoke(pairing.pairingId);
      setRevoking(null); setConnection(current => current?.pairingId === pairing.pairingId ? null : current);
      setNotice(`已撤销“${pairing.label}”，该客户端立即无法读取。`); await refresh();
    } catch (failure) { setError(message(failure, '撤销失败，请重试。')); }
    finally { setBusy(false); }
  }
  async function toggleAudit(pairing: McpPairing) {
    if (audit?.pairingId === pairing.pairingId) { setAudit(null); return; }
    try { setAudit({ pairingId: pairing.pairingId, items: await externalClients.audit(pairing.pairingId) }); }
    catch { setError('无法读取最近调用记录。'); }
  }
  async function copy(id: string, text: string) {
    try { await navigator.clipboard.writeText(text); setCopied(id); } catch { setCopied(`${id}-failed`); }
  }

  if (unsupported) return null;
  const blocked = overview && !overview.aiEnabled ? 'AI 功能未开启，无法创建外部客户端配对。'
    : overview && !overview.egressEnabled ? '外发已被紧急停止，外部客户端暂时无法读取笔记。' : '';
  const adapter = overview?.adapter ?? null;

  return <section className={styles.group} aria-labelledby="settings-external-clients-heading">
    <h3 id="settings-external-clients-heading">外部 AI 客户端</h3>
    <div className={styles.settingList}>
      <div className={styles.settingRow}>
        <div className={styles.settingCopy}>
          <h4>外部 AI 客户端（MCP）</h4>
          <p>让 Claude Code、Codex 等本机 AI 客户端只读访问你选定范围内的笔记。每个客户端单独配对，可随时撤销，到期自动失效。</p>
          {blocked ? <p role="status">{blocked}</p> : null}
          {!blocked && overview && !spaceId ? <p role="status">正在加载知识空间，加载完成后即可添加。</p> : null}
        </div>
        <div className={styles.settingControl}>
          <Button variant="primary" size="compact" isDisabled={loading || !overview || Boolean(blocked) || !spaceId} onPress={openCreate}>添加外部客户端</Button>
        </div>
      </div>
      {overview?.items.length ? <ul className={styles.clientList} aria-label="已配对的外部客户端">
        {overview.items.map(pairing => <li key={pairing.pairingId} className={styles.clientRow}>
          <div className={styles.settingCopy}>
            <div className={styles.clientTitle}><h4>{pairing.label}</h4><Badge tone={statusBadge[pairing.status].tone}>{statusBadge[pairing.status].text}</Badge></div>
            <p className={styles.clientMeta}>{scopeText(pairing)} · 到期 {time(pairing.expiresAt)} · {pairing.lastUsedAt ? `最近使用 ${time(pairing.lastUsedAt)}` : '从未使用'} · 共调用 {pairing.calls} 次</p>
            {audit?.pairingId === pairing.pairingId ? (audit.items.length
              ? <ul className={styles.clientAudit} aria-label={`${pairing.label}最近调用`}>{audit.items.map((entry, index) => <li key={`${entry.at}-${index}`}>
                {time(entry.at)} · {entry.event === 'call' ? entry.tool : entry.event === 'created' ? '创建配对' : entry.event === 'revoked' ? '撤销配对' : '被拒绝'} · {entry.status === 'ok' ? `成功，返回 ${entry.fragments ?? 0} 个片段` : entry.code ?? entry.status ?? ''}</li>)}</ul>
              : <p className={styles.clientMeta}>还没有调用记录。</p>) : null}
          </div>
          <div className={styles.clientActions}>
            {pairing.status === 'active' ? <Button size="compact" aria-label={`查看连接方式：${pairing.label}`} onPress={() => { setCopied(''); setConnection(pairing); }}>查看连接方式</Button> : null}
            <Button size="compact" variant="ghost" aria-label={`最近调用：${pairing.label}`} onPress={() => void toggleAudit(pairing)}>最近调用</Button>
            {pairing.status === 'active' ? <Button size="compact" variant="ghost" aria-label={`撤销：${pairing.label}`} onPress={() => setRevoking(pairing)}>撤销</Button> : null}
          </div>
        </li>)}
      </ul> : null}
    </div>
    {loading ? <p className={styles.modelHint}>读取中</p> : null}
    {!loading && overview && !overview.items.length ? <p className={styles.modelHint}>还没有配对的外部客户端。</p> : null}
    {notice ? <p role="status" className={styles.modelNotice}>{notice}</p> : null}
    {error && !createOpen && !revoking ? <p role="alert" className={styles.modelError}>{error}</p> : null}
    {!loading && !overview && !unsupported ? <Button size="compact" onPress={() => setAttempt(value => value + 1)}>重试读取</Button> : null}

    <Dialog title="允许外部 AI 客户端读取笔记？" isOpen={createOpen} onOpenChange={open => { if (!busy) setCreateOpen(open); }} isPending={busy} size="md">
      <DialogBody>
        <div className={styles.dialogFields}>
          <TextField label="客户端名称" value={label} onChange={setLabel} isRequired maxLength={60} placeholder="例如：Claude Code" />
          <Select label="授权范围" selectedKey={kind} onSelectionChange={key => setKind(String(key) as typeof kind)}
            options={[{ id: 'library', label: '当前知识空间' }, { id: 'folder', label: '一个目录' }, { id: 'fixed', label: '一篇笔记' }]} />
          {kind === 'folder' ? <Select label="目录" selectedKey={folderId || null} onSelectionChange={key => setFolderId(String(key))}
            options={folders.map(folder => ({ id: folder.id, label: folder.name }))} /> : null}
          {kind === 'fixed' ? <Select label="笔记" selectedKey={noteId || null} onSelectionChange={key => setNoteId(String(key))}
            options={notes.map(note => ({ id: note.id, label: note.title || '无标题笔记' }))} /> : null}
          <Select label="有效期" selectedKey={days} onSelectionChange={key => setDays(String(key))}
            options={[{ id: '1', label: '1 天' }, { id: '7', label: '7 天（默认）' }, { id: '30', label: '30 天' }, { id: '90', label: '90 天' }]} />
          <p className={styles.dialogNote}>被读取的笔记片段会发送给该客户端所属的厂商（如 Anthropic、OpenAI），费用由客户端自己的订阅承担，不计入知境预算。只读取你选定范围内的笔记，不含标记为私密的笔记，不会修改或创建任何内容。可随时撤销，到期自动失效。</p>
          <Checkbox isSelected={understood} onChange={setUnderstood}>我了解所选范围内的笔记片段会发给该客户端所属的厂商</Checkbox>
          {error ? <p role="alert" className={styles.modelError}>{error}</p> : null}
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" isDisabled={busy} onPress={() => setCreateOpen(false)}>取消</Button>
        <Button variant="primary" isPending={busy} isDisabled={!canCreate} onPress={() => void create()}>创建配对</Button>
      </DialogFooter>
    </Dialog>

    <Dialog title={connection ? `连接方式：${connection.label}` : '连接方式'} isOpen={Boolean(connection)} onOpenChange={open => { if (!open) setConnection(null); }} size="md">
      <DialogBody>
        {connection ? <div>
          <p className={styles.warning}>配对文件相当于访问密码，请勿分享、提交到代码仓库或放进云盘。</p>
          <p className={styles.dialogNote}>配对文件：<code>{connection.pairingFile}</code></p>
          {adapter ? <>
            {([['claude', 'Claude Code（在终端运行）', claudeCodeSnippet(adapter, connection.pairingFile)],
              ['codex', 'Codex（写入 ~/.codex/config.toml）', codexSnippet(adapter, connection.pairingFile)]] as const).map(([id, title, text]) => <div key={id}>
              <div className={styles.snippetHead}><h5>{title}</h5>
                <Button size="compact" aria-label={`复制 ${id} 配置`} onPress={() => void copy(id, text)}>复制</Button></div>
              <pre className={styles.snippet} aria-label={`${id} 配置`}>{text}</pre>
              {copied === id ? <p role="status" className={styles.modelNotice}>已复制。</p> : null}
              {copied === `${id}-failed` ? <p role="alert" className={styles.modelError}>无法写入剪贴板，请手动选择上面的文字复制。</p> : null}
            </div>)}
            <p className={styles.dialogNote}>配置里只有启动命令和配对文件路径，没有令牌。客户端启动时会通过本机通道连接正在运行的知境；知境未运行时读取会失败。</p>
          </> : <p role="alert" className={styles.modelError}>此版本没有内置外部客户端适配器，无法生成连接方式。请使用包含适配器的新版应用。</p>}
        </div> : null}
      </DialogBody>
      <DialogFooter><Button variant="primary" onPress={() => setConnection(null)}>完成</Button></DialogFooter>
    </Dialog>

    <Dialog title={revoking ? `撤销“${revoking.label}”？` : '撤销配对'} isOpen={Boolean(revoking)} onOpenChange={open => { if (!open && !busy) setRevoking(null); }} isPending={busy} size="sm">
      <DialogBody>
        <p>撤销后该客户端立即无法读取笔记，配对文件会被删除。需要时可以重新创建配对。</p>
        {error ? <p role="alert" className={styles.modelError}>{error}</p> : null}
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" isDisabled={busy} onPress={() => setRevoking(null)}>取消</Button>
        <Button variant="primary" isPending={busy} onPress={() => revoking && void revoke(revoking)}>确认撤销</Button>
      </DialogFooter>
    </Dialog>
  </section>;
}
