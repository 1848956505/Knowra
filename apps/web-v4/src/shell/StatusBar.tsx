// V4-05 StatusBar
//
// 印格 32px 状态条：左侧 breadcrumb（当前位置），中部 spacer，
// 右侧字数 / 保存状态 / 数据模式 / 同步状态 / 面板开关。
// breadcrumb 由 App 派生，StatusBar 只负责数据→渲染，零业务判断。

import { forwardRef, type ReactNode } from 'react';
import type { WorkspaceDataMode } from '@study-accelerator/web-core';
import { cx } from '../components/ui/classnames';
import { FocusIcon, PanelIcon, SidebarIcon } from './icons';
import styles from './StatusBar.module.css';

export interface StatusPanel {
  id: 'sidebar' | 'inspector' | 'focus';
  label: string;
  active: boolean;
  onToggle(): void;
}

/** breadcrumb 的单段：第 0 段是 root 起点，末段是当前位置。 */
export interface PathSegment {
  /** React key；通常 `${kind}:${id}`。 */
  id: string;
  /** 显示文案（如"主页"、"笔记库"、"产品设计"、"Q3 产品规划草案"）。 */
  label: string;
  /**
   * 点击该段时应触发的回调。末段（当前位置）不传 → 渲染为静态文本。
   * 父级 App 负责把这段"跳回"的真实动作（navigate / selectFolder / selectNote）注入。
   */
  onNavigate?(): void;
  /**
   * 标记为"当前位置"。一段 path 只能有一个 current；缺省时由 StatusBar 推断末段。
   * 显式声明便于复杂场景（如同一段在多路由下都被复用为当前）。
   */
  current?: boolean;
}

export interface StatusBarProps {
  /** 当前位置的 breadcrumb；至少 1 段，第 0 段约定为"主页"或工作域根。 */
  path: PathSegment[];
  charCount?: number;
  savedAt?: string | null;
  saveState?: 'idle' | 'saving' | 'saved' | 'error';
  dataMode: WorkspaceDataMode;
  /** 真实数据 / 缓存 / 本地恢复 之外的额外业务描述（如"重试"动作）。 */
  dataModeNote?: ReactNode;
  panels?: StatusPanel[];
}

export const StatusBar = forwardRef<HTMLElement, StatusBarProps>(function StatusBar(
  { path, charCount, savedAt, saveState, dataMode, dataModeNote, panels = [] },
  ref
) {
  const modeMeta = describeDataMode(dataMode);
  return (
    <footer ref={ref} className={styles.statusbar} role="contentinfo" aria-label="状态栏">
      {path.length > 0 ? (
        <span className={styles.context} aria-label="工作区位置">
          <span className={styles.contextDot} aria-hidden="true" />
          <PathTrail path={path} />
        </span>
      ) : null}

      {typeof charCount === 'number' ? (
        <span className={cx(styles.item, styles.itemCount)}>
          <span className={styles.mono}>{charCount.toLocaleString('zh-CN')}</span> 字
        </span>
      ) : null}

      {saveState && saveState !== 'idle' ? (
        <span className={cx(styles.item, styles.itemSaved)} aria-live="polite">
          {saveState === 'saving' ? '保存中…' : saveState === 'error' ? '保存失败' : '已保存'}
          {saveState === 'saved' && savedAt ? (
            <time className={styles.mono} dateTime={savedAt}>
              {formatTime(savedAt)}
            </time>
          ) : null}
        </span>
      ) : null}

      <span className={styles.spacer} />

      <span className={styles.item} aria-label={`数据模式：${modeMeta.label}`}>
        <span className={cx(styles.square, modeMeta.squareClass)} aria-hidden="true" />
        <span>{modeMeta.label}</span>
        {dataModeNote ? <span className={styles.note}>{dataModeNote}</span> : null}
      </span>

      {panels.length > 0 ? (
        <span className={styles.switches} aria-label="面板开关">
          {panels.map((panel) => (
            <button
              key={panel.id}
              type="button"
              className={styles.switch}
              aria-pressed={panel.active}
              aria-label={`切换${panel.label}`}
              title={panel.label}
              onClick={panel.onToggle}
            >
              {panel.id === 'sidebar' ? <SidebarIcon size={16} /> : null}
              {panel.id === 'inspector' ? <PanelIcon size={16} /> : null}
              {panel.id === 'focus' ? <FocusIcon size={16} /> : null}
            </button>
          ))}
        </span>
      ) : null}
    </footer>
  );
});

/**
 * 渲染 path 数组：
 * - 中间段用 <button>，hover 时加下划线，aria-label 描述"跳转到 X"；
 * - 末段（current=true 或最后一节且无 onNavigate）用 <span>，无视觉强调，符合设计要求；
 * - 段间用 <span aria-hidden>/</span> 分隔，屏读器跳过。
 */
function PathTrail({ path }: { path: PathSegment[] }) {
  if (path.length === 0) return null;
  const lastIndex = path.length - 1;
  return (
    <span className={styles.path}>
      {path.map((segment, index) => {
        const isLast = index === lastIndex;
        const isCurrent = segment.current ?? isLast;
        const isLink = !isCurrent && typeof segment.onNavigate === 'function';
        return (
          <span key={segment.id} className={styles.pathFragment}>
            {index > 0 ? (
              <span className={styles.pathSeparator} aria-hidden="true">
                {' / '}
              </span>
            ) : null}
            {isLink ? (
              <button
                type="button"
                className={styles.pathLink}
                onClick={segment.onNavigate}
                aria-label={`跳转到「${segment.label}」`}
              >
                {segment.label}
              </button>
            ) : (
              <span
                className={styles.pathCurrent}
                aria-current={isCurrent ? 'location' : undefined}
              >
                {segment.label}
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

function describeDataMode(mode: WorkspaceDataMode) {
  switch (mode) {
    case 'api':
      return { label: '已同步', squareClass: styles.squareSync };
    case 'cache':
      return { label: '缓存只读', squareClass: styles.squareWarning };
    case 'local':
      return { label: '本地恢复', squareClass: styles.squareDanger };
    case 'loading':
    default:
      return { label: '加载中', squareClass: styles.squareNeutral };
  }
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date);
}
