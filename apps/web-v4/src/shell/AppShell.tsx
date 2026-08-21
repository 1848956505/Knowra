// V4-05 AppShell
//
// 冻结主页外壳：左侧 64px ModuleRail + 点阵 FeatureStage + 底部 StatusBar。
// 主页的标题、动作和工作域入口都属于冻结主页本身，不再由一个额外 TopBar 注入。

import { type ReactNode } from 'react';
import { ModuleRail } from './ModuleRail';
import { StatusBar, type StatusPanel } from './StatusBar';
import { MobileTabs } from './MobileTabs';
import { cx } from '../components/ui/classnames';
import type { WorkDomain } from '../store/types';
import styles from './AppShell.module.css';

export interface AppShellProps {
  children: ReactNode;
  /** 当前激活的工作域（用于 Rail / MobileTabs 的 aria-current）；组件展台没有业务工作域时传 null。 */
  activeDomain: WorkDomain | null;
  onSelectDomain(domain: WorkDomain): void;
  onReturnHome(): void;
  onOpenSearch?(): void;
  onOpenCreate?(): void;
  onOpenNotifications?(): void;
  onOpenSettings?(): void;
  /** 打开组件展台（/showcase）。仅传入时，Rail 才会渲染该入口。 */
  onOpenShowcase?(): void;
  /** /showcase 路由激活态：仅用于 Rail 上组件库按钮的 aria-current。 */
  isShowcaseActive?: boolean;
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
  onOpenSearch,
  onOpenCreate,
  onOpenNotifications,
  onOpenSettings,
  onOpenShowcase,
  isShowcaseActive,
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
        onOpenSearch={onOpenSearch}
        onOpenCreate={onOpenCreate}
        onOpenNotifications={onOpenNotifications}
        onOpenSettings={onOpenSettings}
        onOpenShowcase={onOpenShowcase}
        isShowcaseActive={isShowcaseActive}
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
          onOpenSearch={onOpenSearch}
        />
      ) : null}

      <div className={styles.liveRegion} role="status" aria-live="polite">
        {liveAnnouncement ?? ''}
      </div>
    </div>
  );
}
