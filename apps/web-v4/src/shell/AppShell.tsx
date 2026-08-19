// V4-05 AppShell
//
// 印格外壳：左 ModuleRail（桌面）或底部 MobileTabs（移动）+ 顶部 TopBar + 主区 FeatureStage + 底部 StatusBar。
// 1. CSS Grid 三段：rail | feature；statusbar 横跨两列；mobile-tabs 仅 ≤767px 出现。
// 2. TopBar 与 StatusBar 自己通过 Store 派生数据；AppShell 只负责布局与回调路由。
// 3. FeatureStage 是业务区，AppShell 只包一层以便后续给页面加 padding/容器限制。

import { type ReactNode } from 'react';
import { ModuleRail } from './ModuleRail';
import { TopBar } from './TopBar';
import { StatusBar, type StatusPanel } from './StatusBar';
import { MobileTabs } from './MobileTabs';
import { cx } from '../components/ui/classnames';
import type { WorkDomain } from '../store/types';
import styles from './AppShell.module.css';

export interface AppShellProps {
  children: ReactNode;
  /** 当前激活的工作域（用于 Rail / MobileTabs 的 aria-current）。 */
  activeDomain: WorkDomain;
  onSelectDomain(domain: WorkDomain): void;
  onReturnHome(): void;
  onOpenSettings?(): void;
  /** TopBar 数据。 */
  topbar: {
    kicker?: string;
    title: string;
    subtitle?: string;
    primaryAction?: ReactNode;
    onOpenSearch(): void;
    onOpenNotifications?(): void;
    notificationCount?: number;
  };
  /** StatusBar 数据。 */
  statusbar: {
    contextLabel: string;
    charCount?: number;
    savedAt?: string | null;
    saveState?: 'idle' | 'saving' | 'saved' | 'error';
    dataMode: 'api' | 'cache' | 'local' | 'loading';
    dataModeNote?: ReactNode;
    panels?: StatusPanel[];
  };
  /** 移动端底栏（≤767px 替代 rail）。 */
  mobileTabs?: boolean;
  /** live region 用于无障碍宣告。 */
  liveAnnouncement?: string;
}

export function AppShell({
  children,
  activeDomain,
  onSelectDomain,
  onReturnHome,
  onOpenSettings,
  topbar,
  statusbar,
  mobileTabs,
  liveAnnouncement
}: AppShellProps) {
  return (
    <div className={cx(styles.shell)}>
      <a href="#feature-stage" className={styles.skipLink}>
        跳到主内容
      </a>

      <ModuleRail
        activeDomain={activeDomain}
        onSelect={onSelectDomain}
        onReturnHome={onReturnHome}
        onOpenSettings={onOpenSettings}
      />

      <TopBar
        kicker={topbar.kicker ? { text: topbar.kicker } : undefined}
        title={topbar.title}
        subtitle={topbar.subtitle}
        primaryAction={topbar.primaryAction}
        onOpenSearch={topbar.onOpenSearch}
        onOpenNotifications={topbar.onOpenNotifications}
        notificationCount={topbar.notificationCount}
      />

      <main id="feature-stage" className={cx(styles.stage)} tabIndex={-1}>
        {children}
      </main>

      <StatusBar
        contextLabel={statusbar.contextLabel}
        charCount={statusbar.charCount}
        savedAt={statusbar.savedAt}
        saveState={statusbar.saveState}
        dataMode={statusbar.dataMode}
        dataModeNote={statusbar.dataModeNote}
        panels={statusbar.panels}
      />

      {mobileTabs ? (
        <MobileTabs
          activeDomain={activeDomain}
          onSelect={onSelectDomain}
        />
      ) : null}

      <div className={styles.liveRegion} role="status" aria-live="polite">
        {liveAnnouncement ?? ''}
      </div>
    </div>
  );
}
