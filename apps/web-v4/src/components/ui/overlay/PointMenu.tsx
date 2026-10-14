import { useRef, type ReactNode } from 'react';
import { MenuPopover } from './Menu';
import styles from './PointMenu.module.css';

export interface PointMenuProps {
  point: { x: number; y: number } | null;
  onOpenChange(open: boolean): void;
  /** 浮层定位容器的额外类名，用于调整层级或关闭入场动画。 */
  popoverClassName?: string;
  children: ReactNode;
}

/** 为鼠标右键或键盘菜单键提供屏幕坐标锚点，菜单视觉和交互仍由共享 Menu 提供。
 * 此容器不是 MenuTrigger，不会注入菜单选择后的关闭回调。
 * 内部 Menu（含子菜单）须显式接 onClose，或由既有 onAction 清除 point。
 */
export function PointMenu({ point, onOpenChange, popoverClassName, children }: PointMenuProps) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  return <>
    <span ref={anchorRef} className={styles.anchor} aria-hidden="true" style={{ left: point?.x ?? 0, top: point?.y ?? 0 }} />
    <MenuPopover triggerRef={anchorRef} isOpen={Boolean(point)} onOpenChange={onOpenChange} offset={0} containerPadding={12} className={popoverClassName}>
      {children}
    </MenuPopover>
  </>;
}
