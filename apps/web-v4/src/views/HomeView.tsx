// V4-05 HomeView
//
// 主页的视觉结构严格对应冻结的 V4-00.5 印格主页；卡片计数、最近资料、标签和时间仍来自真实工作区数据。

import { useMemo, type ReactNode } from 'react';
import type { Note, Folder, Tag } from '@study-accelerator/web-core';
import { Button } from '../components/ui/button/Button';
import { EmptyState, LoadingState } from '../components/ui/status';
import { cx } from '../components/ui/classnames';
import {
  ArrowUpRightIcon,
  CalendarIcon,
  ClockIcon,
  FolderIcon,
  NodesIcon,
  NoteIcon,
  PlusIcon,
  RefreshIcon,
  TagIcon,
  TargetIcon,
  type IconProps
} from '../shell/icons';
import styles from './HomeView.module.css';

interface DomainCardEntry {
  id: 'materials' | 'knowledge' | 'training';
  label: string;
  description: string;
  number: string;
  Icon: (props: IconProps) => ReactNode;
  available: boolean;
}

const DOMAIN_CARDS: readonly DomainCardEntry[] = [
  {
    id: 'materials',
    label: '笔记工作台',
    description: 'Markdown 笔记的采集、编辑与整理。当前唯一可用工作域。',
    number: '01',
    Icon: FolderIcon,
    available: true
  },
  {
    id: 'knowledge',
    label: '知识工作台',
    description: '知识单元与学习目标管理。后端联调未完成。',
    number: '02',
    Icon: NodesIcon,
    available: false
  },
  {
    id: 'training',
    label: '训练工作台',
    description: '题目库与考试场景。后端联调未完成。',
    number: '03',
    Icon: TargetIcon,
    available: false
  }
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
  onOpenSearch,
  onOpenCreate,
  onOpenSchedule,
  onSelectNote
}: HomeViewProps) {
  const stats = useMemo(() => computeStats(notes, folders, tags), [notes, folders, tags]);
  const today = useMemo(() => formatToday(), []);

  if (loadState === 'loading' && notes.length === 0 && dataMode !== 'cache') {
    return (
      <div className={styles.view}>
        <HomeHeader
          id="home-title-loading"
          today={today}
          title="早安，创造者。"
          subtitle="正在连接资料服务，加载目录与笔记…"
          onOpenCreate={onOpenCreate}
          onOpenSchedule={onOpenSchedule}
        />
        <LoadingState label="正在加载资料…" />
      </div>
    );
  }

  if (loadState === 'error' && notes.length === 0) {
    return (
      <div className={styles.view}>
        <HomeHeader
          id="home-title-error"
          today={today}
          title="早安，创造者。"
          subtitle="资料服务暂时不可用，请稍后重试。"
          onOpenCreate={onOpenCreate}
          onOpenSchedule={onOpenSchedule}
        />
        <EmptyState
          title="资料加载失败"
          description={error ?? '请检查 API 端口或稍后重试。'}
          primaryAction={
            <Button variant="primary" onClick={onRetry}>
              <RefreshIcon size={14} />
              <span>重试</span>
            </Button>
          }
          secondaryAction={
            onOpenSearch ? <Button onClick={onOpenSearch}>本地搜索</Button> : undefined
          }
        />
      </div>
    );
  }

  return (
    <div className={styles.view}>
      <HomeHeader
        id="home-title"
        today={today}
        title="早安，创造者。"
        subtitle={
          loadState === 'error'
            ? '当前显示最近一次本地缓存。连接恢复后可继续编辑。'
            : '笔记沉淀、知识联结、刻意训练，集中在同一条学习流里。'
        }
        onOpenCreate={onOpenCreate}
        onOpenSchedule={onOpenSchedule}
      />

      {loadState === 'error' ? (
        <div className={styles.errorBanner} role="alert">
          <span className={styles.errorDot} aria-hidden="true" />
          <span>{error ?? '资料服务暂时不可用。'}</span>
          <Button variant="ghost" onClick={onRetry}>
            <RefreshIcon size={14} />
            <span>重试</span>
          </Button>
        </div>
      ) : null}

      <section className={styles.workbenches} aria-label="工作域">
        <div className={styles.workbenchGrid}>
          {DOMAIN_CARDS.map((entry) => (
            <WorkbenchCard
              key={entry.id}
              entry={entry}
              activeNoteCount={stats.activeNotes}
              onActivate={entry.available ? onOpenMaterials : undefined}
            />
          ))}
        </div>
      </section>

      <section className={styles.recent} aria-labelledby="home-recent-title">
        <div className={styles.recentHeader}>
          <div className={styles.recentHeading}>
            <span className={styles.recentIcon} aria-hidden="true">
              <ClockIcon size={22} />
            </span>
            <div>
              <h2 id="home-recent-title" className={styles.recentTitle}>最近编辑</h2>
              <p className={styles.recentSubtitle}>RECENT / UPDATED DESC</p>
            </div>
          </div>
          <Button
            className={styles.viewAllButton}
            onClick={onOpenMaterials}
            isDisabled={!onOpenMaterials}
          >
            查看全部
          </Button>
        </div>

        {stats.recentNotes.length === 0 ? (
          <div className={styles.recentEmpty}>
            <EmptyState
              title="还没有资料"
              description={
                isWritable
                  ? '资料创建将在 V4-06 接入；当前可先使用全局搜索。'
                  : '当前为只读模式：连接资料服务后可继续操作。'
              }
              primaryAction={onOpenSearch ? <Button onClick={onOpenSearch}>打开全局搜索</Button> : undefined}
            />
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.recentTable}>
              <thead>
                <tr>
                  <th scope="col" className={styles.indexColumn}>NO.</th>
                  <th scope="col">笔记</th>
                  <th scope="col">状态</th>
                  <th scope="col">更新时间</th>
                  <th scope="col">标签</th>
                  <th scope="col" className={styles.openColumn}>
                    <span className={styles.srOnly}>打开</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {stats.recentNotes.map((note, index) => {
                  const title = note.title || '无标题';
                  const status = noteStatus(note);
                  return (
                    <tr key={note.id} className={styles.recentRow}>
                      <td className={styles.indexColumn}>
                        <span className={styles.rowNumber}>{String(index + 1).padStart(2, '0')}</span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className={styles.docButton}
                          onClick={onSelectNote ? () => onSelectNote(note.id, title) : undefined}
                          disabled={!onSelectNote}
                        >
                          <span className={styles.docName}>
                            <span className={styles.docIcon} aria-hidden="true">
                              <NoteIcon size={14} />
                            </span>
                            <span className={styles.docTitle}>{title}</span>
                          </span>
                        </button>
                      </td>
                      <td>
                        <span className={cx(styles.noteStatus, styles[`noteStatus${status.tone}`])}>
                          <span className={styles.statusDot} aria-hidden="true" />
                          {status.label}
                        </span>
                      </td>
                      <td className={styles.updatedColumn}>
                        <time dateTime={note.updatedAt ?? note.createdAt ?? ''}>
                          {formatRecentTime(note.updatedAt ?? note.createdAt)}
                        </time>
                      </td>
                      <td>
                        <div className={styles.recentTags}>
                          {note.tagIds.length === 0 ? (
                            <span className={styles.muted}>—</span>
                          ) : (
                            note.tagIds.slice(0, 2).map((tagId) => {
                              const tag = tags.find((candidate) => candidate.id === tagId);
                              return (
                                <span key={tagId} className={styles.tag}>
                                  <TagIcon size={11} />
                                  <span>{tag?.name ?? tagId}</span>
                                </span>
                              );
                            })
                          )}
                        </div>
                      </td>
                      <td className={styles.openColumn}>
                        <button
                          type="button"
                          className={styles.openButton}
                          aria-label={`打开 ${title}`}
                          onClick={onSelectNote ? () => onSelectNote(note.id, title) : undefined}
                          disabled={!onSelectNote}
                        >
                          <ArrowUpRightIcon size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
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
}

function HomeHeader({ id, today, title, subtitle, onOpenCreate, onOpenSchedule }: HomeHeaderProps) {
  return (
    <header className={styles.header}>
      <div>
        <p className={styles.kicker}>{today}</p>
        <h1 id={id} className={styles.title}>{title}</h1>
        <p className={styles.subtitle}>{subtitle}</p>
      </div>
      <div className={styles.headerActions}>
        <Button
          className={styles.scheduleButton}
          onClick={onOpenSchedule}
          isDisabled={!onOpenSchedule}
          aria-label="打开日程"
        >
          <CalendarIcon size={17} />
          <span>日程</span>
        </Button>
        <Button
          variant="accent"
          className={styles.createButton}
          onClick={onOpenCreate}
          isDisabled={!onOpenCreate}
          aria-label="新建笔记（Ctrl+N）"
        >
          <PlusIcon size={17} />
          <span>新建笔记</span>
          <kbd>Ctrl+N</kbd>
        </Button>
      </div>
    </header>
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
      <div className={styles.workbenchHeader}>
        <span className={styles.workbenchIcon} aria-hidden="true">
          <Icon size={22} />
        </span>
        <span className={styles.cardNumber}>
          {entry.number}{locked ? ' / LOCKED' : ''}
        </span>
        {entry.available ? (
          <span className={styles.workbenchArrow} aria-hidden="true">
            <ArrowUpRightIcon size={18} />
          </span>
        ) : null}
      </div>
      <div className={styles.workbenchCopy}>
        <div className={styles.workbenchTitleRow}>
          <h2 className={styles.workbenchTitle}>{entry.label}</h2>
          {locked ? <span className={styles.lockedBadge}>即将开放</span> : null}
        </div>
        <p className={styles.workbenchDescription}>{entry.description}</p>
      </div>
      <div className={styles.workbenchStatus}>
        <span
          className={cx(styles.statusDot, entry.available ? styles.statusDotActive : styles.statusDotLocked)}
          aria-hidden="true"
        />
        <span>{entry.available ? `AVAILABLE · ${activeNoteCount} ITEMS` : 'DEPENDENCY GATED'}</span>
      </div>
    </button>
  );
}

interface Stats {
  totalNotes: number;
  activeNotes: number;
  favoriteCount: number;
  recentNotes: Note[];
}

function computeStats(notes: Note[], _folders: Folder[], _tags: Tag[]): Stats {
  const active = notes.filter((note) => !note.deleted);
  const sorted = [...active].sort((a, b) => {
    const aTime = new Date(a.updatedAt ?? a.createdAt ?? 0).getTime();
    const bTime = new Date(b.updatedAt ?? b.createdAt ?? 0).getTime();
    return bTime - aTime;
  });
  return {
    totalNotes: notes.length,
    activeNotes: active.length,
    favoriteCount: active.filter((note) => note.favorite).length,
    recentNotes: sorted.slice(0, 8)
  };
}

function noteStatus(note: Note): { label: string; tone: 'Warning' | 'Success' } {
  const raw = String(note.status ?? '').toLowerCase();
  const complete = /complete|completed|done|published|active|success/.test(raw);
  return complete ? { label: '已完成', tone: 'Success' } : { label: '待整理', tone: 'Warning' };
}

function formatToday(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'short',
    day: '2-digit'
  }).formatToParts(new Date());
  const weekday = parts.find((part) => part.type === 'weekday')?.value ?? '';
  const month = parts.find((part) => part.type === 'month')?.value ?? '';
  const day = parts.find((part) => part.type === 'day')?.value ?? '';
  return `${weekday} / ${month} ${day}`;
}

function formatRecentTime(input: string | undefined | null): string {
  if (!input) return '—';
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return input;
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (elapsedMinutes < 60) return `${Math.max(1, elapsedMinutes)}分钟前`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}小时前`;
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date).replaceAll('-', '/');
}
