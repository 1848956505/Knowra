// V5 首页：以“继续编辑”为主线，旁边是真实数据的活动面板，底部是三个工作域入口。
// 所有数字、时间、标签均来自工作区数据；训练域尚未上线时保持锁定。

import { useMemo, type ReactNode } from 'react';
import { version as appVersion } from '../../../../package.json';
import type { Note, Folder, Tag } from '@study-accelerator/web-core';
import { Button } from '../components/ui/button/Button';
import { EmptyState, LoadingState } from '../components/ui/status';
import { PixelFace } from '../components/companion';
import { cx } from '../components/ui/classnames';
import { MathText } from '../components/math/MathText';
import { NotesIndexArt } from '../features/notes/NotesIndexArt';
import { notePreview } from '../features/notes/NotesIndexItemMeta';
import { NOTE_STATUS_LABELS, normalizeNoteStatus, updatedDayAge } from '../features/notes/notesIndexFilters';
import { buildNoteUpdateDistribution } from '../features/notes/notesIndexUpdateDistribution';
import { TagChip } from '../features/tags';
import {
  ArrowUpRightIcon,
  CalendarIcon,
  ClockIcon,
  FolderIcon,
  NodesIcon,
  NoteIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  TargetIcon,
  type KnowraIconProps
} from '../components/icons/knowra';
import styles from './HomeView.module.css';

interface DomainCardEntry {
  id: 'materials' | 'knowledge' | 'training';
  label: string;
  description: string;
  Icon: (props: KnowraIconProps) => ReactNode;
  available: boolean;
}

const DOMAIN_CARDS: readonly DomainCardEntry[] = [
  { id: 'materials', label: '笔记工作台', description: 'Markdown 笔记的采集、编辑与整理。', Icon: FolderIcon, available: true },
  { id: 'knowledge', label: '知识工作台', description: '整理知识候选、人工确认与来源追溯。', Icon: NodesIcon, available: true },
  { id: 'training', label: '训练工作台', description: '题目库与考试场景。后端联调未完成。', Icon: TargetIcon, available: false }
] as const;

export interface HomeViewProps {
  loadState: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  dataMode: 'loading' | 'api' | 'cache' | 'local';
  notes: Note[];
  folders: Folder[];
  tags: Tag[];
  isWritable: boolean;
  onRetry(): void;
  onOpenMaterials?(): void;
  onOpenKnowledge?(): void;
  onOpenSearch?(): void;
  onOpenCreate?(): void;
  onOpenSchedule?(): void;
  onSelectNote?(noteId: string, title: string): void;
}

