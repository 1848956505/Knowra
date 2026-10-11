import type { ReactNode } from 'react';
import { GhostIconButton } from '../components/ui/button';
import { Popover, PopoverDialog, PopoverTrigger } from '../components/ui/overlay';
import { FocusIcon, PanelIcon, SidebarIcon, MoreHorizontalIcon } from '../components/icons/knowra';
import { StatusBar, type StatusBarProps } from './StatusBar';
import styles from './ShellToolbar.module.css';

/** 全局控制与真实保存信息。与文档内容、标签页状态分离。 */
export function ShellToolbar({ status, children }: { status: StatusBarProps; children?: ReactNode }) {
  return <div className={styles.toolbar}>
    {status.panels?.filter(panel => panel.id === 'sidebar').map(panel => <GhostIconButton key={panel.id}
      aria-label={`切换${panel.label}`} title={panel.label} aria-pressed={panel.active} onPress={panel.onToggle}>
      <SidebarIcon size={17} />
    </GhostIconButton>)}
    {children}
    <div className={styles.actions} aria-label="工作区操作">
      {status.persistenceMode === 'desktop-local' ? status.dataModeNote : null}
      {status.panels?.filter(panel => panel.id !== 'sidebar').map(panel => <GhostIconButton key={panel.id}
        aria-label={`切换${panel.label}`} title={panel.label} aria-pressed={panel.active} onPress={panel.onToggle}>
        {panel.id === 'inspector' ? <PanelIcon size={17} /> : <FocusIcon size={17} />}
      </GhostIconButton>)}
      <PopoverTrigger>
        <GhostIconButton aria-label="工作区状态" title={status.saveState === 'error' ? '保存失败，查看状态' : '工作区状态'}>
          <span className={styles.statusIndicator} data-error={status.saveState === 'error' || undefined}><MoreHorizontalIcon size={17} /></span>
        </GhostIconButton>
        <Popover placement="bottom end">
          <PopoverDialog aria-label="工作区状态">
            <StatusBar {...status} dataModeNote={status.persistenceMode === 'desktop-local' && status.dataModeNote ? <span>本地资料 · 同步操作位于顶栏</span> : status.dataModeNote} panels={[]} presentation="detail" />
          </PopoverDialog>
        </Popover>
      </PopoverTrigger>
    </div>
    <span className={styles.announcement} aria-live="polite">
      {status.saveState === 'saving' ? '保存中…' : status.saveState === 'error' ? `保存失败：${status.saveError ?? '请检查工作区状态'}` : status.saveState === 'saved' ? '已保存' : ''}
    </span>
  </div>;
}
