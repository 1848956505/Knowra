// V4-04 Button
//
// 唯一允许直接依赖 react-aria-components 的封装层之一；业务代码通过
// `import { Button, IconButton } from '@/components/ui'` 间接访问。
//
// 5 个 variant 的语义（V4-04 反馈：必须区分"操作层级"与"业务语义"）：
// - `default` ：普通动作。视觉：白底 + 墨边 + 墨字。
// - `primary` ：操作层级。**当前容器/页面最关键的那一个动作**。视觉：黑底 + 白字。
//              典型场景：编辑器底部「保存」、对话框「确定/完成」、顶栏「发布」。
// - `accent`  ：业务语义。**主动引导用户创建 / 引入 / 发现新内容**。视觉：蓝底 + 白字。
//              典型场景：「新建」「导入」「添加资料」「开始搜索」、空状态主操作。
// - `danger`  ：破坏性。视觉：白底 + 红边 + 红字 + 红硬阴影。
//              典型场景：「删除」「移除」「归档」。
// - `ghost`   ：弱化。**次要 / 取消 / 折叠**等不应与主操作抢视觉权重的位置。
//              视觉：无底 + 墨字，hover 才出底色与硬阴影。
//
// 决策规则（避免"新建"是 black 还是 blue 的二义性）：
// 1. 是否危险 → 用 `danger`。
// 2. 当前容器最关键的那个动作（保存 / 发布 / 确定 / 完成）→ `primary`。
// 3. 引导用户创建 / 引入 / 发现（新建 / 导入 / 添加 / 开始 / 搜索 / 邀请）→ `accent`。
// 4. 次要 / 取消 / 关闭 / 返回 → `ghost`（必要时也可以是 `default`）。
// 5. 其它 → `default`。

import { forwardRef, type ReactNode } from 'react';
import { Button as RAButton, type ButtonProps as RAButtonProps } from 'react-aria-components';
import { cx } from '../classnames';
import type { ButtonVariant } from '../tokens';
import styles from './Button.module.css';

export interface ButtonProps extends Omit<RAButtonProps, 'className' | 'children' | 'isPending'> {
  /**
   * 视觉变体：
   * - `default` 普通 / `primary` 主操作 / `accent` 业务引导 / `danger` 危险 / `ghost` 弱化。
   * 决策顺序：danger → primary（核心动作）→ accent（创建/引入）→ ghost（次要/取消）→ default。
   */
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
