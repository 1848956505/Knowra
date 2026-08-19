// V4-05 HomeView
//
// 主页：真实数据 + 加载/空/错误/缓存四种状态 + 工作域卡 + 最近资料表 + 快速统计。
// 1. 数据从 Store 派生，loading 状态下显示 LoadingState，error 时显示 EmptyState 形态的错误卡。
// 2. 全部计数与时间由 Note/Folder/Tag 实际字段推导，不硬编码。
// 3. 工作域卡只渲染资料（已就绪）；知识库 / 试题 / 执行 / 我的 标记为尚未上线。

import { useMemo, type ReactNode } from 'react';
import type { Note, Folder, Tag } from '@study-accelerator/web-core';
import { Button } from '../components/ui/button/Button';
import { EmptyState, LoadingState, Panel } from '../components/ui/status';
import { cx } from '../components/ui/classnames';
import { ArrowRightIcon, FolderIcon, NoteIcon, RefreshIcon, TagIcon, type IconProps } from '../shell/icons';
import { PRIMARY_DOMAINS, type RailItem } from '../shell/ModuleRail';
import styles from './HomeView.module.css';

interface DomainCardEntry {
  item: RailItem;
  available: boolean;
  description: string;
}

const DOMAIN_CARDS: readonly DomainCardEntry[] = [
  ...PRIMARY_DOMAINS.filter((item) => item.id !== 'learning').map((item) => ({
    item,
    available: item.id === 'materials',
    description: item.id === 'materials'
      ? 'Markdown 资料采集、目录组织、标签与搜索。'
      : item.description
  }))
];

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
  onSelectNote?(noteId: string, title: string): void;
  /** 自定义操作按钮（来自 TopBar 主操作）。 */
  primaryAction?: ReactNode;
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
  onSelectNote,
  primaryAction
}: HomeViewProps) {
  const stats = useMemo(() => computeStats(notes, folders, tags), [notes, folders, tags]);
  const today = useMemo(() => formatToday(), []);

  // 1) 还在 loading：显示 LoadingState。
  if (loadState === 'loading' && notes.length === 0 && dataMode !== 'cache') {
    return (
      <div className={styles.view}>
        <section className={styles.header} aria-labelledby="home-title-loading">
          <div>
            <p className={styles.kicker}>{today}</p>
          <h1 id="home-title-loading" className={styles.title}>今天，从哪里继续？</h1>
            <p className={styles.subtitle}>正在连接资料服务，加载目录与笔记…</p>
          </div>
        </section>
        <LoadingState label="正在加载资料…" />
      </div>
    );
  }

  // 2) 错误 + 没有缓存：显示 EmptyState 风格的错误卡（提供重试）。
  if (loadState === 'error' && notes.length === 0) {
    return (
      <div className={styles.view}>
        <section className={styles.header} aria-labelledby="home-title-error">
          <div>
            <p className={styles.kicker}>{today}</p>
          <h1 id="home-title-error" className={styles.title}>今天，从哪里继续？</h1>
            <p className={styles.subtitle}>资料服务暂时不可用，请稍后重试。</p>
          </div>
          {primaryAction ?? null}
        </section>
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
            onOpenSearch ? (
              <Button onClick={onOpenSearch}>本地搜索</Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  return (
    <div className={styles.view}>
      <section className={styles.header} aria-labelledby="home-title">
        <div>
          <p className={styles.kicker}>{today}</p>
          <h1 id="home-title" className={styles.title}>今天，从哪里继续？</h1>
          <p className={styles.subtitle}>
            {loadState === 'error'
              ? '当前显示最近一次本地缓存。连接恢复后可继续编辑。'
              : '资料沉淀、知识联结、刻意训练，集中在同一条学习流里。'}
          </p>
        </div>
        <div className={styles.headerActions}>
          {primaryAction ?? null}
        </div>
      </section>

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

      <section className={styles.workbenches} aria-labelledby="home-workbench-title">
        <h2 id="home-workbench-title" className={styles.sectionTitle}>工作域</h2>
        <div className={styles.workbenchGrid}>
          {DOMAIN_CARDS.map((entry) => (
            <WorkbenchCard
              key={entry.item.id}
              entry={entry}
              onActivate={entry.available ? onOpenMaterials : undefined}
            />
          ))}
        </div>
      </section>

      <section className={styles.recent} aria-labelledby="home-recent-title">
        <Panel
          title="最近资料"
          headerActions={
            <span className={styles.recentMeta}>
              {stats.activeNotes} 条 / {stats.totalNotes} 总
            </span>
          }
          flush
        >
          {stats.recentNotes.length === 0 ? (
            <div className={styles.recentEmpty}>
              <EmptyState
                title="还没有资料"
                description={isWritable ? '资料创建将在 V4-06 接入；当前可先使用全局搜索。' : '当前为只读模式：连接资料服务后可继续操作。'}
                primaryAction={onOpenSearch ? (
                  <Button onClick={onOpenSearch}>打开全局搜索</Button>
                ) : undefined}
              />
            </div>
          ) : (
            <table className={styles.recentTable}>
              <thead>
                <tr>
                  <th scope="col">资料</th>
                  <th scope="col">目录</th>
                  <th scope="col">标签</th>
                  <th scope="col" className={styles.recentColUpdated}>更新时间</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentNotes.map((note) => (
                  <tr key={note.id} className={styles.recentRow}>
                    <td>
                      <button
                        type="button"
                        className={styles.docButton}
                        onClick={onSelectNote ? () => onSelectNote(note.id, note.title || '无标题') : undefined}
                        disabled={!onSelectNote}
                      >
                        <span className={styles.docName}>
                          <span className={styles.docIcon} aria-hidden="true">
                            <NoteIcon size={14} />
                          </span>
                          <span className={styles.docTitle}>{note.title || '（无标题）'}</span>
                          {note.favorite ? <span className={styles.docStar} aria-label="已收藏">★</span> : null}
                        </span>
                      </button>
                    </td>
                    <td className={styles.recentColFolder}>
                      <span className={styles.muted}>
                        <FolderIcon size={12} />
                        <span>{folderName(note.folderId, folders)}</span>
                      </span>
                    </td>
                    <td className={styles.recentColTags}>
                      {note.tagIds.length === 0 ? (
                        <span className={styles.muted}>—</span>
                      ) : (
                        note.tagIds.slice(0, 3).map((tagId) => {
                          const tag = tags.find((t) => t.id === tagId);
                          return (
                            <span key={tagId} className={styles.tag}>
                              <TagIcon size={10} />
                              <span>{tag?.name ?? tagId}</span>
                            </span>
                          );
                        })
                      )}
                    </td>
                    <td className={styles.recentColUpdated}>
                      <time className={styles.mono} dateTime={note.updatedAt ?? note.createdAt ?? ''}>
                        {formatTime(note.updatedAt ?? note.createdAt)}
                      </time>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </section>

      <p className={styles.summary} aria-label="工作区统计">
        <span>{stats.activeNotes} 条资料</span>
        <span>{folders.length} 个目录</span>
        <span>{tags.length} 个标签</span>
        <span>{stats.favoriteCount} 条收藏</span>
        <span>数据模式：{dataMode}</span>
      </p>
    </div>
  );
}

interface WorkbenchCardProps {
  entry: DomainCardEntry;
  onActivate?: () => void;
}

function WorkbenchCard({ entry, onActivate }: WorkbenchCardProps) {
  const { item, available, description } = entry;
  const Icon = item.Icon as (props: IconProps) => ReactNode;
  return (
    <button
      type="button"
      className={cx(
        styles.workbench,
        available ? styles.workbenchActive : styles.workbenchLocked
      )}
      onClick={available ? onActivate : undefined}
      aria-label={available ? item.label : `${item.label}：尚未上线`}
      aria-disabled={!available}
      disabled={!available}
    >
      <div className={styles.workbenchHeader}>
        <span className={styles.workbenchIcon} aria-hidden="true">
          <Icon size={22} />
        </span>
        {available ? (
          <span className={styles.workbenchArrow} aria-hidden="true">
            <ArrowRightIcon size={14} />
          </span>
        ) : null}
      </div>
      <h3 className={styles.workbenchTitle}>{item.label}</h3>
      <p className={styles.workbenchDescription}>{description}</p>
      <div className={styles.workbenchStatus}>
        <span className={cx(styles.statusDot, available ? styles.statusDotActive : styles.statusDotLocked)} aria-hidden="true" />
        <span>{available ? '已就绪' : '尚未上线'}</span>
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
    favoriteCount: active.filter((n) => n.favorite).length,
    recentNotes: sorted.slice(0, 8)
  };
}

function folderName(folderId: string | null, folders: Folder[]): string {
  if (!folderId) return '未分类';
  const found = folders.find((f) => f.id === folderId);
  return found?.name ?? '未分类';
}

function formatToday(): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short'
  }).format(new Date());
}

function formatTime(input: string | undefined | null): string {
  if (!input) return '—';
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return input;
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}
