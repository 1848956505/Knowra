// V4-06 GhostIconButton
//
// 概念：纯图标无文字按钮（"ghost icon"）。
// 视觉语言与左轨 ModuleRail 图标一致——30×30（侧栏头部）/ 40×40（rail）
// 透明方块，无边框、无硬阴影；hover 沉底加深、active translate(2px, 2px)
// 模拟按压、focus 接 --shadow-focus。
//
// 适用场景：
// - 侧栏头部"更多 / 新建"操作入口；
// - 工具条、Tab 区段尾部的纯图标操作；
// - 任何"只有图标、无文字"的次要操作入口。
//
// 与 Button/IconButton 的区别：
// - Button / IconButton 是带变体的"操作按钮"（primary/accent/ghost 等等），
//   ghost variant 是弱化的"有文字操作"；
// - GhostIconButton 是**纯图标**专用组件，**没有变体**——视觉与左轨图标对齐。

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cx } from '../classnames';
import styles from './GhostIconButton.module.css';

export interface GhostIconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'aria-label'> {
  /**
   * 必填：a11y 标签。按钮内容只有图标，必须有 aria-label 才能被屏读器识别。
   * （HTML 原生 aria-label 是 string|undefined，这里收紧为 string 强制填写。）
   */
  'aria-label': string;
  /** 必填：图标 SVG。业务代码统一从 `shell/icons` 选择。 */
  children: ReactNode;
  /**
   * 容器尺寸（px），决定方块边长。常见值：
   * - 30：侧栏头部、Tab 端点；
   * - 40：与左轨 ModuleRail 内部网格对齐；
   * - 24：紧凑列表行内嵌。
   * @default 30
   */
  size?: 24 | 30 | 40;
}

export const GhostIconButton = forwardRef<HTMLButtonElement, GhostIconButtonProps>(
  function GhostIconButton(
    {
      'aria-label': ariaLabel,
      children,
      size = 30,
      disabled,
      className,
      type,
      ...rest
    },
    ref
  ) {
    return (
      <button
        ref={ref}
        type={type ?? 'button'}
        className={cx(styles.ghost, styles[`size${size}`], className)}
        disabled={disabled}
        aria-label={ariaLabel}
        {...rest}
      >
        {children}
      </button>
    );
  }
);
