// V4-04 Menu
//
// 1. 行为（↑↓ 循环 / Esc 关闭 / 焦点归还 / Home/End / 字符搜索）由 React Aria 提供。
// 2. 视觉与 MenuTrigger 由本封装统一：与印格 demo 的 .menu 完全一致。

import { forwardRef, type ReactNode } from 'react';
import {
  Menu as RAMenu,
  MenuItem as RAMenuItem,
  MenuTrigger as RAMenuTrigger,
  Popover as RAPopover,
  Separator as RASeparator,
  type MenuItemProps as RAMenuItemProps,
  type MenuProps as RAMenuProps,
  type MenuTriggerProps as RAMenuTriggerProps,
  type PopoverProps as RAPopoverProps
} from 'react-aria-components';
import { cx } from '../classnames';
import styles from './Overlay.module.css';

export type MenuItemProps = Omit<RAMenuItemProps, 'className' | 'children'> & {
  icon?: ReactNode;
  /** 右侧提示键位，例如 "⌘K"。 */
  kbd?: string;
  isDanger?: boolean;
  children: ReactNode;
  className?: string;
};

export const MenuItem = forwardRef<HTMLDivElement, MenuItemProps>(function MenuItem(
  { children, icon, kbd, isDanger, className, ...rest },
  ref
) {
  return (
    <RAMenuItem
      ref={ref}
      className={cx(styles.item, className)}
      data-danger={isDanger || undefined}
      {...rest}
    >
      {icon ? <span className={styles.itemIcon}>{icon}</span> : null}
      <span>{children}</span>
      {kbd ? <span className={styles.itemKbd}>{kbd}</span> : null}
    </RAMenuItem>
  );
});

export interface MenuProps<T> extends Omit<RAMenuProps<T>, 'className' | 'children'> {
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
}

export function Menu<T extends object>({ children, className, ariaLabel, ...rest }: MenuProps<T>) {
  return (
    <RAMenu<T> aria-label={ariaLabel} className={cx(styles.menu, className)} {...rest}>
      {children}
    </RAMenu>
  );
}

export interface MenuHeaderProps {
  children: ReactNode;
  className?: string;
}

export const MenuHeader = forwardRef<HTMLDivElement, MenuHeaderProps>(function MenuHeader(
  { children, className },
  ref
) {
  return (
    <div ref={ref} className={cx(styles.menuHead, className)}>
      {children}
    </div>
  );
});

export const MenuSeparator = forwardRef<HTMLHRElement, { className?: string }>(
  function MenuSeparator({ className }, ref) {
    return <RASeparator ref={ref} className={cx(styles.separator, className)} />;
  }
);

export type MenuTriggerProps = Omit<RAMenuTriggerProps, 'children'> & {
  /**
   * 形如 [trigger, popover]。
   * React Aria 的 MenuTrigger 期望 trigger 与 Popover 平级，Popover 内部再放 Menu。
   * 不再在内部自动包裹 Popover，避免破坏 React Aria 的语义。
   */
  children: [ReactNode, ReactNode];
};

export function MenuTrigger({ children, ...rest }: MenuTriggerProps) {
  return <RAMenuTrigger {...rest}>{children}</RAMenuTrigger>;
}

/** 复用的 Popover 视觉默认值，业务代码可继续自行传入 placement / offset。 */
export const MenuPopover = forwardRef<HTMLDivElement, Omit<RAPopoverProps, 'children'> & { children: ReactNode }>(
  function MenuPopover({ children, ...rest }, ref) {
    return (
      <RAPopover ref={ref} offset={4} placement="bottom start" className={styles.popover} {...rest}>
        {children}
      </RAPopover>
    );
  }
);