export function HomeView({
  loadState,
  error,
  dataMode,
  notes,
  folders,
  tags,
  isWritable,
  onRetry,
  onOpenMaterials,
  onOpenKnowledge,
  onOpenSearch,
  onOpenCreate,
  onOpenSchedule,
  onSelectNote
}: HomeViewProps) {
  const stats = useMemo(() => computeStats(notes, folders, tags), [notes, folders, tags]);
  const greeting = useMemo(() => greetingFor(new Date()), []);
  const today = useMemo(() => formatToday(), []);

  if (loadState === 'loading' && notes.length === 0 && dataMode !== 'cache') {
    return (
      <div className={styles.view}>
        <HomeHeader id="home-title-loading" today={today} title={greeting} subtitle="正在连接资料服务，加载目录与笔记…"
          onOpenCreate={onOpenCreate} onOpenSchedule={onOpenSchedule} onOpenSearch={onOpenSearch} />
        <LoadingState label="正在加载资料…" />
      </div>
    );
  }

  if (loadState === 'error' && notes.length === 0) {
    return (
      <div className={styles.view}>
        <HomeHeader id="home-title-error" today={today} title={greeting} subtitle="资料服务暂时不可用，请稍后重试。"
          onOpenCreate={onOpenCreate} onOpenSchedule={onOpenSchedule} onOpenSearch={onOpenSearch} />
        <EmptyState
          title="资料加载失败"
          description={error ?? '请检查 API 端口或稍后重试。'}
          primaryAction={<Button variant="primary" onClick={onRetry}><RefreshIcon size={14} /><span>重试</span></Button>}
          secondaryAction={onOpenSearch ? <Button onClick={onOpenSearch}>本地搜索</Button> : undefined}
        />
      </div>
    );
  }

  const [featured, ...others] = stats.recentNotes;
  const upNext = others.slice(0, 5);

  return (
    <div className={styles.view}>
      <HomeHeader
        id="home-title"
        today={today}
        title={greeting}
        subtitle={loadState === 'error' ? '当前显示最近一次本地缓存。连接恢复后可继续编辑。' : summaryLine(stats)}
        onOpenCreate={onOpenCreate}
        onOpenSchedule={onOpenSchedule}
        onOpenSearch={onOpenSearch}
      />

      {loadState === 'error' ? (
        <div className={styles.errorBanner} role="alert">
          <span className={styles.errorDot} aria-hidden="true" />
          <span>{error ?? '资料服务暂时不可用。'}</span>
          <Button variant="ghost" onClick={onRetry}><RefreshIcon size={14} /><span>重试</span></Button>
        </div>
      ) : null}

      <div className={styles.main}>
        <section className={styles.recent} aria-labelledby="home-recent-title">
          <div className={styles.sectionHead}>
            <h2 id="home-recent-title" className={styles.sectionTitle}><ClockIcon size={16} aria-hidden="true" />最近编辑</h2>
            <Button className={styles.viewAllButton} variant="ghost" size="compact" onClick={onOpenMaterials} isDisabled={!onOpenMaterials}>查看全部</Button>
          </div>

          {!featured ? (
            <div className={styles.recentEmpty}>
              <EmptyState
                title="还没有资料"
                description={isWritable ? '创建第一篇笔记，开始整理资料与知识。' : '当前为只读模式：连接资料服务后可继续操作。'}
                primaryAction={onOpenCreate ? <Button variant="accent" onClick={onOpenCreate}>新建笔记</Button> : undefined}
                secondaryAction={onOpenSearch ? <Button onClick={onOpenSearch}>打开全局搜索</Button> : undefined}
              />
            </div>
          ) : (
            <>
              <FeaturedNote note={featured} tags={tags} onOpen={onSelectNote} />
              {upNext.length ? (
                <ul className={styles.upNext} aria-label="更多最近编辑">
                  {upNext.map(note => {
                    const title = note.title || '无标题';
                    return (
                      <li key={note.id}>
                        <button type="button" className={styles.upNextRow} onClick={onSelectNote ? () => onSelectNote(note.id, title) : undefined} disabled={!onSelectNote}>
                          <span className={styles.upNextIcon} aria-hidden="true"><NoteIcon size={14} /></span>
                          <span className={styles.upNextTitle}><MathText text={title} inlineOnly /></span>
                          <span className={styles.upNextStatus}>{statusLabel(note)}</span>
                          <time className={styles.upNextTime} dateTime={note.updatedAt ?? note.createdAt ?? ''}>{formatRecentTime(note.updatedAt ?? note.createdAt)}</time>
                          <ArrowUpRightIcon size={14} className={styles.upNextArrow} aria-hidden="true" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </>
          )}
        </section>

        <ActivityPanel stats={stats} notes={notes} tags={tags} />
      </div>

      <section className={styles.workbenches} aria-label="工作域">
        <div className={styles.workbenchGrid}>
          {DOMAIN_CARDS.map(entry => (
            <WorkbenchCard
              key={entry.id}
              entry={entry}
              activeNoteCount={stats.activeNotes}
              onActivate={entry.id === 'knowledge' ? onOpenKnowledge : entry.available ? onOpenMaterials : undefined}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

interface HomeHeaderProps {
  id: string;
  today: string;
  title: string;
  subtitle: string;
  onOpenCreate?: () => void;
  onOpenSchedule?: () => void;
  onOpenSearch?: () => void;
}

function HomeHeader({ id, today, title, subtitle, onOpenCreate, onOpenSchedule, onOpenSearch }: HomeHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.headerLead}>
        <PixelFace className={styles.headerFace} proximity={120} idleAfterMs={25000} />
        <p className={styles.kicker}>{today}<span className={styles.version}>版本 v{appVersion}</span></p>
        <h1 id={id} className={styles.title}>{title}</h1>
        <p className={styles.subtitle}>{subtitle}</p>
      </div>
      <div className={styles.headerActions}>
        {onOpenSearch ? (
          <Button className={styles.searchButton} onClick={onOpenSearch} aria-label="打开全局搜索">
            <SearchIcon size={15} />
            <span>搜索</span>
            <kbd>Ctrl+K</kbd>
          </Button>
        ) : null}
        <Button className={styles.scheduleButton} onClick={onOpenSchedule} isDisabled={!onOpenSchedule} aria-label="打开日程">
          <CalendarIcon size={16} />
          <span>日程</span>
        </Button>
        <Button variant="accent" className={styles.createButton} onClick={onOpenCreate} isDisabled={!onOpenCreate} aria-label="新建笔记（Ctrl+N）">
          <PlusIcon size={16} />
          <span>新建笔记</span>
          <kbd>Ctrl+N</kbd>
        </Button>
      </div>
    </header>
  );
}

function FeaturedNote({ note, tags, onOpen }: { note: Note; tags: Tag[]; onOpen?: (noteId: string, title: string) => void }) {
  const title = note.title || '无标题';
  const noteTags = note.tagIds.map(id => tags.find(tag => tag.id === id)).filter((tag): tag is Tag => Boolean(tag));
  const preview = notePreview(note);
  const open = onOpen ? () => onOpen(note.id, title) : undefined;
  return (
    <article className={styles.featured} aria-label="继续上次编辑">
      <div className={styles.featuredArt}><NotesIndexArt item={{ kind: 'note', note }} tags={noteTags} /></div>
      <div className={styles.featuredBody}>
        <p className={styles.eyebrow}>
          继续上次编辑 · <time dateTime={note.updatedAt ?? note.createdAt ?? ''}>{formatRecentTime(note.updatedAt ?? note.createdAt)}</time>
        </p>
        <h3 className={styles.featuredTitle}>
          <button type="button" className={styles.featuredLink} onClick={open} disabled={!open}><MathText text={title} inlineOnly /></button>
        </h3>
        {preview ? <p className={styles.featuredSummary}><MathText text={preview} inlineOnly /></p> : <p className={styles.featuredSummaryEmpty}>这篇笔记还没有内容。</p>}
        <div className={styles.featuredMeta}>
          <span className={styles.statusPill} data-status={normalizeNoteStatus(note.status)}>{statusLabel(note)}</span>
          {noteTags.slice(0, 3).map(tag => <TagChip key={tag.id} tag={tag} />)}
          <Button className={styles.continueButton} variant="accent" size="compact" onClick={open} isDisabled={!open} aria-label={`继续编辑 ${title}`}>
            继续编辑<ArrowUpRightIcon size={14} />
          </Button>
        </div>
      </div>
    </article>
  );
}

function ActivityPanel({ stats, notes, tags }: { stats: Stats; notes: Note[]; tags: Tag[] }) {
  const { days, total } = useMemo(() => buildNoteUpdateDistribution(notes), [notes]);
  const statusTotal = stats.statusSegments.reduce((sum, segment) => sum + segment.count, 0);
  return (
    <aside className={styles.activity} aria-label="活动概览">
      <dl className={styles.tiles}>
        <div><dt>笔记</dt><dd>{stats.activeNotes}</dd></div>
        <div><dt>文件夹</dt><dd>{stats.folderCount}</dd></div>
        <div><dt>标签</dt><dd>{tags.length}</dd></div>
        <div><dt>收藏</dt><dd>{stats.favoriteCount}</dd></div>
      </dl>

      <section className={styles.block} aria-label="近 12 周更新分布">
        <header className={styles.blockHead}><h3>近 12 周</h3><span>{total} 篇有更新</span></header>
        <div className={styles.heat} role="img" aria-label={`已加载笔记中，${total} 篇的最近更新时间在近 12 周内`}>
          {days.map(day => <span key={day.date} data-level={day.level} data-today={day.today || undefined} data-future={day.future || undefined} title={`${day.date}：${day.count} 篇`} />)}
        </div>
      </section>

      <section className={styles.block} aria-label="状态分布">
        <header className={styles.blockHead}><h3>状态</h3><span>{statusTotal} 篇</span></header>
        {statusTotal ? (
          <>
            <div className={styles.statusBar} role="img" aria-label={stats.statusSegments.map(item => `${item.label} ${item.count}`).join('，')}>
              {stats.statusSegments.map(item => <i key={item.key} data-status={item.key} style={{ flexGrow: item.count }} />)}
            </div>
            <ul className={styles.statusLegend}>
              {stats.statusSegments.map(item => <li key={item.key}><i data-status={item.key} aria-hidden="true" />{item.label}<b>{item.count}</b></li>)}
            </ul>
          </>
        ) : <p className={styles.muted}>暂无笔记。</p>}
      </section>

      <section className={styles.block} aria-label="常用标签">
        <header className={styles.blockHead}><h3>常用标签</h3></header>
        {stats.topTags.length ? (
          <ul className={styles.topTags}>
            {stats.topTags.map(({ tag, count }) => <li key={tag.id}><TagChip tag={tag} /><small>{count}</small></li>)}
          </ul>
        ) : <p className={styles.muted}>还没有给笔记打标签。</p>}
      </section>
    </aside>
  );
}

interface WorkbenchCardProps {
  entry: DomainCardEntry;
  activeNoteCount: number;
  onActivate?: () => void;
}

function WorkbenchCard({ entry, activeNoteCount, onActivate }: WorkbenchCardProps) {
  const Icon = entry.Icon;
  const locked = !entry.available;
  return (
    <button
      type="button"
      className={cx(styles.workbench, entry.available ? styles.workbenchActive : styles.workbenchLocked)}
      onClick={entry.available ? onActivate : undefined}
      aria-label={entry.available ? entry.label : `${entry.label}（尚未上线）`}
      aria-disabled={locked}
      disabled={locked}
    >
      <span className={styles.workbenchIcon} aria-hidden="true"><Icon size={20} /></span>
      <span className={styles.workbenchCopy}>
        <span className={styles.workbenchTitleRow}>
          <h2 className={styles.workbenchTitle}>{entry.label}</h2>
          {locked ? <span className={styles.lockedBadge}>即将开放</span> : null}
        </span>
        <span className={styles.workbenchDescription}>{entry.description}</span>
      </span>
      <span className={styles.workbenchStatus}>
        <span className={cx(styles.statusDot, entry.available ? styles.statusDotActive : styles.statusDotLocked)} aria-hidden="true" />
        {entry.available ? (entry.id === 'materials' ? `${activeNoteCount} 篇笔记` : '知识整理') : '待联调'}
      </span>
      {entry.available ? <ArrowUpRightIcon size={16} className={styles.workbenchArrow} aria-hidden="true" /> : null}
    </button>
  );
}

interface Stats {
  activeNotes: number;
  favoriteCount: number;
  folderCount: number;
  todayCount: number;
  weekCount: number;
  recentNotes: Note[];
  statusSegments: { key: string; label: string; count: number }[];
  topTags: { tag: Tag; count: number }[];
}

function computeStats(notes: Note[], folders: Folder[], tags: Tag[]): Stats {
  const active = notes.filter(note => !note.deleted);
  const recentNotes = [...active].sort((a, b) => timeOf(b) - timeOf(a)).slice(0, 8);
  const now = Date.now();
  const age = (note: Note) => updatedDayAge(note.updatedAt ?? note.createdAt, now);
  const counts = new Map<string, number>();
  const tagCounts = new Map<string, number>();
  for (const note of active) {
    const key = normalizeNoteStatus(note.status);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    for (const id of note.tagIds) tagCounts.set(id, (tagCounts.get(id) ?? 0) + 1);
  }
  const order = ['active', 'draft', 'completed', 'published', 'archived'];
  const statusSegments = [...counts.entries()]
    .sort(([a], [b]) => (order.indexOf(a) + 99) % 100 - (order.indexOf(b) + 99) % 100)
    .map(([key, count]) => ({ key, label: NOTE_STATUS_LABELS[key] ?? key, count }));
  const topTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .flatMap(([id, count]) => { const tag = tags.find(item => item.id === id); return tag ? [{ tag, count }] : []; })
    .slice(0, 6);
  return {
    activeNotes: active.length,
    favoriteCount: active.filter(note => note.favorite).length,
    folderCount: folders.length,
    todayCount: active.filter(note => age(note) === 0).length,
    weekCount: active.filter(note => { const value = age(note); return value !== null && value <= 6; }).length,
    recentNotes,
    statusSegments,
    topTags
  };
}

const timeOf = (note: Note) => new Date(note.updatedAt ?? note.createdAt ?? 0).getTime();

function statusLabel(note: Note): string {
  const key = normalizeNoteStatus(note.status);
  return NOTE_STATUS_LABELS[key] ?? key;
}

function summaryLine(stats: Stats): string {
  if (!stats.activeNotes) return '还没有笔记，从新建第一篇开始吧。';
  const today = stats.todayCount ? `今天更新了 ${stats.todayCount} 篇` : '今天还没有更新';
  return `${today}，本周 ${stats.weekCount} 篇 · 共 ${stats.activeNotes} 篇笔记。`;
}

function greetingFor(date: Date): string {
  const hour = date.getHours();
  const word = hour < 5 ? '夜深了' : hour < 11 ? '早安' : hour < 14 ? '午安' : hour < 18 ? '下午好' : '晚上好';
  return `${word}，创造者。`;
}

function formatToday(): string {
  return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date());
}

function formatRecentTime(input: string | undefined | null): string {
  if (!input) return '—';
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return input;
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (elapsedMinutes < 60) return `${Math.max(1, elapsedMinutes)}分钟前`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}小时前`;
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date).replaceAll('-', '/');
}
