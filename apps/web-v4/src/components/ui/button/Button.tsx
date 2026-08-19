// V4-04 Button
//
// 唯一允许直接依赖 react-aria-components 的封装层之一；业务代码通过
// `import { Button, IconButton } from '@/components/ui'` 间接访问。

import { forwardRef, type ReactNode } from 'react';
import { Button as RAButton, type ButtonProps as RAButtonProps } from 'react-aria-components';
import { cx } from '../classnames';
import type { ButtonVariant } from '../tokens';
import styles from './Button.module.css';

export interface ButtonProps extends Omit<RAButtonProps, 'className' | 'children' | 'isPending'> {
  /** 视觉变体：default / primary / accent / danger / ghost。 */
  variant?: ButtonVariant;
  /** 图标（仅 icon 模式时作为主内容；其它模式可与 label 并列）。 */
  icon?: ReactNode;
  /** 提交/保存中状态，禁用按压但保留焦点。 */
  isPending?: boolean;
  children?: ReactNode;
  className?: string;
}

const variantClass: Record<ButtonVariant, string> = {
  default: styles.btn,
  primary: cx(styles.btn, styles.primary),
  accent: cx(styles.btn, styles.accent),
  danger: cx(styles.btn, styles.danger),
  ghost: cx(styles.btn, styles.ghost)
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'default', icon, children, className, isPending, ...rest },
  ref
) {
  const composed = cx(variantClass[variant], className);
  return (
    <RAButton ref={ref} className={composed} isPending={isPending} {...rest}>
      {icon}
      {children}
    </RAButton>
  );
});
