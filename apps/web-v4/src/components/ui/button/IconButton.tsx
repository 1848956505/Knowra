// V4-04 IconButton
//
// 等宽方形图标按钮；复用 Button 的硬阴影 + 焦点环。**所有 5 个 variant 都被支持**：
// ghost / default 图标按钮在成熟产品里极其常见——菜单触发器、关闭按钮、「更多」、
// 下拉、排序、过滤等弱化操作都是它的主场。
//
// 必须通过 aria-label 提供无障碍名称。
//
// 5 个 variant 的语义（与 Button 同步）：
// - `default` ：中性动作。视觉：白底 + 墨边 + 墨图标。
// - `primary` ：当前页最关键的核心动作。视觉：黑底 + 白图标。
// - `accent`  ：引导用户创建 / 引入。视觉：蓝底 + 白图标。
// - `danger`  ：破坏性。视觉：白底 + 红边 + 红图标。
// - `ghost`   ：弱化（菜单触发器、关闭按钮、「更多」等首选）。视觉：无底 + 墨图标，
//              hover 时才出底色与硬阴影。

import { forwardRef, type ReactNode } from 'react';
import { Button as RAButton, type ButtonProps as RAButtonProps } from 'react-aria-components';
import { cx } from '../classnames';
import type { ButtonVariant } from '../tokens';
import styles from './Button.module.css';

export interface IconButtonProps extends Omit<RAButtonProps, 'className' | 'isPending'> {
  variant?: ButtonVariant;
  children: ReactNode;
  isPending?: boolean;
  className?: string;
}

const variantClass: Record<ButtonVariant, string> = {
  default: cx(styles.btn, styles.icon),
  primary: cx(styles.btn, styles.primary, styles.icon),
  accent: cx(styles.btn, styles.accent, styles.icon),
  danger: cx(styles.btn, styles.danger, styles.icon),
  ghost: cx(styles.btn, styles.ghost, styles.icon)
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { variant = 'default', className, isPending, children, ...rest },
  ref
) {
  return (
    <RAButton ref={ref} className={cx(variantClass[variant], className)} isPending={isPending} {...rest}>
      {children}
    </RAButton>
  );
});
