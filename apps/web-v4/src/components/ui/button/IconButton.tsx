// V4-04 IconButton
//
// 等宽方形图标按钮；复用 Button 的硬阴影 + 焦点环。
// 图标通过 children 传入；必须通过 aria-label 提供无障碍名称。

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
