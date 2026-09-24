import { useRef, type ReactNode } from 'react';
import { MenuPopover } from './Menu';
import styles from './PointMenu.module.css';

export interface PointMenuProps {
  point: { x: number; y: number } | null;
  onOpenChange(open: boolean): void;
  children: ReactNode;
}

/** 为鼠标右键或键盘菜单键提供屏幕坐标锚点，菜单视觉和交互仍由共享 Menu 提供。 */
export function PointMenu({ point, onOpenChange, children }: PointMenuProps) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  return <>
    <span ref={anchorRef} className={styles.anchor} aria-hidden="true" style={{ left: point?.x ?? 0, top: point?.y ?? 0 }} />
    <MenuPopover triggerRef={anchorRef} isOpen={Boolean(point)} onOpenChange={onOpenChange} offset={0} containerPadding={12}>
      {children}
    </MenuPopover>
  </>;
}
